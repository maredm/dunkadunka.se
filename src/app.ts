import { Audio, computeFFT, computeIFFT, updatedFFT, computeFFTFromIR, db, FFTResult, groupDelays, ImpulseResponseResult, loadAudioFromFilename, rms, smoothFFT, twoChannelFFT, twoChannelImpulseResponse, dbToLinear } from "./audio";
import { Farina, plotDistortion, plotTHD } from "./farina";
import { storage } from "./storage";
import { audio } from "./audio";
import "./device-settings";
import { linspace, max, nextPow2, closest, abs } from "./math";
import { COLORS, plot } from "./plotting";
import { AudioRecorder } from "./recorder";
import { download, convertToIXML } from "./wave";
import { BiquadCoefficients, firToMinPhase, generateTargetCurve, getFrequencyResponse, createBiquadCoefficients } from "./filter";

console.debug("App module loaded");

const fileMap: Map<string, Audio> = new Map();
const root = document.documentElement;
const uiColor = "#0366d6";
root.style.setProperty('--color', uiColor);

let tabCounter = 0;
const tabsContainer = document.getElementById('tabs-outer') as HTMLElement;
const tabsInnerContainer = document.getElementById('tabs') as HTMLElement;
const tabContents = document.getElementById('tab-contents') as HTMLElement;
const responseFileUploadInput = document.getElementById('responseFileUpload') as HTMLInputElement;
const referenceFileUploadInput = document.getElementById('referenceFileUpload') as HTMLInputElement;
const analyzeUploadBtn = document.getElementById('analyzeUploadBtn') as HTMLButtonElement;

// Polar upload controls
const polarReferenceFileInput = document.getElementById('polarReferenceFile') as HTMLInputElement;
const polarMeasurementsEl = document.getElementById('polarMeasurements') as HTMLElement;
const addPolarMeasurementBtn = document.getElementById('addPolarMeasurementBtn') as HTMLButtonElement;
const analyzePolarBtn = document.getElementById('analyzePolarBtn') as HTMLButtonElement;
const polarStatusEl = document.getElementById('polarStatus') as HTMLElement;


type PolarMeasurement = { angleDeg: number; file: File };

function normalizeAngleDeg(angleDeg: number): number {
    let a = angleDeg % 360;
    if (a < 0) a += 360;
    return a;
}

const statusMessage = document.getElementById('statusMessage') as HTMLElement;
function setStatusMessage(message: string, isError: boolean = false): void {
    statusMessage.textContent = message;
    statusMessage.style.color = isError ? '#d73a49' : '#28a745';
}

// ============================================================================
// Acquisition Tab Functionality
// ============================================================================

interface AcquisitionState {
    audioContext: AudioContext | null;
    mediaRecorder: MediaRecorder | null;
    recordedChunks: Blob[];
    oscillatorNode: OscillatorNode | null;
    playbackSource: AudioBufferSourceNode | null;
    isRecording: boolean;
}

const acquisitionState: AcquisitionState = {
    audioContext: null,
    mediaRecorder: null,
    recordedChunks: [],
    oscillatorNode: null,
    playbackSource: null,
    isRecording: false
};

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const playBtn = document.getElementById('playBtn') as HTMLButtonElement;
const stopPlayBtn = document.getElementById('stopPlayBtn') as HTMLButtonElement;
const sweepStartFreqInput = document.getElementById('sweepStartFreq') as HTMLInputElement;
const sweepEndFreqInput = document.getElementById('sweepEndFreq') as HTMLInputElement;
const sweepDurationInput = document.getElementById('sweepDuration') as HTMLInputElement;
const recordingStatusEl = document.getElementById('recordingStatus') as HTMLElement;
const recordingMeterEl = document.getElementById('recordingMeter') as HTMLElement;
const recordingVisualizationEl = document.getElementById('recordingVisualization') as HTMLElement;
const recordedAudioContainer = document.getElementById('recordedAudioContainer') as HTMLElement;
const recordedAudioEl = document.getElementById('recordedAudio') as HTMLAudioElement;
const analyzeRecordingBtn = document.getElementById('analyzeRecordingBtn') as HTMLButtonElement;
const viewWaveformBtn = document.getElementById('viewWaveformBtn') as HTMLButtonElement;
const channelSelectionContainer = document.getElementById('channelSelectionContainer') as HTMLElement;
const channelSelect = document.getElementById('channelSelect') as HTMLSelectElement;

async function initializeAudioContext(): Promise<AudioContext> {
    if (!acquisitionState.audioContext) {
        acquisitionState.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (acquisitionState.audioContext.state === 'suspended') {
        await acquisitionState.audioContext.resume();
    }
    return acquisitionState.audioContext;
}

async function detectAndSetupChannels(): Promise<void> {
    try {
        // Request audio input to check channel count
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });

        const audioContext = await initializeAudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        // Get channel count from the stream
        const channelCount = source.mediaStream.getAudioTracks()[0].getSettings()?.channelCount || 1;

        // Stop the stream as we only need it for channel detection
        stream.getTracks().forEach(track => track.stop());

        // Populate channel selection
        channelSelect.innerHTML = '';
        for (let i = 0; i < channelCount; i++) {
            const option = document.createElement('option');
            option.value = i.toString();
            const channelNames = ['Left', 'Right', 'Center', 'LFE', 'Back Left', 'Back Right'];
            option.textContent = `Channel ${i + 1}${channelNames[i] ? ` (${channelNames[i]})` : ''}`;
            channelSelect.appendChild(option);
        }

        // Show channel selection only if more than 1 channel
        if (channelCount > 1) {
            channelSelectionContainer.style.display = 'flex';
        } else {
            channelSelectionContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Error detecting channels:', error);
        channelSelectionContainer.style.display = 'none';
    }
}

// Detect channels when the acquisition tab is opened
tabsContainer.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('tab') && target.dataset.tab === 'acquisition') {
        detectAndSetupChannels();
    }
});

let recorded = [Float32Array.from([]), Float32Array.from([])];

async function startRecordingAndPlayback(): Promise<void> {
    try {
        const audioContext = await initializeAudioContext();

        // Generate and play sweep
        const startFreq = parseFloat(sweepStartFreqInput.value);
        const endFreq = parseFloat(sweepEndFreqInput.value);
        const duration = parseFloat(sweepDurationInput.value);

        // Pre and post recording buffers (in seconds)
        const preRecordTime = 0.5;  // Start recording 0.5s before playback
        const postRecordTime = 1.0; // Continue recording 1s after playback ends
        const totalRecordTime = preRecordTime + duration + postRecordTime;

        const [sweepSignal, ,] = audio.chirp(startFreq, endFreq, duration);

        // Create audio buffer from sweep signal
        const audioBuffer = audioContext.createBuffer(1, sweepSignal.length, audioContext.sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        channelData.set(sweepSignal);

        // Create gain nodes for monitoring
        const sourceGain = audioContext.createGain();
        sourceGain.gain.value = 0.5;

        // Start recording
        recordingStatusEl.textContent = `Recording for ${totalRecordTime.toFixed(1)}s...`;

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });

        const recorder = new AudioRecorder(audioContext.createMediaStreamSource(stream));
        const recorded = recorder.record(totalRecordTime);

        // Update UI
        startBtn.disabled = true;
        stopBtn.disabled = false;
        playBtn.disabled = true;
        sweepStartFreqInput.disabled = true;
        sweepEndFreqInput.disabled = true;
        sweepDurationInput.disabled = true;

        // Start playback after pre-record time
        setTimeout(() => {
            acquisitionState.playbackSource = audioContext.createBufferSource();
            acquisitionState.playbackSource.buffer = audioBuffer;
            acquisitionState.playbackSource.connect(sourceGain);
            sourceGain.connect(audioContext.destination);
            acquisitionState.playbackSource.start();
        }, preRecordTime * 1000);

        await recorded.then(data => {
            const audio = Audio.fromSamples(data[0], 48000, { filename: `Recording ${new Date().toISOString()}` });
            const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            const li = createListItem(audio, id);
            fileMap.set(id, audio);
            document.getElementById('fileList')?.appendChild(li);
            console.log('Recorded audio saved with id:', id);
            saveWaveformsToStorage(fileMap);

            switchTab('upload');
        }).then(() => {
            // Any cleanup code if needed
            stopRecording();
            // Create Audio object and save.
        });
    } catch (error) {
        console.error('Error starting recording:', error);
        recordingStatusEl.textContent = `Error: ${(error as Error).message}`;
        recordingStatusEl.style.color = '#d73a49';
    }
}

async function playbackOnly(): Promise<void> {
    try {
        const audioContext = await initializeAudioContext();

        const startFreq = parseFloat(sweepStartFreqInput.value);
        const endFreq = parseFloat(sweepEndFreqInput.value);
        const duration = parseFloat(sweepDurationInput.value);

        const [sweepSignal] = audio.chirp(startFreq, endFreq, duration);

        // Create audio buffer from sweep signal
        const audioBuffer = audioContext.createBuffer(1, sweepSignal.length, audioContext.sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        channelData.set(sweepSignal);

        // Create gain node
        const sourceGain = audioContext.createGain();
        sourceGain.gain.value = 0.5;

        // Connect and start playback
        acquisitionState.playbackSource = audioContext.createBufferSource();
        acquisitionState.playbackSource.buffer = audioBuffer;
        acquisitionState.playbackSource.connect(sourceGain);
        sourceGain.connect(audioContext.destination);
        acquisitionState.playbackSource.start();

        recordingStatusEl.textContent = `Playing sweep...`;
        recordingStatusEl.style.color = '#0366d6';

        playBtn.disabled = true;
        stopPlayBtn.disabled = false;

        setTimeout(() => {
            stopPlayback();
        }, (duration + 0.5) * 1000);

    } catch (error) {
        console.error('Error during playback:', error);
        recordingStatusEl.textContent = `Error: ${(error as Error).message}`;
        recordingStatusEl.style.color = '#d73a49';
    }
}

function stopRecording(): void {
    recordingStatusEl.textContent = 'Recording complete. Ready to analyze.';
    recordingStatusEl.style.color = '#28a745';

    // Update UI
    startBtn.disabled = false;
    stopBtn.disabled = true;
    playBtn.disabled = false;
    sweepStartFreqInput.disabled = false;
    sweepEndFreqInput.disabled = false;
    sweepDurationInput.disabled = false;

    recordedAudioContainer.style.display = 'block';
}

function stopPlayback(): void {
    if (acquisitionState.playbackSource) {
        try {
            acquisitionState.playbackSource.stop();
        } catch (e) {
            // Already stopped
        }
    }

    recordingStatusEl.textContent = 'Playback stopped.';
    playBtn.disabled = false;
    stopPlayBtn.disabled = true;
}

const measurementAngleInput = document.getElementById('measurementAngle') as HTMLInputElement;
const measurementLocationInput = document.getElementById('measurementLocation') as HTMLInputElement;
const measurementCommentInput = document.getElementById('measurementComment') as HTMLInputElement;
const downloadRecordingBtn = document.getElementById('downloadRecordingBtn') as HTMLButtonElement | null;

downloadRecordingBtn?.addEventListener('click', () => {
    try {
        download(recorded[0], 48000, 'recorded_audio.wav',
            {},
            convertToIXML(`
        <ANGLE>${measurementAngleInput.value}</ANGLE>
        <LOCATION>${measurementLocationInput.value}</LOCATION>
        <COMMENT>${measurementCommentInput.value}</COMMENT>
        <STIMULUS_TYPE>chirp</STIMULUS_TYPE>
        <STIMULUS_START_FREQ>${sweepStartFreqInput.value}</STIMULUS_START_FREQ>
        <STIMULUS_END_FREQ>${sweepEndFreqInput.value}</STIMULUS_END_FREQ>
        <STIMULUS_DURATION>${sweepDurationInput.value}</STIMULUS_DURATION>
        <STIMULUS_FADE>0.01</STIMULUS_FADE>
        <STIMULUS_SAMPLE_RATE>48000</STIMULUS_SAMPLE_RATE>
        <ORIGIN>Acquisition Module</ORIGIN>`));
    } catch (err) {
        console.error('Failed to create/download recording:', err);
        alert('Failed to download recording: ' + (err as Error).message);
    }
});

const downloadSweepBtn = document.getElementById('downloadSweepBtn') as HTMLButtonElement | null;

downloadSweepBtn?.addEventListener('click', () => {
    try {
        download(recorded[0], 48000, 'reference_audio.wav',
            {},
            convertToIXML(`
        <STIMULUS>
            <TYPE>chirp</TYPE>
            <START>${sweepStartFreqInput.value}</START>
            <END>${sweepEndFreqInput.value}</END>
            <FADE>0.01</FADE>
            <DURATION>${sweepDurationInput.value}</DURATION>
            <SAMPLE_RATE>48000</SAMPLE_RATE>
        </STIMULUS>
        <ORIGIN>Acquisition Module</ORIGIN>`));
    } catch (err) {
        console.error('Failed to create/download recording:', err);
        alert('Failed to download recording: ' + (err as Error).message);
    }
});
// Event listeners for acquisition controls
startBtn.addEventListener('click', startRecordingAndPlayback);
stopBtn.addEventListener('click', stopRecording);
playBtn.addEventListener('click', playbackOnly);
stopPlayBtn.addEventListener('click', stopPlayback);

analyzeRecordingBtn.addEventListener('click', async () => {
    console.log('Analyzing recording...');

    try {
        const recordedAudio = Audio.fromSamples(recorded[0], 48000);

        // Generate the chirp sweep as reference data
        const startFreq = parseFloat(sweepStartFreqInput.value);
        const endFreq = parseFloat(sweepEndFreqInput.value);
        const duration = parseFloat(sweepDurationInput.value);

        const [sweepSignal] = audio.chirp(startFreq, endFreq, duration);
        const referenceAudio = Audio.fromSamples(sweepSignal, 48000);

        // Add timestamp to recording name
        const now = new Date();
        const dateTime = now.toLocaleString('sv-SE', {
            year: '2-digit',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(',', '');
        const recordingName = `${dateTime}`;

        createAnalysisTab(
            recordedAudio.applyGain(1 / 16384),
            referenceAudio.applyGain(1 / 16384),
            recordingName,
            `${startFreq}-${endFreq}Hz`,
        );
        //

    } catch (error) {
        console.error('Error analyzing recording:', error);
        alert('Error analyzing recording: ' + (error as Error).message);
    }
});

// Save state when the user attempts to close or reload the window
window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
    try {
        saveState();
    } catch (err) {
        console.error('Failed to save state on beforeunload:', err);
    }
    // If you want to prompt the user to confirm leaving (browser-dependent), uncomment:
    // e.preventDefault();
    // e.returnValue = '';
});

// Tab switching
tabsContainer.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    if (target.classList.contains('tab-close')) {
        const tab = target.parentElement as HTMLElement;
        const tabId = tab.dataset.tab;
        if (tabId == 'upload') return;

        console.debug('Closing tab', tabId);
        tab.remove();
        document.querySelector(`[data-content="${tabId}"]`)?.remove();
        storage.removeItem(`analysis-${tabId}`).catch(err => console.error('Failed to remove analysis from storage:', err));

        // Activate upload tab if current was closed
        if (tab.classList.contains('active')) {
            switchTab('upload');
        }
        saveState();
        e.stopPropagation();
    } else if (target.classList.contains('tab')) {
        const tabId = target.dataset.tab;
        if (tabId) {
            switchTab(tabId);
        }
    }
});

function switchTab(tabId: string): void {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
    document.querySelector(`[data-content="${tabId}"]`)?.classList.add('active');
}


function compute(computation: Function, ...message: any[]): Promise<any> {
    const delegate = () => {
        onmessage = ({ data: { computation, message } }) => {
            const wrapper = (fn: any) => Function('"use strict"; return (' + fn.toString() + ')')();
            const result = wrapper(computation)(...message);
            postMessage(result);
        };
    }
    const functionBody = delegate.toString().replace(/^[^{]*{\s*/, '').replace(/\s*}[^}]*$/, '');
    return new Promise((resolve, reject) => {
        const worker = new Worker(URL.createObjectURL(
            new Blob([functionBody], { type: 'text/javascript' })
        ));
        worker.onmessage = ({ data }) => {
            resolve(data);
            worker.terminate();
        };
        worker.onerror = worker.onmessageerror = reject;
        worker.postMessage({ computation: computation.toString(), message });
        return worker;
    });
}


function createAnalysisTab(responseData: Audio, referenceData: Audio | null, filename: string, referenceFilename: string | null): void {
    setStatusMessage('Creating analysis tab...');

    tabCounter++;
    const tabId = `analysis-${tabCounter}`;
    let shortName = filename.length > 20 ? filename.substring(0, 17) + '...' : filename;
    if (referenceFilename != null) {
        const shortReferenceName = referenceFilename?.length > 20 ? referenceFilename.substring(0, 17) + '...' : referenceFilename;
        shortName += ' / ' + shortReferenceName;
    }
    // Create tab button
    const tab = document.createElement('button');
    tab.className = 'tab tab-closable tab-loading';
    tab.dataset.tab = tabId;
    tab.innerHTML = `<span class="tab-icon-analysis"></span>${shortName} <span class="tab-close">✕</span>`;
    tabsInnerContainer.appendChild(tab);

    // Update HTML.
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {

            // Create tab content
            const content = document.createElement('div');
            content.className = 'tab-content';
            content.dataset.content = tabId;
            content.innerHTML = `
    <!-- nav class="tab-menu-bar">
                <div>
                    <label for="smoothing-${tabId}">Smoothing</label>
                    <select id="smoothing-${tabId}" class="smoothing-select" aria-label="Smoothing factor">
                        <option value="0">None</option>
                        <option value="1/3">1/3 octave</option>
                        <option value="1/6" selected>1/6 octave</option>
                        <option value="1/12">1/12 octave</option>
                        <option value="1/24">1/24 octave</option>
                        <option value="1/48">1/48 octave</option>
                    </select>
                </div>
            </nav> <h5 class="text-xs italic text-gray-600">Frequency Response Analysis of ${filename}${referenceFilename ? ' / ' + referenceFilename : ''}</h5 -->
        <button class="sidecar-toggle" id="sidebar-toggle-${tabId}" title="Toggle Sidecar">Open settings pane</button>
        <div class="flex h-full">
            <div class="flex-none w-86 border-r border-[#ddd] p-2 relative sidecar" style="transition:50ms linear;">
                <div class="section">
                    <div class="title">Generate FIR Filter</div>
                    <div class="param-row" style="margin-bottom: 8px;">
                        <label for="fir-freq-start-${tabId}" style="font-size: 12px;">Freq Start (Hz):</label>
                        <input type="number" id="fir-freq-start-${tabId}" min="10" max="20000" value="100" class="param-input" style="width: 100%; font-size: 12px;">
                    </div>
                    <div class="param-row" style="margin-bottom: 8px;">
                        <label for="fir-freq-end-${tabId}" style="font-size: 12px;">Freq End (Hz):</label>
                        <input type="number" id="fir-freq-end-${tabId}" min="10" max="20000" value="20000" class="param-input" style="width: 100%; font-size: 12px;">
                    </div>
                    <div class="param-row" style="margin-bottom: 8px;">
                        <label for="fir-taps-${tabId}" style="font-size: 12px;">Filter Taps:</label>
                        <input type="number" id="fir-taps-${tabId}" min="32" max="8192" value="2048" class="param-input" style="width: 100%; font-size: 12px;">
                    </div>
                    <div class="param-row" style="margin-bottom: 8px;">
                        <label for="fir-epsilon-${tabId}" style="font-size: 12px;">Regularization (β):</label>
                        <input type="number" id="fir-epsilon-${tabId}" min="0.000001" max="1" step="0.000001" value="0.1" class="param-input" style="width: 100%; font-size: 12px;">
                    </div>
                    <div class="param-row" style="margin-bottom: 8px;">
                        <label for="fir-target-${tabId}" style="font-size: 12px;">Target Curve:</label>
                        <select id="fir-target-${tabId}" class="param-input" style="width: 100%; font-size: 12px;">
                            <option value="flat">Flat (0 dB)</option>
                            <option value="tilt">-1 dB/decade Tilt</option>
                            <option value="harman">Harman Target</option>
                        </select>
                    </div>
                    <button id="generate-fir-${tabId}" class="button-custom button-custom-primary" style="width: 100%; margin-top: 8px; font-size: 12px;">Generate & Download Filter</button>
                    <p id="fir-status-${tabId}" style="margin-top: 8px; font-size: 11px; color: #666;"></p>
                </div>
                <div class="section">
                    <div class="title">Plots</div>
                    <ul class="list" id="plot-list-${tabId}">
                        <!--li><input type="checkbox" id="checkbox-magnitude-${tabId}" alt="show/hide" checked><label for="checkbox-magnitude-${tabId}">Magnitude</label></li>
                        <li><input type="checkbox" id="checkbox-phase-${tabId}" alt="show/hide" checked><label for="checkbox-phase-${tabId}">Phase</label></li>
                        <li><input type="checkbox" id="checkbox-ir-${tabId}" alt="show/hide" checked><label for="checkbox-ir-${tabId}">Impulse Response</label></li>
                        <li><input type="checkbox" id="checkbox-ir-${tabId}" alt="show/hide" disabled><label for="checkbox-ir-${tabId}">Fundamental + Harmonic Distortion</label></li>
                        <li><input type="checkbox" id="checkbox-distortion-${tabId}" alt="show/hide" disabled><label for="checkbox-distortion-${tabId}">Distortion</label></li>
                        <li><input type="checkbox" id="checkbox-distortion-${tabId}" alt="show/hide" disabled><label for="checkbox-distortion-${tabId}">Sound Pressure Level</label></li>
                        <li><input type="checkbox" id="checkbox-deconvoluted-ir-${tabId}" alt="show/hide" disabled><label for="checkbox-deconvoluted-ir-${tabId}">Deconvoluted Impulse Response</label></li>
                        <li><input type="checkbox" id="checkbox-stimulus-waveform-${tabId}" alt="show/hide" disabled><label for="checkbox-stimulus-waveform-${tabId}">Stimulus Waveform</label></li>
                        <li><input type="checkbox" id="checkbox-recorded-waveform-${tabId}" alt="show/hide" disabled><label for="checkbox-recorded-waveform-${tabId}">Recorded Waveform</label></li>
                        <li><input type="checkbox" id="checkbox-recorded-noise-floor-${tabId}" alt="show/hide" disabled><label for="checkbox-recorded-noise-floor-${tabId}">Recorded Noise Floor</label></li>
                        <li><input type="checkbox" id="checkbox-target-curve-${tabId}" alt="show/hide" disabled><label for="checkbox-target-curve-${tabId}">Target Curve<button class="float-right text-xs cursor-pointer" style="color: #bbb; padding-top: 3px">Set</button></label></li-->
                    </ul>
                </div>
                <div class="section">
                    <div class="title">Properties</div>
                    <p id="properties-${tabId}"><i>There are no properties for this analysis.</i></p>
                </div>
                <div id="resize-handle" class="resize-handle"></div>
            </div>
            <div class="flex-1 main-content">
                <div class="grid grid-cols-6 gap-[1px] bg-[#ddd] border-b border-[#ddd] plot-outer">
                </div>
            </div>
        </div>


    `;
            tabContents.appendChild(content);

            const propertiesElement = document.getElementById(`properties-${tabId}`);
            if (propertiesElement) {
                propertiesElement.innerHTML = `
            <b>Filename:</b> ${filename}<br>
            ${referenceFilename ? `<b>Reference Filename:</b> ${referenceFilename}<br>` : ''}
            <b>Sample Rate:</b> ${responseData.sampleRate} Hz<br>
            <b>Channels:</b> ${responseData.numberOfChannels}<br>
            <b>Duration:</b> ${responseData.duration.toFixed(2)} s<br>
            <b>RMS Level:</b> ${db(rms(responseData.getChannelData(0)))} dBFS<br>
            <b>Peak Level:</b> ${db(max(responseData.getChannelData(0)))} dBFS<br>
            <iXML Metadata:</i><br>
            <pre>${(responseData.metadata?.iXMLdata || "" as any).replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre>
            `;
            }

            const sidebarToggleBtn = document.getElementById(`sidebar-toggle-${tabId}`) as HTMLButtonElement;
            const sidecar = content.querySelector('.sidecar') as HTMLElement;
            const resizeHandle = content.querySelector('#resize-handle') as HTMLElement;

            sidebarToggleBtn.addEventListener('click', () => {
                if (sidecar.style.width === '0px') {
                    sidecar.style.width = '21.5rem';
                    sidebarToggleBtn.title = 'Close settings pane';
                } else {
                    sidecar.style.width = '0px';
                    sidebarToggleBtn.title = 'Open settings pane';
                }
            });

            // FIR filter generation handler
            const generateFirBtn = content.querySelector(`#generate-fir-${tabId}`) as HTMLButtonElement;
            const firStatusEl = content.querySelector(`#fir-status-${tabId}`) as HTMLParagraphElement;
            
            if (generateFirBtn && referenceData) {
                generateFirBtn.addEventListener('click', async () => {
                    try {
                        if (firStatusEl) {
                            firStatusEl.textContent = 'Generating FIR filter...';
                            firStatusEl.style.color = '#0366d6';
                        }
                        generateFirBtn.disabled = true;

                        // Get parameters from UI
                        const freqStartInput = content.querySelector(`#fir-freq-start-${tabId}`) as HTMLInputElement;
                        const freqEndInput = content.querySelector(`#fir-freq-end-${tabId}`) as HTMLInputElement;
                        const tapsInput = content.querySelector(`#fir-taps-${tabId}`) as HTMLInputElement;
                        const epsilonInput = content.querySelector(`#fir-epsilon-${tabId}`) as HTMLInputElement;
                        const targetCurveInput = content.querySelector(`#fir-target-${tabId}`) as HTMLSelectElement;
                        
                        if (!freqStartInput || !freqEndInput || !tapsInput || !epsilonInput || !targetCurveInput) {
                            throw new Error('Filter parameter inputs not found');
                        }
                        
                        const freqStart = parseFloat(freqStartInput.value);
                        const freqEnd = parseFloat(freqEndInput.value);
                        const taps = parseInt(tapsInput.value);
                        const beta = parseFloat(epsilonInput.value);
                        const targetCurveType = targetCurveInput.value;


                        // Compute the transfer function
                        const responseSamples = responseData.getChannelData(0);
                        const referenceSamples = referenceData.getChannelData(0);
                        const ir: ImpulseResponseResult = twoChannelImpulseResponse(responseSamples, referenceSamples);
                        const transferFunction: FFTResult = computeFFTFromIR(ir);


                        // Create target curve (apply curve in specified range, measured outside)
                        const N = transferFunction.frequency.length;
                        const targetMagnitude = generateTargetCurve(targetCurveType, transferFunction.frequency, freqStart, freqEnd);
                        
                        const normalizeFrequency = 1000; // 1 kHz reference
                        const normalizeFrequencyIdx = closest(normalizeFrequency, transferFunction.frequency);
                        const normalizeFrequencyStartIdx = closest(freqStart, transferFunction.frequency);
                        const normalizeFrequencyEndIdx = closest(freqEnd, transferFunction.frequency);

                        // Normalize target curve to 0 dB at 1000 Hz
                        const normalizationFactor = rms(transferFunction.magnitude.slice(normalizeFrequencyStartIdx, normalizeFrequencyEndIdx + 1));
                        for (let k = 0; k < N; k++) {
                            transferFunction.magnitude[k] /= normalizationFactor;
                            targetMagnitude[k] /= targetMagnitude[normalizeFrequencyIdx];
                        }

                        const transferFunctionDb = db(transferFunction.magnitude);
                        const targetMagnitudeDb = db(targetMagnitude);

                        //Plot the target curve for debugging
                        plot(
                            [
                                { x: transferFunction.frequency, y: transferFunctionDb, name: 'Measured Response', line: { color: '#1f77b4', width: 1 } },
                                { x: transferFunction.frequency, y: targetMagnitudeDb, name: 'Target Curve', line: { color: '#d62728', width: 1 } },
                                { x: transferFunction.frequency, y: targetMagnitudeDb.map((val, idx) => val - transferFunctionDb[idx]), name: 'Difference', line: { color: '#ff7f0e', width: 1 } }
                            ],
                            tabId,
                            'Target Curve Debug',
                            'Frequency (Hz)',
                            'Magnitude (dB)',
                            { type: 'log', range: [Math.log10(20), Math.log10(20000)] },
                            {},
                            {},
                            false
                        );

                        const inverseDifference = dbToLinear(transferFunctionDb.map((val, idx) => val - targetMagnitudeDb[idx]));
                        
                        const targetRe = new Float32Array(N);
                        const betaResponse = new Float32Array(N);
                        
                        for (let k = 0; k < N; k++) {
                            const freq = transferFunction.frequency[k];
                            if (freq >= freqStart && freq <= freqEnd) {
                                // Use target curve in the correction range
                                targetRe[k] = inverseDifference[k];
                                betaResponse[k] = beta;
                            } else {
                                // Outside range: roll off to 1.0 with 12 dB/decade fade
                                const octavesFromRange = freq < freqStart 
                                    ? Math.log2(freqStart / freq)
                                    : Math.log2(freq / freqEnd);
                                const attenDb = octavesFromRange * 24; // 12 dB per octave
                                const fadeToOne = Math.pow(10, -attenDb / 20);
                                targetRe[k] = inverseDifference[k] * fadeToOne + (1 - fadeToOne);
                                betaResponse[k] = (1 - fadeToOne - (1 - fadeToOne)) * beta; // Minimal regularization outside the correction range
                            }
                        }
                        // Plot target real part for debugging
                        plot(
                            [
                                { x: transferFunction.frequency, y: db(targetRe), name: 'Target Real Part', line: { color: '#2ca02c', width: 1 } }
                            ],
                            tabId,
                            'Target Real Part Debug',
                            'Frequency (Hz)',
                            'Magnitude (dB)',
                            { type: 'log', range: [Math.log10(20), Math.log10(20000)] },
                            {},
                            {},
                            false
                        );

                        // Apply smoothing to targetRe for better FIR design
                        const smoothedTargetRe = smoothFFT({ frequency: transferFunction.frequency, magnitude: targetRe, phase: new Float32Array(N), fftSize: N }, 1 / 6).magnitude;

                        // Run Kirkeby regularization... compute the regularization factor for each frequency bin.
                        const kirkeby = new Float32Array(N);
                        for (let k = 0; k < N; k++) {
                            const numerator = smoothedTargetRe[k];
                            const denominator = smoothedTargetRe[k] * smoothedTargetRe[k] + betaResponse[k];
                            kirkeby[k] = numerator / denominator;
                        }

                        //Compute inverse FFT of Kirkeby regularization to get FIR coefficients
                        const kirkebyFFT: FFTResult = {
                            frequency: transferFunction.frequency,
                            magnitude: kirkeby,
                            phase: zeros(N),
                            fftSize: N
                        };
                        const kirkebyFIR = computeIFFT(kirkebyFFT);

                        // Make FIR causal by mirroring
                        const linearPhaseFIR = new Float32Array(taps);
                        const halfaTaps = Math.floor(taps / 2);
                        for (let n = 0; n < taps; n++) {
                            const idx = Math.abs(n - halfaTaps); // Circular shift
                            linearPhaseFIR[n] = kirkebyFIR[idx];
                        }
                        if (firStatusEl) {
                            firStatusEl.textContent = 'Converting to minimum phase...';
                        }
                        
                        // Convert to minimum phase
                        const minPhaseFIR = firToMinPhase(linearPhaseFIR, taps); // Zero-pad for better frequency resolution in the cepstrum

                        if (firStatusEl) {
                            firStatusEl.textContent = 'Computing filter response...';
                        }
                        

                        plot(
                            [
                                { x: Array.from({ length: linearPhaseFIR.length }, (_, i) => i), y: linearPhaseFIR, name: 'Linear Phase Kirkeby FIR Coefficients', line: { color: '#1f77b4', width: 1 } },
                                { x: Array.from({ length: minPhaseFIR.length }, (_, i) => i), y: minPhaseFIR, name: 'Minimum Phase FIR Coefficients', line: { color: '#d62728', width: 1 } }
                            ],
                            tabId,
                            'Kirkeby FIR DebugUnshifted',
                            'Sample Index',
                            'Amplitude',
                            {},
                            {},
                            {},
                            false
                        );

                        // Plot response of Kirkeby FIR for debugging
                        const kirkebyFIRFFT = computeFFT(linearPhaseFIR);
                        const kirkebyMinPhaseFIRFFT = computeFFT(minPhaseFIR);
                        
                        // Plot Kirkeby regularization factor for debugging
                        plot(
                            [
                                { x: transferFunction.frequency, y: db(smoothedTargetRe).map(v => -v), name: 'Target Real Part', line: { color: '#2ca02c', width: 1 } },
                                { x: transferFunction.frequency, y: db(kirkeby), name: 'Kirkeby Regularization Factor', line: { color: '#9467bd', width: 1 } },
                                { x: kirkebyFIRFFT.frequency, y: db(kirkebyFIRFFT.magnitude), name: 'Kirkeby FIR Response', line: { color: '#1f77b4', width: 1 } },
                                { x: kirkebyMinPhaseFIRFFT.frequency, y: db(kirkebyMinPhaseFIRFFT.magnitude), name: 'Minimum Phase Kirkeby FIR Response', line: { color: '#d62728', width: 1 } }
                            
                            ],
                            tabId,
                            'Kirkeby Regularization Debug',
                            'Frequency (Hz)',
                            'Magnitude (dB)',
                            { type: 'log', range: [Math.log10(20), Math.log10(20000)] },
                            {},
                            {},
                            false
                        );

                        // Ensure this tab is active before plotting
                        console.log('Switching to tab:', tabId);
                        switchTab(tabId);

                        if (firStatusEl) {
                            firStatusEl.textContent = 'Downloading filter...';
                        }

                        // Download as WAV file
                        const sampleRate = responseData.sampleRate || 48000;
                        download(
                            minPhaseFIR,
                            sampleRate,
                            `fir_filter_${targetCurveType}_${freqStart}-${freqEnd}Hz_${taps}taps.fir`,
                            {},
                            convertToIXML(`
                                <FILTER_TYPE>FIR_MINIMUM_PHASE</FILTER_TYPE>
                                <FILTER_TAPS>${taps}</FILTER_TAPS>
                                <FREQ_START>${freqStart}</FREQ_START>
                                <FREQ_END>${freqEnd}</FREQ_END>
                                <KIRKEBY_EPSILON>${beta}</KIRKEBY_EPSILON>
                                <TARGET_CURVE>${targetCurveType}</TARGET_CURVE>
                                <SAMPLE_RATE>${sampleRate}</SAMPLE_RATE>
                                <GENERATED>${new Date().toISOString()}</GENERATED>
                            `)
                        );

                        if (firStatusEl) {
                            firStatusEl.textContent = `✓ Filter generated (${taps} taps, ${targetCurveType} target, ${freqStart}-${freqEnd} Hz)`;
                            firStatusEl.style.color = '#28a745';
                        }
                        
                    } catch (error) {
                        console.error('Error generating FIR filter:', error);
                        if (firStatusEl) {
                            firStatusEl.textContent = `Error: ${(error as Error).message}`;
                            firStatusEl.style.color = '#d73a49';
                        }
                    } finally {
                        generateFirBtn.disabled = false;
                    }
                });
            } else if (generateFirBtn && !referenceData) {
                // Disable button if no reference data
                generateFirBtn.disabled = true;
                generateFirBtn.title = 'Reference signal required for filter generation';
                if (firStatusEl) {
                    firStatusEl.textContent = 'Reference signal required';
                    firStatusEl.style.color = '#d73a49';
                }
            }


            let isResizing = false;
            let lastDownX = 0;

            resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
                isResizing = true;
                lastDownX = e.clientX;
                document.body.style.cursor = 'ew-resize';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e: MouseEvent) => {
                if (!isResizing) return;
                const offsetRight = tabsContainer.clientWidth - (e.clientX);
                const newWidth = tabsContainer.clientWidth - offsetRight;
                if (newWidth >= 200 && newWidth <= 600) {
                    sidecar.style.width = `${newWidth}px`;
                }
                e.preventDefault();
            });

            document.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    document.body.style.cursor = 'default';
                }
            });

            // Switch to new tab
            switchTab(tabId);

            // Compute and plot FFTs
            const responseSamples = responseData.getChannelData(0);

            const responseFFT = computeFFT(responseSamples);
            const smoothedResponseFFT = smoothFFT(responseFFT, 1 / 6, 1 / 48);

            let referenceSamples = Float32Array.from([]);

            plot(
                [
                    { x: responseFFT.frequency, y: db(responseFFT.magnitude), name: 'Recorded signal', line: { color: '#0366d666', width: 0.75 } },
                    { x: smoothedResponseFFT.frequency, y: db(smoothedResponseFFT.magnitude), name: 'Recorded signal (Smoothed)', line: { color: '#0366d6', width: 1.5 } }
                ],
                tabId,
                'Recorded Spectrum',
                'Frequency (Hz)',
                'Amplitude (dBFS)',
                { type: 'log', range: [Math.log10(20), Math.log10(20000)] },
                { range: [-85, 5] },
                {},
                true
            );
            plot(
                [
                    { x: linspace(0, responseSamples.length / 48000, responseSamples.length), y: responseSamples, name: 'Recorded signal', line: { color: '#0366d6ff', width: 0.75 } }
                ],
                tabId,
                'Recorded Waveform',
                'Time (s)',
                'Amplitude',
                {},
                {},
                {},
                true
            );

            setStatusMessage('');

            if (referenceData) {
                referenceSamples = referenceData.getChannelData(0);
                const referenceFFT: FFTResult = computeFFT(referenceSamples);
                const smoothedReferenceFFT = smoothFFT(referenceFFT, 1 / 6, 1 / 48);
                plot(
                    [
                        { x: referenceFFT.frequency, y: db(referenceFFT.magnitude), name: 'Stimulus signal', line: { color: '#0366d666', width: 0.75 } },
                        { x: smoothedReferenceFFT.frequency, y: db(smoothedReferenceFFT.magnitude), name: 'Stimulus signal (Smoothed)', line: { color: '#0366d6', width: 1.5 } }
                    ],
                    tabId,
                    'Stimulus Spectrum',
                    'Frequency (Hz)',
                    'Amplitude (dBFS)',
                    { type: 'log', range: [Math.log10(20), Math.log10(20000)] },
                    { range: [-85, 5] },
                    {},
                    true
                );
                plot(
                    [
                        { x: linspace(0, referenceSamples.length / 48000, referenceSamples.length), y: referenceSamples, name: 'Stimulus signal', line: { color: '#0366d6ff', width: 0.75 } }
                    ],
                    tabId,
                    'Stimulus Waveform',
                    'Time (s)',
                    'Amplitude',
                    {},
                    {},
                    {},
                    true
                );
                const ir: ImpulseResponseResult = twoChannelImpulseResponse(responseSamples, referenceSamples);
                const farina = new Farina(referenceSamples, 20, 20000, 48000);
                const farina_ir: ImpulseResponseResult = farina.deconvolvedResponse(responseSamples);

                plotDistortion(farina, 0.1, 5, tabId);
                plotTHD(farina, 0.1, 5, tabId);

                console.log('Impulse response peak at', farina.lag_of_harmonic(2));

                plot(
                    [
                        { x: ir.t, y: ir.ir, type: 'scatter', mode: 'lines', name: 'Dual-FFT Impulse Response', line: { color: COLORS[0], width: 0.75 } }
                    ],
                    tabId,
                    'Impulse Response',
                    'Time (s)',
                    'Amplitude',
                    {},
                    {},
                    {},
                    true
                );

                plot(
                    [
                        { x: [-max(farina_ir.t), max(farina_ir.t)], y: [-200, -200], showlegend: false },
                        { x: farina_ir.t, y: db(farina_ir.ir.map(x => Math.abs(x))), type: 'scatter', mode: 'lines', fill: 'tonexty', name: 'Farina Impulse Response', line: { color: COLORS[0], width: 0.75 }, fillcolor: COLORS[0] },
                        { x: [- 0.05, - 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'Fundamental window start', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [0.05, 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'Fundamental window end', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [-farina.lag_of_harmonic(2) - 0.05, -farina.lag_of_harmonic(2) - 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'H2 window start', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [-farina.lag_of_harmonic(2) + 0.05, -farina.lag_of_harmonic(2) + 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'H2 window end', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [-farina.lag_of_harmonic(3) - 0.05, -farina.lag_of_harmonic(3) - 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'H3 window start', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [-farina.lag_of_harmonic(3) + 0.05, -farina.lag_of_harmonic(3) + 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'H3 window end', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [-farina.lag_of_harmonic(4) - 0.05, -farina.lag_of_harmonic(4) - 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'H4 window start', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [-farina.lag_of_harmonic(4) + 0.05, -farina.lag_of_harmonic(4) + 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'H4 window end', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [-farina.lag_of_harmonic(5) - 0.05, -farina.lag_of_harmonic(5) - 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'H5 window start', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [-farina.lag_of_harmonic(5) + 0.05, -farina.lag_of_harmonic(5) + 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'H5 window end', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [-farina.lag_of_harmonic(6) - 0.05, -farina.lag_of_harmonic(6) - 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'H6 window start', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [-farina.lag_of_harmonic(6) + 0.05, -farina.lag_of_harmonic(6) + 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'H6 window end', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [-farina.lag_of_harmonic(7) - 0.05, -farina.lag_of_harmonic(7) - 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'H7 window start', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
                        { x: [-farina.lag_of_harmonic(7) + 0.05, -farina.lag_of_harmonic(7) + 0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'H7 window end', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },

                    ],
                    tabId,
                    'Deconvolved Response',
                    'Time (s)',
                    'Amplitude',
                    { range: [-1, 1] },
                    { range: [-150, 10] },
                    {},
                    true
                );
                const transferFunction = computeFFTFromIR(ir);
                // const dreferenceFFT = twoChannelFFT(responseData.data, referenceSamples, nextPow2(referenceSamples.length), -5627);
                const smoothedFreqResponse = smoothFFT(transferFunction, 1 / 6, 1 / 48);

                const gd = groupDelays(transferFunction, 1000);

                plot(
                    [
                        { x: transferFunction.frequency, y: db(transferFunction.magnitude), name: 'Magnitude', line: { color: '#0366d666', width: 0.75 } },
                        { x: smoothedFreqResponse.frequency, y: db(smoothedFreqResponse.magnitude), name: 'Magnitude (Smoothed)', line: { color: '#0366d6', width: 1.5 } }
                    ],
                    tabId,
                    'Transfer Function',
                    'Frequency (Hz)',
                    'Amplitude (dBFS)',
                    { type: 'log', range: [Math.log10(20), Math.log10(20000)] },
                    { range: [-85, 5] },
                    {},
                    true
                );

                plot(
                    [
                        { x: transferFunction.frequency, y: transferFunction.phase, name: 'Phase', line: { color: '#0366d666', width: 0.75 } },
                        { x: smoothedFreqResponse.frequency, y: smoothedFreqResponse.phase, name: 'Phase (Smoothed)', line: { color: '#0366d6', width: 1.5 } }
                    ],
                    tabId,
                    'Phase',
                    'Frequency (Hz)',
                    'Amplitude (dBFS)',
                    { type: 'log', range: [Math.log10(20), Math.log10(20000)] },
                    { range: [-720, 720] },
                    {},
                    true
                );
                plot(
                    [
                        { x: transferFunction.frequency, y: gd, name: 'Group Delay', line: { color: COLORS[0], width: 1.5, dash: 'dot' } }
                    ],
                    tabId,
                    'Group Delay',
                    'Frequency (Hz)',
                    'Group Delay (ms)',
                    { type: 'log', range: [Math.log10(20), Math.log10(20000)] },
                    { range: [-20, 20] },
                    {},
                    true
                );

                // --- Colormap / Spectrogram (Plotly heatmap) ---
                (() => {
                    const sr =
                        (responseData as any).sampleRate ??
                        (referenceData as any)?.sampleRate ??
                        48000;

                    const n = responseSamples.length;
                    if (n < 4096) return;

                    const windowSize = 2048;
                    const targetFrames = 320;
                    const minHop = 256;

                    const rawFrames = Math.max(1, Math.floor((n - windowSize) / minHop) + 1);
                    const hop =
                        rawFrames > targetFrames
                            ? Math.max(minHop, Math.ceil((n - windowSize) / targetFrames))
                            : minHop;

                    const frames = Math.max(1, Math.floor((n - windowSize) / hop) + 1);

                    // Hann window
                    const win = new Float32Array(windowSize);
                    for (let i = 0; i < windowSize; i++) {
                        win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
                    }

                    // Determine frequency bins from first frame
                    const firstFrame = new Float32Array(windowSize);
                    firstFrame.set(responseSamples.subarray(0, windowSize));
                    for (let i = 0; i < windowSize; i++) firstFrame[i] *= win[i];

                    const firstFFT = computeFFT(firstFrame);
                    const freqs = Array.from(firstFFT.frequency);
                    const bins = freqs.length;

                    // z[freqIndex][timeIndex]
                    const z: number[][] = Array.from({ length: bins }, () => []);

                    const times: number[] = [];
                    for (let frame = 0; frame < frames; frame++) {
                        const start = frame * hop;
                        const slice = responseSamples.subarray(start, start + windowSize);

                        const windowed = new Float32Array(windowSize);
                        windowed.set(slice);
                        for (let i = 0; i < windowSize; i++) windowed[i] *= win[i];

                        const fft = computeFFT(windowed);
                        const magDb = db(fft.magnitude);

                        for (let k = 0; k < bins; k++) {
                            z[k].push(magDb[k]);
                        }

                        // Use center-of-window time for x axis
                        times.push((start + windowSize / 2) / sr);
                    }

                    plot(
                        [
                            {
                                type: 'heatmap',
                                x: times,
                                y: freqs,
                                z,
                                colorscale: 'Electric',
                                zmin: -120,
                                zmax: 0,
                                colorbar: { title: 'dBFS' }
                            } as any
                        ],
                        tabId,
                        'Recorded Spectrogram',
                        'Time (s)',
                        'Frequency (Hz)',
                        {},
                        { type: 'log', range: [Math.log10(20), Math.log10(20000)] },
                        { margin: { l: 60, r: 20, t: 40, b: 50 } },
                        true
                    );
                })();
            }

            saveState();

            // Persist analysis using IndexedDB (mirrored to sessionStorage for compatibility)
            storage.setItem(`${tabId}`, JSON.stringify({
                filename,
                referenceFilename,
                responseSamples: Array.from(responseSamples),
                referenceSamples: referenceSamples.length > 0 ? Array.from(referenceSamples) : null,
            })).catch(err => console.error('Failed to persist analysis:', err));

            function initResize(e: MouseEvent): void {
                e.preventDefault();
                window.addEventListener('mousemove', resize, false);
                window.addEventListener('mouseup', stopResize, false);
                console.log('Init resize');
                document.body.style.cursor = 'col-resize';
            }

            function resize(e: MouseEvent): void {
                const container = content.querySelector<HTMLElement>('.flex')!;
                const handle = document.getElementById('resize-handle')?.parentElement!;
                const rect = container.getBoundingClientRect();
                const newWidth = e.clientX - rect.left;
                if (newWidth > 150 && newWidth < rect.width - 150) {
                    handle.style.width = `${newWidth}px`;
                }
            }

            function stopResize(): void {
                window.removeEventListener('mousemove', resize, false);
                window.removeEventListener('mouseup', stopResize, false);
                window.dispatchEvent(new Event('resize'));
                document.body.style.cursor = 'default';
            }

            document.getElementById('resize-handle')?.addEventListener('mousedown', initResize, false);

            tab.classList.remove('tab-loading');

        });
    });
}


function createDirectivityPlotTab(responseDatas: Audio[], referenceData: Audio, anglesDeg?: number[]): void {
    console.log('Creating directivity plot tab with', responseDatas.length, 'responses and reference data', referenceData);
    if (responseDatas.length === 0 || referenceData.length === 0) return;

    tabCounter++;
    const tabId = `directivity-${tabCounter}`;
    const shortName = `Directivity (${responseDatas.length})`;

    const tab = document.createElement('button');
    tab.className = 'tab tab-closable tab-loading';
    tab.dataset.tab = tabId;
    tab.innerHTML = `<span class="tab-icon-analysis"></span>${shortName} <span class="tab-close">✕</span>`;
    tabsInnerContainer.appendChild(tab);


    // Create tab content
    const content = document.createElement('div');
    content.className = 'tab-content';
    content.dataset.content = tabId;
    content.innerHTML = `
        <button class="sidecar-toggle" id="sidebar-toggle-${tabId}" title="Toggle Sidecar">Open settings pane</button>
        <div class="flex h-full">
            <div class="flex-none w-86 border-r border-[#ddd] p-2 relative sidecar" style="transition:50ms linear;">
                <div class="section">
                    <div class="title">Settings</div>
                    <p><i>There are no settings for this analysis.</i></p>
                </div>
                <div class="section">
                    <div class="title">Plots</div>
                    <ul class="list" id="plot-list-${tabId}">
                        <!--li><input type="checkbox" id="checkbox-magnitude-${tabId}" alt="show/hide" checked><label for="checkbox-magnitude-${tabId}">Magnitude</label></li>
                        <li><input type="checkbox" id="checkbox-phase-${tabId}" alt="show/hide" checked><label for="checkbox-phase-${tabId}">Phase</label></li>
                        <li><input type="checkbox" id="checkbox-ir-${tabId}" alt="show/hide" checked><label for="checkbox-ir-${tabId}">Impulse Response</label></li>
                        <li><input type="checkbox" id="checkbox-ir-${tabId}" alt="show/hide" disabled><label for="checkbox-ir-${tabId}">Fundamental + Harmonic Distortion</label></li>
                        <li><input type="checkbox" id="checkbox-distortion-${tabId}" alt="show/hide" disabled><label for="checkbox-distortion-${tabId}">Distortion</label></li>
                        <li><input type="checkbox" id="checkbox-distortion-${tabId}" alt="show/hide" disabled><label for="checkbox-distortion-${tabId}">Sound Pressure Level</label></li>
                        <li><input type="checkbox" id="checkbox-deconvoluted-ir-${tabId}" alt="show/hide" disabled><label for="checkbox-deconvoluted-ir-${tabId}">Deconvoluted Impulse Response</label></li>
                        <li><input type="checkbox" id="checkbox-stimulus-waveform-${tabId}" alt="show/hide" disabled><label for="checkbox-stimulus-waveform-${tabId}">Stimulus Waveform</label></li>
                        <li><input type="checkbox" id="checkbox-recorded-waveform-${tabId}" alt="show/hide" disabled><label for="checkbox-recorded-waveform-${tabId}">Recorded Waveform</label></li>
                        <li><input type="checkbox" id="checkbox-recorded-noise-floor-${tabId}" alt="show/hide" disabled><label for="checkbox-recorded-noise-floor-${tabId}">Recorded Noise Floor</label></li>
                        <li><input type="checkbox" id="checkbox-target-curve-${tabId}" alt="show/hide" disabled><label for="checkbox-target-curve-${tabId}">Target Curve<button class="float-right text-xs cursor-pointer" style="color: #bbb; padding-top: 3px">Set</button></label></li-->
                    </ul>
                </div>
                <div class="section">
                    <div class="title">Properties</div>
                    <p id="properties-${tabId}"><i>There are no properties for this analysis.</i></p>
                </div>
                <div id="resize-handle" class="resize-handle"></div>
            </div>
            <div class="flex-1 main-content">
                <div class="grid grid-cols-6 gap-[1px] bg-[#ddd] border-b border-[#ddd] plot-outer">
                </div>
            </div>
        </div>


    `;
    tabContents.appendChild(content);

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {

            //switchTab(tabId);

            const startTime = performance.now()

            const useCustomAngles = !!anglesDeg && anglesDeg.length === responseDatas.length;
            const angles = useCustomAngles
                ? anglesDeg!.map(normalizeAngleDeg)
                : responseDatas.map((_, i) => (360 * i) / responseDatas.length);

            const referenceSamples = Float32Array.from(referenceData.getChannelData(0));

            const len = Math.min(7.5 * 48000, referenceSamples.length);
            const referenceFFT = updatedFFT(referenceSamples.subarray(0, len), len);

            const calcStartTime = performance.now()
            const transfers: FFTResult[] = [];
            const smoothTransfers: FFTResult[] = [];
            for (let i = 0; i < responseDatas.length; i++) {
                const resp = responseDatas[i];
                const loopStartTime = performance.now()
                const fftr = twoChannelFFT(
                    resp.getChannelData(0).subarray(0, len),
                    referenceSamples.subarray(0, len),
                    nextPow2(len),
                    0,
                    referenceFFT,
                );
                //
                fftr.magnitude = fftr.magnitude.map((v, i) => Math.abs(v));

                const ffto = smoothFFT(fftr, 1 / 3, 1 / 48);
                smoothTransfers.push(ffto);
                transfers.push(fftr);
            }
            const calcEndTime = performance.now()
            console.warn(`CALC TOOK ${calcEndTime - calcStartTime} milliseconds`)


            const baseFreq = transfers[0]?.frequency;
            if (!baseFreq || baseFreq.length === 0) return;

            const normHz = 1000;
            let normIdx = 0;
            let best = Number.POSITIVE_INFINITY;
            for (let i = 0; i < baseFreq.length; i++) {
                const d = Math.abs(baseFreq[i] - normHz);
                if (d < best) {
                    best = d;
                    normIdx = i;
                }
            }

            transfers.push(transfers[0]); // close the circle
            angles.push(360); // close the circle

            // cycle array by 16 indices to center front at 0 deg
            const cycleBy = 18;
            const cycleTransfers = smoothTransfers.slice(cycleBy).concat(smoothTransfers.slice(0, cycleBy));


            const asngles = angles.map(a => a - 180);

            // z[angleIndex][freqIndex]
            const z: any = cycleTransfers.map((tf) => {
                const magDb = db(tf.magnitude);
                return magDb.map((v, i) => v - db(smoothTransfers[0].magnitude)[i]);
            });


            const endTime = performance.now()

            console.warn(`TOOK ${endTime - startTime} milliseconds`)

            plot(
                [
                    {
                        type: 'heatmap',
                        x: smoothTransfers[0].frequency,
                        y: asngles,
                        z,
                        colorscale: 'Portland',
                        zmin: -24,
                        contours: { coloring: '#fff', showlines: true, start: -36, end: 0, size: 6 },
                        zmax: 6,
                        zsmooth: 'best',
                        colorbar: { title: 'dB (norm @ 1 kHz)' }
                    } as any
                ],
                tabId,
                'Directivity Map',
                'Frequency (Hz)',
                'Angle (deg)',
                { type: 'log', range: [Math.log10(20), Math.log10(20000)] },
                { range: [-180, 180] },
                { margin: { l: 60, r: 20, t: 40, b: 50 } },
                false
            );

            // Calculate the average response.
            const avgMagnitude = new Float32Array(baseFreq.length);
            for (let i = 0; i < baseFreq.length; i++) {
                let sum = 0;
                for (let j = 0; j < transfers.length - 1; j++) {
                    sum += transfers[j].magnitude[i];
                }
                avgMagnitude[i] = sum / (transfers.length - 1);
            }

            const smoothAvgMagnitude = smoothFFT({ frequency: baseFreq, magnitude: avgMagnitude, phase: new Float32Array(baseFreq.length), fftSize: nextPow2(baseFreq.length) }, 1 / 6, 1 / 48);
            const on = smoothFFT(transfers[0], 1 / 6, 1 / 48);

            const anglesToPlot = [0, 30, 60, 90, 180];

            plot(
                [
                    ...anglesToPlot.map((angle, i) => {
                        const idx = angles.findIndex(a => Math.abs(a - angle) < 0.1);
                        if (idx === -1) {
                            return null;
                        }
                        return { x: smoothFFT(transfers[idx], 1 / 6, 1 / 48).frequency, y: db(smoothFFT(transfers[idx], 1 / 6, 1 / 48).magnitude), name: `${angle} deg response`, line: { width: 1.5, color: COLORS[i] } };
                    }),
                    { x: smoothAvgMagnitude.frequency, y: db(smoothAvgMagnitude.magnitude), name: 'Average Response', line: { width: 2, color: '#000000' } },

                ],
                tabId,
                'Transfer Function',
                'Frequency (Hz)',
                'Amplitude (dB)',
                { type: 'log', range: [Math.log10(20), Math.log10(20000)] },
                { range: [-85, 5] },
                {},
                true
            );

            // Plot directivity index.
            plot(
                [
                    { x: on.frequency, y: db(smoothAvgMagnitude.magnitude).map((v, i) => db(on.magnitude)[i] - v), name: 'Average Response', line: { width: 2, color: '#000000' } },
                ],
                tabId,
                'Directivity Index',
                'Frequency (Hz)',
                'DI (dB)',
                { type: 'log', range: [Math.log10(20), Math.log10(20000)] },
                { range: [-10, 50] },
                {},
                true
            );

            // Polar directivity plots (add several frequency slices)
            (() => {
                const freqsToPlot = [62.5, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000];
                const uniqueTransfers = smoothTransfers; // last entry is duplicate to close circle
                const uniqueAngles = angles;

                const traces: any[] = [];
                const aseFreq = uniqueTransfers[0].frequency;

                for (let fi = 0; fi < freqsToPlot.length; fi++) {
                    const hz = freqsToPlot[fi];
                    // find nearest frequency index
                    let idx = 0;
                    let best = Number.POSITIVE_INFINITY;
                    for (let i = 0; i < aseFreq.length; i++) {
                        const d = Math.abs(aseFreq[i] - hz);
                        if (d < best) {
                            best = d;
                            idx = i;
                        }
                    }

                    // collect magnitude (dB) across angles
                    const magDb = uniqueTransfers.map(tf => db(tf.magnitude)[idx] ?? -999);
                    // normalize so max = 0 dB
                    const maxVal = Math.max(...magDb);
                    const r = magDb.map(v => v - maxVal);

                    // close the loop for polar plot
                    const theta = [...uniqueAngles, 360];
                    const rClosed = [...r];

                    traces.push({
                        type: 'scatterpolar',
                        r: rClosed,
                        theta,
                        mode: 'lines+markers',
                        name: `${hz} Hz`,
                        line: { color: COLORS[fi % COLORS.length], width: 2 },
                        marker: { size: 4 }
                    });
                }

                plot(
                    traces,
                    tabId,
                    'Polar Directivity',
                    'Frequency (Hz)',
                    'Angle (deg)',
                    {}, // x-axis options unused for polar
                    {}, // y-axis options unused for polar
                    {
                        polar: {
                            radialaxis: { title: { text: 'Relative dB (max = 0 dB)' }, angle: 90, dtick: 10, range: [-50, 0] },
                            angularaxis: { direction: 'clockwise', rotation: 90, tickmode: 'array' }
                        },
                        margin: { l: 60, r: 20, t: 40, b: 50 }
                    },
                    false
                );
            })();


            tab.classList.remove('tab-loading');
        });
    });
}

// Save and load state from sessionStorage
function saveState(): void {
    const tabs = Array.from(document.querySelectorAll('.tab[data-tab]')).map(tab => ({
        id: (tab as HTMLElement).dataset.tab,
        name: (tab as HTMLElement).textContent?.replace('×', '').trim()
    }));

    storage.setItem('tabs', JSON.stringify(tabs));
    console.log('Saved state with tabs:', tabs);
}

async function loadState(): Promise<void> {
    try {
        const savedTabs = await storage.getItem('tabs');
        if (!savedTabs) return;
        const tabs = JSON.parse(savedTabs);
        console.log('Loading saved tabs:', tabs);

        for (const tab of tabs as { id: string; name: string }[]) {
            // Call createAnalysisTab for each tab
            const raw = await storage.getItem(`${tab.id}`);
            const analysisData = raw ? JSON.parse(raw) : null;
            console.log('Restoring analysis data for tab', tab.id, analysisData);
            if (analysisData) {
                createAnalysisTab(Audio.fromSamples(Float32Array.from(analysisData.responseSamples)), analysisData.referenceSamples ? Audio.fromSamples(Float32Array.from(analysisData.referenceSamples)) : null, analysisData.filename, analysisData.referenceFilename);
            }
        }
        // Tabs will be recreated when user analyzes files again
    } catch (e) {
        console.error('Failed to load saved state:', e);
    }
}

function normalizesAngleDeg(angle: number): number {
    let a = angle % 360;
    if (a < 0) a += 360;
    return a;
}

async function loadTestPolarData(): Promise<void> {
    // Load some test data for polar analysis
    const angles = [
        0, 10, 20, 30, 40, 50, 60, 70, 80,
        90, 100, 110, 120, 130, 140, 150, 160, 170,
        180, 190, 200, 210, 220, 230, 240, 250, 260,
        270, 280, 290, 300, 310, 320, 330, 340, 350];

    const files = angles.map(a => `testdata/${a}.wav`);
    createDirectivityPlotTab(
        await Promise.all(files.map(f => loadAudioFromFilename(f))),
        await loadAudioFromFilename('testdata/sweep_signal.wav.wav'),
        angles
    );
}

async function loadWaveformsFromStorage(): Promise<Map<string, Audio>> {
    // Load waveforms from IndexedDB (mirrored to sessionStorage for compatibility)
    try {
        const raw = await storage.getItem('waveforms');
        console.log('Attempting:', raw);

        const items: Map<string, Audio> = new Map();
        const decoded = JSON.parse(raw || '[]');
        console.log('Decoded waveforms from storage:', decoded);

        const startLoadTime = performance.now();
        for (const item of decoded) {
            // Convert numeric arrays back to typed arrays so Audio.fromObject gets proper buffers.
            if (item.data && Array.isArray(item.data)) {
                item.data = Float32Array.from(item.data);
            }
            if (item.channelData && Array.isArray(item.channelData)) {
                item.channelData = item.channelData.map((ch: any) => Array.isArray(ch) ? Float32Array.from(ch) : ch);
            }
            if (item.samples && Array.isArray(item.samples)) {
                item.samples = Float32Array.from(item.samples);
            }
            items.set(item.id, Audio.fromObject(item));
        }
        console.log(`Loaded ${items.size} waveforms from storage in ${performance.now() - startLoadTime} milliseconds`);
        console.log('Loaded waveforms from storage:', items);

        return items;
    } catch (err) {
        console.warn('Failed to load waveforms from storage:', err);
        return new Map();
    }
}

function saveWaveformsToStorage(waveforms: Map<string, Audio>): void {
    // Save waveforms to IndexedDB (mirrored to sessionStorage for compatibility)
    console.warn('Saving waveforms to storage:', waveforms);
    const toSave = Array.from(waveforms.entries()).map(([id, wf]) => {
        const obj = wf.toObject();
        obj.id = id;
        return obj;
    });
    storage.setItem('waveforms', JSON.stringify(toSave)).catch(err => {
        console.error('Failed to save waveforms to storage:', err);
    });
}

function createListItem(audioObject: Audio, id: string): HTMLLIElement {
    const li = document.createElement('li');
    li.dataset.id = id;
    li.style.display = 'flex';
    li.classList.add('file-list-item');
    li.innerHTML = `
        <div style="flex:1;min-width:0;">
            <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${audioObject.metadata?.filename || 'Unknown'}</div>
            <div style="font-size:12px;color:#666;">${audioObject.metadata?.mime || 'audio/*'}</div>
            <div style="font-size:12px;color:#666;">Duration: ${audioObject.duration.toFixed(2)} seconds</div>
            <div style="font-size:12px;color:#666;">Angle: ${typeof audioObject?.metadata?.iXML === 'object' && audioObject.metadata.iXML && 'angle' in audioObject.metadata.iXML ? (audioObject.metadata.iXML as any).angle : 'N/A'} deg</div>
            <div style="font-size:12px;color:#666;">Origin: ${typeof audioObject?.metadata?.iXML === 'object' && audioObject.metadata?.iXML && 'origin' in audioObject.metadata.iXML ? (audioObject.metadata.iXML as any).origin : 'Imported'}</div>
        </div>
        <div class="file-list-item-controls flex:1;min-width:0;">
            <div><label style="font-size:13px;"><input type="radio" name="selectedResponse" value="${id}"> Response</label></div>
            <div><label style="font-size:13px;"><input type="radio" name="selectedReference" value="${id}"> Reference</label></div>
            <div><button type="button" data-action="remove" style="margin-left:8px;">Remove</button></div>
        </div>
    `;

    // Insert image generated by Audio.getEnvelopeImage()
    const bas = audioObject.getEnvelopeImage(0, 1000, 100)
    li.style.backgroundImage = `url(${bas})`;
    li.style.backgroundRepeat = 'no-repeat';
    li.style.backgroundPosition = 'center center';
    li.style.backgroundSize = 'fill';

    return li;
}

function updateAnalyzeState() {
    const responseSelected = !!document.querySelector('input[name="selectedResponse"]:checked');
    const referenceSelected = !!document.querySelector('input[name="selectedReference"]:checked');
    const analyzeBtn = document.getElementById('analyzeUploadBtn') as HTMLButtonElement;
    if (responseSelected) {
        analyzeBtn.disabled = false;
    } else {
        analyzeBtn.disabled = true;
    }
}

async function addFilesFromInput(fileList: FileList) {
    await Promise.all(Array.from(fileList).map(async f => {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const a = await audio.loadAudioFile(f);
        fileMap.set(id, a);
        console.log('Added file:', id, a);
        console.log('Current file map:', fileMap);
        const li = createListItem(a, id);
        document.getElementById('fileList')?.appendChild(li);
    })).then(() => {
        console.log('All files added. Current file map:', fileMap);
        saveWaveformsToStorage(fileMap);
    });
    updateAnalyzeState();
}

document.addEventListener('DOMContentLoaded', () => {
    const respInput = document.getElementById('responseFileUpload');
    const refInput = document.getElementById('referenceFileUpload'); // exists below
    if (respInput) respInput.addEventListener('change', e => {
        const target = e.target as HTMLInputElement;
        if (target?.files?.length) addFilesFromInput(target.files);
        target.value = '';
    });

    document.getElementById('fileList')?.addEventListener('click', e => {
        const li = (e.target as HTMLElement).closest('li');
        if (!li) return;
        const id = li.dataset.id;
        if ((e.target as HTMLElement).matches('button[data-action="remove"]')) {
            // remove
            // if removed file was chosen in underlying file inputs, clear radios
            const responseRadio = document.querySelector(`input[name="selectedResponse"][value="${id}"]`);
            const referenceRadio = document.querySelector(`input[name="selectedReference"][value="${id}"]`);
            if (responseRadio && (responseRadio as HTMLInputElement).checked) {
                (responseRadio as HTMLInputElement).checked = false;
            }
            if (referenceRadio && (referenceRadio as HTMLInputElement).checked) {
                (referenceRadio as HTMLInputElement).checked = false;
            }
            fileMap.delete(id!);
            li.remove();
            console.log('Removed file:', id);
            console.log('Current file map:', fileMap);
            saveWaveformsToStorage(fileMap);
            // ensure analyze button is enabled/disabled
            updateAnalyzeState();
        }
    });

    document.getElementById('fileList')?.addEventListener('change', e => {
        if ((e.target as HTMLInputElement).name === 'selectedResponse') {
            // ensure analyze button is enabled/disabled
            updateAnalyzeState();
        }
    });

    loadWaveformsFromStorage().then(waveforms => {
        console.log('Loaded waveforms from storage on startup:', waveforms);
        for (const a of waveforms) {
            const [id, audioObj] = a;
            console.log('Creating list item for loaded waveform:', a);
            const li = createListItem(audioObj, id); // id is not needed here since we don't remove these
            fileMap.set(id, audioObj);
            document.getElementById('fileList')?.appendChild(li);
        }
    });

    document.getElementById('analyzeUploadBtn')?.addEventListener('click', () => {
        const responseRadio = document.querySelector('input[name="selectedResponse"]:checked') as HTMLInputElement;
        const referenceRadio = document.querySelector('input[name="selectedReference"]:checked') as HTMLInputElement;

        if (!responseRadio) {
            alert('Please select a response file.');
            return;
        }
        console.log(fileMap.entries());
        const response = fileMap.get(responseRadio.value);

        const reference = referenceRadio ? fileMap.get(referenceRadio.value) || null : null;

        if (!response) {
            alert('Selected response file not found.');
            return;
        }

        createAnalysisTab(response.applyGain(1 / 16384), reference ? reference.applyGain(1 / 16384) : null, response.metadata?.filename + '' || 'Response', (reference?.metadata?.filename || 'Reference') as string);
    });
});

//loadTestPolarData();
// Load state on page load
loadState();

function zeros(N: number): Float32Array {
    return new Float32Array(N);
}
function fitBiquadFilters(kirkeby: Float32Array, frequency: Float32Array, numBiquads: number) {
    // Fit numBiquads cascaded biquad filters to approximate the kirkeby magnitude response
    // using least squares optimization
    
    const N = kirkeby.length;
    if (N === 0) throw new Error("kirkeby array is empty");
    
    const biquads: BiquadCoefficients[] = [];
    const sampleRate = 48000;
    
    // Initialize biquad parameters: [freq1, Q1, gain1, freq2, Q2, gain2, ...]
    const numParams = numBiquads * 3;
    let params = new Float32Array(numParams);
    
    // Initialize with logarithmically spaced frequencies
    const minFreq = Math.max(frequency[0], 20);
    const maxFreq = Math.min(frequency[N - 1], sampleRate / 2);
    const logMinFreq = Math.log10(minFreq);
    const logMaxFreq = Math.log10(maxFreq);
    
    for (let i = 0; i < numBiquads; i++) {
        const logFreq = logMinFreq + ((i + 0.5) / numBiquads) * (logMaxFreq - logMinFreq);
        params[i * 3] = Math.pow(10, logFreq); // center frequency
        params[i * 3 + 1] = 1.0; // Q
        params[i * 3 + 2] = 0.0; // gain in dB
    }
    console.log('Initial biquad parameters:', params);
    
    // Compute cascaded response for given parameters
    function computeResponse(p: Float32Array): Float32Array {
        const response = new Float32Array(N);
        
        for (let i = 0; i < numBiquads; i++) {
            const centerFreq = p[i * 3];
            const Q = Math.max(0.1, p[i * 3 + 1]);
            const gainDb = p[i * 3 + 2];
            
            const biquad = createBiquadCoefficients('peaking', centerFreq, Q, gainDb, sampleRate);
            const [biquadMags, _] = getFrequencyResponse(biquad, N);
            console.log(`Biquad ${i + 1}: freq=${centerFreq.toFixed(2)} Hz, Q=${Q.toFixed(2)}, gain=${gainDb.toFixed(2)} dB`);
            
            response.set(response.map((v, k) => v + db(biquadMags[k])));
        }
        return dbToLinear(response);
    }
    
    // Compute error (sum of squared differences in dB)
    function computeError(p: Float32Array): number {
        const response = computeResponse(p);
        let error = 0;
        for (let k = 0; k < N; k++) {
            const targetDb = db(kirkeby[k]);
            const responseDb = db(response[k]);
            const diff = targetDb - responseDb;
            error += diff;
        }
        return error;
    }
    
    // Simple gradient descent optimization
    const learningRate = 0.1;
    const maxIterations = 10;
    const epsilon = 1e-3;
    
    for (let iter = 0; iter < maxIterations; iter++) {
        const currentError = computeError(params);
        console.log(`Iteration ${iter + 1}, Error: ${currentError.toFixed(4)}`);
        let improved = false;
        
        for (let i = 0; i < numParams; i++) {
            let delta = epsilon;
            const original = params[i];

            // Add constraints
            if (i % 3 === 0) {
                delta = 10
            } else if (i % 3 === 1) {
                delta = 0.1
            } else {
                delta = 1.0
            }
            
            params[i] = original + delta;
            const errorPlus = computeError(params);
            
            params[i] = original - delta;
            const errorMinus = computeError(params);
            
            params[i] = original;
            
            const gradient = (errorPlus - errorMinus) / (2 * delta);
            const newValue = original - learningRate * gradient;
            
            // Add constraints
            if (i % 3 === 0) {
                // Frequency: keep in valid range
                params[i] = Math.max(20, Math.min(sampleRate / 2, newValue));
            } else if (i % 3 === 1) {
                // Q: keep positive
                params[i] = Math.min(Math.max(0.1, newValue), 20);
            } else {
                // Gain: keep reasonable range
                params[i] = Math.max(-24, Math.min(24, newValue));
            }
            
            if (Math.abs(params[i] - original) > 1e-8) {
                improved = true;
            }
        }
    }
    
    // Create biquad coefficients from optimized parameters
    for (let i = 0; i < numBiquads; i++) {
        const centerFreq = params[i * 3];
        const Q = Math.max(0.1, params[i * 3 + 1]);
        const gainDb = params[i * 3 + 2];
        
        const biquad = createBiquadCoefficients('peaking', centerFreq, Q, gainDb, sampleRate);
        biquads.push(biquad);
    }
    
    return biquads;
}


import { Audio, computeFFT, computeFFTFromIR, db, FFTResult, groupDelays, ImpulseResponseResult, rms, smoothFFT, twoChannelImpulseResponse } from "./audio";
import { FarinaImpulseResponse } from "./farina";
import { storage } from "./storage";
import { audio } from "./audio";
import { createWaveformEditor, WaveformEditor } from "./waveform_editor";
import "./device-settings";

console.debug("App module loaded");

const root = document.documentElement;
const uiColor = "#0366d6";
root.style.setProperty('--color', uiColor);

let tabCounter = 0;
const tabsContainer = document.getElementById('tabs') as HTMLElement;
const tabContents = document.getElementById('tab-contents') as HTMLElement;
const responseFileInput = document.getElementById('responseFile') as HTMLInputElement;
const referenceFileInput = document.getElementById('referenceFile') as HTMLInputElement;
const analyzeBtn = document.getElementById('analyzeBtn') as HTMLButtonElement;

// Enable analyze button when response file is selected
responseFileInput.addEventListener('change', () => {
    analyzeBtn.disabled = !responseFileInput.files?.length;
});

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

async function startRecordingAndPlayback(): Promise<void> {
    try {
        // Initialize audio context and get microphone stream
        const audioContext = await initializeAudioContext();
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: false, 
                noiseSuppression: false, 
                autoGainControl: false 
            } 
        });
        
        // Create media recorder
        acquisitionState.recordedChunks = [];
        acquisitionState.mediaRecorder = new MediaRecorder(stream);
        acquisitionState.isRecording = true;

        acquisitionState.mediaRecorder.ondataavailable = (e: BlobEvent) => {
            acquisitionState.recordedChunks.push(e.data);
        };

        acquisitionState.mediaRecorder.onstop = async () => {
            const recordedBlob = new Blob(acquisitionState.recordedChunks, { type: 'audio/wav' });
            const url = URL.createObjectURL(recordedBlob);
            recordedAudioEl.src = url;
            recordedAudioContainer.style.display = 'block';
            recordingVisualizationEl.style.display = 'none';
        };

        // Generate and play sweep
        const startFreq = parseFloat(sweepStartFreqInput.value);
        const endFreq = parseFloat(sweepEndFreqInput.value);
        const duration = parseFloat(sweepDurationInput.value);
        
        // Pre and post recording buffers (in seconds)
        const preRecordTime = 0.5;  // Start recording 0.5s before playback
        const postRecordTime = 1.0; // Continue recording 1s after playback ends
        const totalRecordTime = preRecordTime + duration + postRecordTime;

        const [sweepSignal, , ] = audio.chirp(startFreq, endFreq, duration);

        // Create audio buffer from sweep signal
        const audioBuffer = audioContext.createBuffer(1, sweepSignal.length, audioContext.sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        channelData.set(sweepSignal);

        // Create gain nodes for monitoring
        const sourceGain = audioContext.createGain();
        sourceGain.gain.value = 0.5;

        // Start recording
        recordingStatusEl.textContent = `Recording for ${totalRecordTime.toFixed(1)}s...`;
        recordingVisualizationEl.style.display = 'block';
        acquisitionState.mediaRecorder.start();

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

        // Stop recording after total time (pre + sweep + post)
        setTimeout(() => {
            stopRecording();
        }, totalRecordTime * 1000);

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
    if (acquisitionState.mediaRecorder && acquisitionState.isRecording) {
        acquisitionState.mediaRecorder.stop();
        acquisitionState.isRecording = false;

        // Stop microphone stream
        acquisitionState.mediaRecorder.stream.getTracks().forEach(track => track.stop());

        recordingStatusEl.textContent = 'Recording complete. Ready to analyze.';
        recordingStatusEl.style.color = '#28a745';
    }

    if (acquisitionState.playbackSource) {
        acquisitionState.playbackSource.stop();
    }

    // Update UI
    startBtn.disabled = false;
    stopBtn.disabled = true;
    playBtn.disabled = false;
    sweepStartFreqInput.disabled = false;
    sweepEndFreqInput.disabled = false;
    sweepDurationInput.disabled = false;
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

// Event listeners for acquisition controls
startBtn.addEventListener('click', startRecordingAndPlayback);
stopBtn.addEventListener('click', stopRecording);
playBtn.addEventListener('click', playbackOnly);
stopPlayBtn.addEventListener('click', stopPlayback);

analyzeRecordingBtn.addEventListener('click', async () => {
    if (!recordedAudioEl.src) return;

    try {
        const audioContext = await initializeAudioContext();
        const response = await fetch(recordedAudioEl.src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Extract the selected channel
        const selectedChannel = parseInt(channelSelect.value, 10);
        let recordedAudio: Audio;
        
        if (audioBuffer.numberOfChannels > 1 && selectedChannel < audioBuffer.numberOfChannels) {
            // Multi-channel recording: extract selected channel
            const channelData = audioBuffer.getChannelData(selectedChannel);
            recordedAudio = Audio.fromSamples(channelData, audioBuffer.sampleRate);
        } else {
            // Single channel or default to first channel
            recordedAudio = Audio.fromAudioBuffer(audioBuffer);
        }

        // Generate the chirp sweep as reference data
        const startFreq = parseFloat(sweepStartFreqInput.value);
        const endFreq = parseFloat(sweepEndFreqInput.value);
        const duration = parseFloat(sweepDurationInput.value);

        const [sweepSignal] = audio.chirp(startFreq, endFreq, duration);
        const referenceAudio = Audio.fromSamples(sweepSignal, audioContext.sampleRate);

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
            `${startFreq}-${endFreq}Hz`
        );
    } catch (error) {
        console.error('Error analyzing recording:', error);
        alert('Error analyzing recording: ' + (error as Error).message);
    }
});

viewWaveformBtn.addEventListener('click', async () => {
    if (!recordedAudioEl.src) return;

    try {
        const audioContext = await initializeAudioContext();
        const response = await fetch(recordedAudioEl.src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Extract the selected channel
        const selectedChannel = parseInt(channelSelect.value, 10);
        let recordedAudio: Audio;
        
        if (audioBuffer.numberOfChannels > 1 && selectedChannel < audioBuffer.numberOfChannels) {
            // Multi-channel recording: extract selected channel
            const channelData = audioBuffer.getChannelData(selectedChannel);
            recordedAudio = Audio.fromSamples(channelData, audioBuffer.sampleRate);
        } else {
            // Single channel or default to first channel
            recordedAudio = Audio.fromAudioBuffer(audioBuffer);
        }

        // Add timestamp to tab name
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

        // Create analysis tab with only the recorded audio (no reference)
        createAnalysisTab(
            recordedAudio.applyGain(1 / 16384),
            null,
            recordingName,
            'Waveform View'
        );
    } catch (error) {
        console.error('Error viewing waveform:', error);
        alert('Error viewing waveform: ' + (error as Error).message);
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

analyzeBtn.addEventListener('click', async () => {
    const responseFile = responseFileInput.files?.[0];
    const referenceFile = referenceFileInput.files?.[0];

    if (!responseFile) return;

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Analyzing...';

    try {
        const responseData = await audio.loadAudioFile(responseFile);
        const referenceData = referenceFile ? await audio.loadAudioFile(referenceFile) : null;

       createAnalysisTab(responseData.applyGain(1 / 16384), referenceData ? referenceData.applyGain(1 / 16384) : null, responseFile.name, referenceFile?.name || null);
    } catch (error) {
        alert('Error analyzing files: ' + (error as Error).message);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Analyze Frequency Response';
    }
});


/**
 * Creates a new analysis tab in the UI and renders magnitude, phase and impulse-response plots for the provided audio.
 *
 * Description:
 * - Performs spectral and time-domain analysis: computes the FFT of the response, computes an impulse response (two-channel) and derives an FFT from that IR for reference comparison.
 * - Plots: Magnitude (dB) with raw and smoothed reference traces, Phase (degrees) with raw and smoothed traces, and the time-domain impulse response.
 * - Smoothing: applies smoothFFT to the reference frequency response using the smoothing parameters 1/6 and 1/48 (producing "Magnitude (Smoothed)" and "Phase (Smoothed)").
 *
 * Side effects:
 * - Mutates DOM by adding a closable tab button and corresponding tab content elements.
 * - Renders plots using Plotly into the created tab content.
 * - Persists analysis state to storage (IndexedDB/sessionStorage mirror).
 *
 * @param responseData - Audio buffer for the response file to analyze (Float32Array samples in Audio.data).
 * @param referenceData - Optional Audio buffer for the reference file; when provided, reference magnitude/phase and smoothed curves are computed and plotted.
 * @param filename - Display name for the response file (used in tab title and header).
 * @param referenceFilename - Optional display name for the reference file (appended to tab title when present).
 * @returns void
 */
function createAnalysisTab(responseData: Audio, referenceData: Audio | null, filename: string, referenceFilename: string | null): void {
    tabCounter++;
    const tabId = `analysis-${tabCounter}`;
    let shortName = filename.length > 20 ? filename.substring(0, 17) + '...' : filename;
    if (referenceFilename != null) {
        const shortReferenceName = referenceFilename?.length > 20 ? referenceFilename.substring(0, 17) + '...' : referenceFilename;
        shortName += ' / ' + shortReferenceName;
    }
    // Create tab button
    const tab = document.createElement('button');
    tab.className = 'tab tab-closable';
    tab.dataset.tab = tabId;
    tab.innerHTML = `<span class="tab-icon-analysis"></span>${shortName} <span class="tab-close">✕</span>`;
    tabsContainer.appendChild(tab);
    
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
            
        <div class="flex h-full">
            <div class="flex-none w-64 border-r border-[#ddd] p-2 relative" style="transition:50ms linear;">
                <div class="analysis-description" style="margin-bottom:12px; font-size:0.95rem; color:#24292e;">
                    <p><strong>Analysis:</strong> Magnitude, phase and impulse‑response computed from the uploaded response (and optional reference) via FFT and a two‑channel impulse response.</p>
                    <p><strong>Smoothing:</strong> Fractional‑octave smoothing applied to the reference response (1/6 octave).</p>
                </div>
                <div id="resize-handle" class="resize-handle"></div>
            </div>
            <div class="flex-1 h-full overflow-scroll-y">
                <div class="grid grid-cols-6 gap-[1px] bg-[#ddd] border-b border-[#ddd]">
                    <div class="plot-box">
                        <div id="plot-${tabId}-magnitude" class="plot-medium"></div>
                    </div>
                    <div class="plot-box">
                        <div id="plot-${tabId}-phase" class="plot-medium"></div>
                    </div>
                    <div class="plot-box">
                        <div id="plot-${tabId}-ir" class="plot-medium"></div>
                    </div>
                    <div class="plot-box bg-white">
                        <div class="plot-medium"></div>
                    </div>
                </div>
            </div>
        </div>
        
    `;
    tabContents.appendChild(content);

    // Switch to new tab
    switchTab(tabId);

    // If no reference data, render waveform view instead of frequency response
    if (!referenceData) {
        tab.innerHTML = `<span class="tab-icon-waveform"></span>${shortName} <span class="tab-close">✕</span>`;
        // For waveform view, we need to replace the entire tab-inner-content structure
        const tabInnerContent = content.querySelector<HTMLElement>('.tab-inner-content');
        if (tabInnerContent) {
            tabInnerContent.innerHTML = `
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 40px; display: flex; gap: 8px; align-items: center; padding: 0 12px; background: white; border-bottom: 1px solid #ddd; z-index: 10;">
                    <h5 class="text-xs italic text-gray-600" style="margin: 0; flex-grow: 1;">Waveform View - ${filename}</h5>
                    <button id="play-${tabId}" class="button-custom button-custom-primary">Play</button>
                    <button id="stop-${tabId}" class="button-custom button-custom-secondary" disabled>Stop</button>
                </div>
                <div id="waveform-${tabId}" style="position: absolute; top: 40px; left: 0; right: 0; bottom: 0;"></div>
            `;
            
            // Set tab-inner-content to position: relative for positioning context
            tabInnerContent.style.position = 'relative';
            tabInnerContent.style.top = '0';
            tabInnerContent.style.left = '0';
            tabInnerContent.style.right = '0';
            tabInnerContent.style.bottom = '0';
            tabInnerContent.style.padding = '0';
            tabInnerContent.style.overflow = 'hidden';
            tabInnerContent.style.width = '100%';
            tabInnerContent.style.height = '100%';

            // Create waveform editor
            const waveformEl = content.querySelector<HTMLElement>(`#waveform-${tabId}`);
            const playBtn = content.querySelector<HTMLButtonElement>(`#play-${tabId}`);
            const stopBtn = content.querySelector<HTMLButtonElement>(`#stop-${tabId}`);

            if (waveformEl && playBtn && stopBtn) {
                const editor = createWaveformEditor(waveformEl, responseData);

                playBtn.addEventListener('click', () => {
                    editor.play();
                    playBtn.disabled = true;
                    stopBtn.disabled = false;
                });

                stopBtn.addEventListener('click', () => {
                    editor.stop();
                    playBtn.disabled = false;
                    stopBtn.disabled = true;
                });
            }
        }
        
        saveState();
        return;
    }

    // Compute and plot FFTs
    console.log('Analyzing response file:', filename);
    console.log('Response audio data:', responseData);
    const responseSamples = responseData.getChannelData(0);
    
    console.log(responseData.getChannelData(0));
    const responseFFT = computeFFT(responseSamples);
    const tracesMagnitude: any[] = [{
        x: responseFFT.frequency,
        y: db(responseFFT.magnitude),
        type: 'scatter',
        mode: 'lines',
        name: 'Measurement signal',
        line: { color: '#0366d6', width: 2 }
    }];
    const tracesPhase: any[] = [];
    const tracesPhaseSecondary: any[] = [];
    const tracesIR: any[] = [];

    let irPeakAt = 0;

    let referenceSamples = Float32Array.from([]);

    if (referenceData) {
        referenceSamples = referenceData.getChannelData(0);
        const referenceFFT: FFTResult = computeFFT(referenceSamples);
        tracesMagnitude.push({
            x: referenceFFT.frequency,
            y: db(referenceFFT.magnitude),
            type: 'scatter',
            mode: 'lines',
            name: 'Reference signal',
            line: { color: '#0366d6', width: 2 }
        });
        const ir: ImpulseResponseResult = twoChannelImpulseResponse(responseSamples, referenceSamples);
        const farina_ir: ImpulseResponseResult = FarinaImpulseResponse(responseSamples, referenceSamples);

        console.log('Impulse response peak at', ir.peakAt);
        irPeakAt = ir.peakAt;

        tracesIR.push({
            x: ir.t,
            y:ir.ir,        
            type: 'scatter',
            mode: 'lines',
            name: 'Dual-FFT Impulse Response',
            line: { color: '#d73a49', width: 1 }
        });
        /* tracesIR.push({
            x: farina_ir.t,
            y: db(farina_ir.ir.map(v => Math.abs(v))),        
            type: 'scatter',
            mode: 'lines',
            name: 'Farina Impulse Response',
            line: { color: '#d73a49', width: 1 }
        }); */
        const transferFunction = computeFFTFromIR(ir);
        const transferFunctionFarina = computeFFTFromIR(farina_ir);
        // const dreferenceFFT = twoChannelFFT(responseData.data, referenceSamples, nextPow2(referenceSamples.length), -5627);
        const smoothedFreqResponse = smoothFFT(transferFunction, 1/6, 1/48);
        const smoothedFreqResponseFarina = smoothFFT(transferFunctionFarina, 1/6, 1/48);
        
        const rmsValue = 1;  // rms(referenceSamples);
        console.log('Reference RMS:', db(rmsValue));

        tracesMagnitude.push({
            x: transferFunction.frequency,
            y: db(transferFunction.magnitude.map(v => v * rmsValue)),
            type: 'scatter',
            mode: 'lines',
            name: 'Dual-FFT Transfer Function (Raw)',
            line: { color: '#d73a4933', width: 1 }
        });
        tracesMagnitude.push({
            x: smoothedFreqResponse.frequency,
            y: smoothedFreqResponse.magnitude.map(v => v + db(rmsValue)),
            type: 'scatter',
            mode: 'lines',
            name: 'Dual-FFT Transfer Function (Smoothed)',
            line: { color: '#d73a49', width: 2 }
        });
        tracesMagnitude.push({
            x: transferFunctionFarina.frequency.map(v => v),
            y: db(transferFunctionFarina.magnitude.map(v => v * rmsValue)),
            type: 'scatter',
            mode: 'lines',
            name: 'Farina Transfer Function',
            line: { color: '#341fad33', width: 1 }
        });
        tracesMagnitude.push({
            x: smoothedFreqResponseFarina.frequency.map(v => v),
            y: smoothedFreqResponseFarina.magnitude.map(v => v + db(rmsValue)),
            type: 'scatter',
            mode: 'lines',
            name: 'Farina Transfer Function (Smoothed)',
            line: { color: '#341fadff', width: 2 }
        });


        tracesPhase.push({
            x: transferFunction.frequency,
            y: transferFunction.phase,
            type: 'scatter',
            mode: 'lines',
            name: 'Dual-FFT Transfer Function (Raw)',
            line: { color: '#d73a4933', width: 1 }
        });
        tracesPhase.push({
            x: smoothedFreqResponse.frequency,
            y: smoothedFreqResponse.phase,
            type: 'scatter',
            mode: 'lines',
            name: 'Dual-FFT Transfer Function (Smoothed)',
            line: { color: '#d73a49', width: 2 }
        });
        const gd = groupDelays(transferFunction, 1000);
        tracesPhase.push({
            x: transferFunction.frequency,
            y: gd,
            type: 'scatter',
            mode: 'lines',
            name: 'Group Delay (Calculated on a reduced set of points)',
            line: { color: '#d73a49', width: 2, dash: 'dot' },
            yaxis: 'y2'
        });
    }

    const plotSettings: {[key: string]: any} = {
        plotGlPixelRatio: 2, // For better clarity on high-DPI screens
        legend: {"orientation": "h", "y": -0.2, "yanchor": "top"},
        plot_bgcolor: '#fafbfc',
        paper_bgcolor: '#fff',
        staticPlot: false, // Enable interactivity
        dragmode: 'pan',
        showAxisDragHandles: true,
        showAxisRangeEntryBoxes: true,
        axisDragOnHover: true,
        tightenLats: true,
        font: {
            family: "'Newsreader', Georgia, 'Times New Roman', Times, serif",
        },
        margin: { t: 80, r: 65, b: 70, l: 65 }
    };

    const layoutPhase = {
        title: 'Phase Analysis',
        xaxis: { 
            title: 'Frequency (Hz)', 
            type: 'log',
            gridcolor: '#e1e4e8',
            range: [Math.log10(20), Math.log10(20000)],
            tickformat: '.0f',
        },
        yaxis: { 
            title: 'Phase (degrees)',
            gridcolor: '#e1e4e8',
            automargin: true,
            range: [-720, 720],
        },
        yaxis2: { 
            title: 'Group Delay (ms)',
            gridcolor: '#e1e4e8',
            automargin: true,
            anchor: 'x', 
            overlaying: 'y', 
            side: 'right',
            range: [-20, 20],
        },
        ...plotSettings
    };

    (window as any).Plotly.newPlot(`plot-${tabId}-phase`, tracesPhase, layoutPhase, { responsive: true });


    const layoutMagnitude = {
        title: 'Magnitude Analysis',    
        xaxis: { 
            title: 'Frequency (Hz)', 
            type: 'log',
            gridcolor: '#e1e4e8',
            range: [Math.log10(20), Math.log10(20000)],
            tickformat: '.0f',

        },
        yaxis: { 
            title: 'Magnitude (dB)',
            gridcolor: '#e1e4e8',
            rangemode: 'tozero',
            range: [-85, 5],
        },
        ...plotSettings
    };

    (window as any).Plotly.newPlot(`plot-${tabId}-magnitude`, tracesMagnitude, layoutMagnitude, { responsive: true });

    
    const layoutIR = {
        title: 'Impulse response',
        xaxis: { 
            title: 'Amplitude', 
            gridcolor: '#e1e4e8',
            range: [-0.05 + irPeakAt / responseData.sampleRate, 0.05 + irPeakAt / responseData.sampleRate],
        },
        yaxis: { 
            title: 'Amplitude (gain)',
            gridcolor: '#e1e4e8',
            automargin: true,
        },
        ...plotSettings
    };

    (window as any).Plotly.newPlot(`plot-${tabId}-ir`, tracesIR, layoutIR, { responsive: true });
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

// Load state on page load
loadState();

function max(arg0: Float32Array<ArrayBuffer>): any {
    throw new Error("Function not implemented.");
}

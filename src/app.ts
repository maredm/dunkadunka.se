import { Audio, computeFFT, computeFFTFromIR, db, FFTResult, groupDelays, ImpulseResponseResult, rms, smoothFFT, twoChannelImpulseResponse } from "./audio";
import { FarinaImpulseResponse } from "./farina";
import { storage } from "./storage";
import { audio } from "./audio";
import { createWaveformEditor, WaveformEditor } from "./waveform_editor";
import "./device-settings";
import { linspace } from "./math";

console.debug("App module loaded");

const root = document.documentElement;
const uiColor = "#0366d6";
root.style.setProperty('--color', uiColor);

let tabCounter = 0;
const tabsContainer = document.getElementById('tabs-outer') as HTMLElement;
const tabsInnerContainer = document.getElementById('tabs') as HTMLElement;
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

function addPlotToList(tabId: string, plotId: string, plotName: string, hidden: boolean = false): void {
    const plotList = document.getElementById(`plot-list-${tabId}`) as HTMLElement;
    const listItem = document.createElement('li');
    listItem.innerHTML = `<input type="checkbox" id="checkbox-${plotId}" alt="show/hide" ${hidden ? '' : 'checked'}><label for="checkbox-${plotId}">${plotName}</label>`;
    plotList.appendChild(listItem);
}

function addPlotElement(tabId: string, plotId: string, hidden: boolean = false): HTMLElement {
    const tabContent = document.querySelector(`[data-content="${tabId}"]`) as HTMLElement;
    const plotBox = document.createElement('div');
    plotBox.className = 'plot-box';
    plotBox.innerHTML = `
        <div id="${plotId}" class="plot-medium"></div>
        <div class="button-bar">
            <button>Customize...</button>
            <button>Export as...</button>
            <label for="checkbox-${plotId}">Hide</label>
        </div>
    `;
    tabContent.querySelector('.plot-outer')?.appendChild(plotBox);
    if (hidden) {
        plotBox.style.display = 'none';
    }
    return plotBox.querySelector(`#${plotId}`) as HTMLElement;
}

function plot(
    traces: any[], 
    tabId: string,
    title: string, 
    xTitle: string, 
    yTitle: string, 
    xAxisExtras: any = {},
    yAxisExtras: any = {},
    layoutExtras: any = {},
    hidden: boolean = false,
): void {
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

    const layout = {
        title: title,
        xaxis: { 
            title: xTitle,
            gridcolor: '#e1e4e8',
            tickformat: '.0f',
            ...xAxisExtras
        },
        yaxis: { 
            title: yTitle,
            gridcolor: '#e1e4e8',
            automargin: true,
            ...yAxisExtras
        },
        ...layoutExtras,
        ...plotSettings
    };

    const plotId = `plot-${tabId}-${title.toLowerCase().replace(/\s+/g, '-')}`;

    const element = addPlotElement(tabId, plotId, hidden);
    (window as any).Plotly.newPlot(element, traces, layout, {responsive: true});
    addPlotToList(tabId, plotId, title, hidden);

    document.getElementById(`checkbox-${plotId}`)?.addEventListener('change', (e) => {
        const box = document.getElementById(`${plotId}`)!.parentElement!;
        box.setAttribute('style', (e.target as HTMLInputElement).checked ? 'display: block;' : 'display: none;');
        window.dispatchEvent(new Event('resize'));
    });

    console.log(`Plotted ${title} in tab ${tabId}`);
}


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
    tabsInnerContainer.appendChild(tab);
    
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
                    <p><i>There are no properties for this analysis.</i></p>
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

    // Switch to new tab
    switchTab(tabId);

    // Compute and plot FFTs
    console.log('Analyzing response file:', filename);
    console.log('Response audio data:', responseData);
    const responseSamples = responseData.getChannelData(0);
    
    const responseFFT = computeFFT(responseSamples);
    const smoothedResponseFFT = smoothFFT(responseFFT, 1/6, 1/48);
    const tracesPhase: any[] = [];
    const tracesPhaseSecondary: any[] = [];
    const tracesIR: any[] = [];

    let irPeakAt = 0;

    let referenceSamples = Float32Array.from([]);

    plot(
        [
            {x: responseFFT.frequency, y: db(responseFFT.magnitude), name: 'Measurement signal', line: { color: '#0366d666', width: 1 }},
            {x: smoothedResponseFFT.frequency, y: smoothedResponseFFT.magnitude, name: 'Measurement signal (Smoothed)', line: { color: '#0366d6', width: 2 }}
        ], 
        tabId, 
        'Recorded Spectrogram', 
        'Frequency', 
        'Amplitude (dBFS)',
        {type: 'log', range: [Math.log10(20), Math.log10(20000)]}, 
        {}, 
        {}, 
        true
    );
    plot(
        [
            {x: linspace(0, responseSamples.length/48000, responseSamples.length), y: responseSamples, name: 'Recorded signal', line: { color: '#0366d6ff', width: 1 }}
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

    if (referenceData) {
        referenceSamples = referenceData.getChannelData(0);
        const referenceFFT: FFTResult = computeFFT(referenceSamples);
        const smoothedReferenceFFT = smoothFFT(referenceFFT, 1/6, 1/48);
        plot(
            [
                {x: referenceFFT.frequency, y: db(referenceFFT.magnitude), name: 'Stimulus signal', line: { color: '#0366d666', width: 1 }},
                {x: smoothedReferenceFFT.frequency, y: smoothedReferenceFFT.magnitude, name: 'Stimulus signal (Smoothed)', line: { color: '#0366d6', width: 2 }}
            ], 
            tabId, 
            'Stimulus Spectrogram', 
            'Frequency', 
            'Amplitude (dBFS)',
            {type: 'log', range: [Math.log10(20), Math.log10(20000)]}, 
            {}, 
            {}, 
            true
        );
        plot(
            [
                {x: linspace(0, referenceSamples.length/48000, referenceSamples.length), y: referenceSamples, name: 'Recorded signal', line: { color: '#0366d6ff', width: 1 }}
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
        const transferFunction = computeFFTFromIR(ir);
        const transferFunctionFarina = computeFFTFromIR(farina_ir);
        // const dreferenceFFT = twoChannelFFT(responseData.data, referenceSamples, nextPow2(referenceSamples.length), -5627);
        const smoothedFreqResponse = smoothFFT(transferFunction, 1/6, 1/48);
        const smoothedFreqResponseFarina = smoothFFT(transferFunctionFarina, 1/6, 1/48);
        const gd = groupDelays(transferFunction, 1000);

        plot(
            [
                {x: transferFunction.frequency, y: db(transferFunction.magnitude), name: 'Magnitude', line: { color: '#0366d666', width: 1 }},
                {x: smoothedFreqResponse.frequency, y: smoothedFreqResponse.magnitude, name: 'Magnitude (Smoothed)', line: { color: '#0366d6', width: 2 }}
            ], 
            tabId, 
            'Transfer Function', 
            'Frequency', 
            'Amplitude (dBFS)',
            {type: 'log', range: [Math.log10(20), Math.log10(20000)]}, 
            {range: [-85, 5]},
            {}, 
            false
        );
        plot(
            [
                {x: transferFunctionFarina.frequency, y: db(transferFunctionFarina.magnitude), name: 'Fundamental', line: { color: '#0366d666', width: 1 }},
                {x: smoothedFreqResponseFarina.frequency, y: smoothedFreqResponseFarina.magnitude, name: 'Fundamental (Smoothed)', line: { color: '#0366d6', width: 2 }}
            ], 
            tabId, 
            'Fundamental and Harmonic Distortion', 
            'Frequency', 
            'Amplitude (dBFS)',
            {type: 'log', range: [Math.log10(20), Math.log10(20000)]}, 
            {range: [-85, 5]},
            {}, 
            false
        );
        plot(
            [
                {x: transferFunction.frequency, y: transferFunction.phase, name: 'Phase', line: { color: '#0366d666', width: 1 }},
                {x: smoothedFreqResponse.frequency, y: smoothedFreqResponse.phase, name: 'Phase (Smoothed)', line: { color: '#0366d6', width: 2 }}
            ], 
            tabId, 
            'Phase', 
            'Frequency', 
            'Amplitude (dBFS)',
            {type: 'log', range: [Math.log10(20), Math.log10(20000)]}, 
            {range: [-720, 720]}, 
            {}, 
            false
        );
        plot(
            [
                {x: transferFunctionFarina.frequency, y: gd, name: 'Group Delay', line: { color: '#d73a49', width: 2, dash: 'dot' }}
            ], 
            tabId, 
            'Group Delay', 
            'Frequency', 
            'Group Delay (ms)',
            {type: 'log', range: [Math.log10(20), Math.log10(20000)]}, 
            {range: [-20, 20]}, 
            {}, 
            false
        );
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

        // Add event listeners for checkbox visibility toggles
    document.getElementById(`checkbox-magnitude-${tabId}`)?.addEventListener('change', (e) => {
        console.log('Toggling magnitude plot visibility');
        const box = document.getElementById(`plot-${tabId}-magnitude`)!.parentElement!;
        box.setAttribute('style', (e.target as HTMLInputElement).checked ? 'display: block;' : 'display: none;');
    });

    document.getElementById(`checkbox-phase-${tabId}`)?.addEventListener('change', (e) => {
        const box = document.getElementById(`plot-${tabId}-phase`)!.parentElement!;
        box.setAttribute('style', (e.target as HTMLInputElement).checked ? 'display: block;' : 'display: none;');
    });

    document.getElementById(`checkbox-ir-${tabId}`)?.addEventListener('change', (e) => {
        const box = document.getElementById(`plot-${tabId}-ir`)!.parentElement!;
        box.setAttribute('style', (e.target as HTMLInputElement).checked ? 'display: block;' : 'display: none;');
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

// Load state on page load
loadState();

function max(arg0: Float32Array<ArrayBuffer>): any {
    throw new Error("Function not implemented.");
}

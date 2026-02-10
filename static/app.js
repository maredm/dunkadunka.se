"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const audio_1 = require("./audio");
const farina_1 = require("./farina");
const storage_1 = require("./storage");
const audio_2 = require("./audio");
require("./device-settings");
const math_1 = require("./math");
const plotting_1 = require("./plotting");
const recorder_1 = require("./recorder");
const wave_1 = require("./wave");
console.debug("App module loaded");
const fileMap = new Map();
const root = document.documentElement;
const uiColor = "#0366d6";
root.style.setProperty('--color', uiColor);
let tabCounter = 0;
const tabsContainer = document.getElementById('tabs-outer');
const tabsInnerContainer = document.getElementById('tabs');
const tabContents = document.getElementById('tab-contents');
const responseFileUploadInput = document.getElementById('responseFileUpload');
const referenceFileUploadInput = document.getElementById('referenceFileUpload');
const analyzeUploadBtn = document.getElementById('analyzeUploadBtn');
// Polar upload controls
const polarReferenceFileInput = document.getElementById('polarReferenceFile');
const polarMeasurementsEl = document.getElementById('polarMeasurements');
const addPolarMeasurementBtn = document.getElementById('addPolarMeasurementBtn');
const analyzePolarBtn = document.getElementById('analyzePolarBtn');
const polarStatusEl = document.getElementById('polarStatus');
function normalizeAngleDeg(angleDeg) {
    let a = angleDeg % 360;
    if (a < 0)
        a += 360;
    return a;
}
const statusMessage = document.getElementById('statusMessage');
function setStatusMessage(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.style.color = isError ? '#d73a49' : '#28a745';
}
const acquisitionState = {
    audioContext: null,
    mediaRecorder: null,
    recordedChunks: [],
    oscillatorNode: null,
    playbackSource: null,
    isRecording: false
};
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const playBtn = document.getElementById('playBtn');
const stopPlayBtn = document.getElementById('stopPlayBtn');
const sweepStartFreqInput = document.getElementById('sweepStartFreq');
const sweepEndFreqInput = document.getElementById('sweepEndFreq');
const sweepDurationInput = document.getElementById('sweepDuration');
const recordingStatusEl = document.getElementById('recordingStatus');
const recordingMeterEl = document.getElementById('recordingMeter');
const recordingVisualizationEl = document.getElementById('recordingVisualization');
const recordedAudioContainer = document.getElementById('recordedAudioContainer');
const recordedAudioEl = document.getElementById('recordedAudio');
const analyzeRecordingBtn = document.getElementById('analyzeRecordingBtn');
const viewWaveformBtn = document.getElementById('viewWaveformBtn');
const channelSelectionContainer = document.getElementById('channelSelectionContainer');
const channelSelect = document.getElementById('channelSelect');
function initializeAudioContext() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!acquisitionState.audioContext) {
            acquisitionState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (acquisitionState.audioContext.state === 'suspended') {
            yield acquisitionState.audioContext.resume();
        }
        return acquisitionState.audioContext;
    });
}
function detectAndSetupChannels() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            // Request audio input to check channel count
            const stream = yield navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            });
            const audioContext = yield initializeAudioContext();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            // Get channel count from the stream
            const channelCount = ((_a = source.mediaStream.getAudioTracks()[0].getSettings()) === null || _a === void 0 ? void 0 : _a.channelCount) || 1;
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
            }
            else {
                channelSelectionContainer.style.display = 'none';
            }
        }
        catch (error) {
            console.error('Error detecting channels:', error);
            channelSelectionContainer.style.display = 'none';
        }
    });
}
// Detect channels when the acquisition tab is opened
tabsContainer.addEventListener('click', (e) => {
    const target = e.target;
    if (target.classList.contains('tab') && target.dataset.tab === 'acquisition') {
        detectAndSetupChannels();
    }
});
let recorded = [Float32Array.from([]), Float32Array.from([])];
function startRecordingAndPlayback() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const audioContext = yield initializeAudioContext();
            // Generate and play sweep
            const startFreq = parseFloat(sweepStartFreqInput.value);
            const endFreq = parseFloat(sweepEndFreqInput.value);
            const duration = parseFloat(sweepDurationInput.value);
            // Pre and post recording buffers (in seconds)
            const preRecordTime = 0.5; // Start recording 0.5s before playback
            const postRecordTime = 1.0; // Continue recording 1s after playback ends
            const totalRecordTime = preRecordTime + duration + postRecordTime;
            const [sweepSignal, ,] = audio_2.audio.chirp(startFreq, endFreq, duration);
            // Create audio buffer from sweep signal
            const audioBuffer = audioContext.createBuffer(1, sweepSignal.length, audioContext.sampleRate);
            const channelData = audioBuffer.getChannelData(0);
            channelData.set(sweepSignal);
            // Create gain nodes for monitoring
            const sourceGain = audioContext.createGain();
            sourceGain.gain.value = 0.5;
            // Start recording
            recordingStatusEl.textContent = `Recording for ${totalRecordTime.toFixed(1)}s...`;
            const stream = yield navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            });
            const recorder = new recorder_1.AudioRecorder(audioContext.createMediaStreamSource(stream));
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
            yield recorded.then(data => {
                var _a;
                const audio = audio_1.Audio.fromSamples(data[0], 48000, { filename: `Recording ${new Date().toISOString()}` });
                const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
                const li = createListItem(audio, id);
                fileMap.set(id, audio);
                (_a = document.getElementById('fileList')) === null || _a === void 0 ? void 0 : _a.appendChild(li);
                console.log('Recorded audio saved with id:', id);
                saveWaveformsToStorage(fileMap);
                switchTab('upload');
            }).then(() => {
                // Any cleanup code if needed
                stopRecording();
                // Create Audio object and save.
            });
        }
        catch (error) {
            console.error('Error starting recording:', error);
            recordingStatusEl.textContent = `Error: ${error.message}`;
            recordingStatusEl.style.color = '#d73a49';
        }
    });
}
function playbackOnly() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const audioContext = yield initializeAudioContext();
            const startFreq = parseFloat(sweepStartFreqInput.value);
            const endFreq = parseFloat(sweepEndFreqInput.value);
            const duration = parseFloat(sweepDurationInput.value);
            const [sweepSignal] = audio_2.audio.chirp(startFreq, endFreq, duration);
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
        }
        catch (error) {
            console.error('Error during playback:', error);
            recordingStatusEl.textContent = `Error: ${error.message}`;
            recordingStatusEl.style.color = '#d73a49';
        }
    });
}
function stopRecording() {
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
function stopPlayback() {
    if (acquisitionState.playbackSource) {
        try {
            acquisitionState.playbackSource.stop();
        }
        catch (e) {
            // Already stopped
        }
    }
    recordingStatusEl.textContent = 'Playback stopped.';
    playBtn.disabled = false;
    stopPlayBtn.disabled = true;
}
const measurementAngleInput = document.getElementById('measurementAngle');
const measurementLocationInput = document.getElementById('measurementLocation');
const measurementCommentInput = document.getElementById('measurementComment');
const downloadRecordingBtn = document.getElementById('downloadRecordingBtn');
downloadRecordingBtn === null || downloadRecordingBtn === void 0 ? void 0 : downloadRecordingBtn.addEventListener('click', () => {
    try {
        (0, wave_1.download)(recorded[0], 48000, 'recorded_audio.wav', {}, (0, wave_1.convertToIXML)(`
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
    }
    catch (err) {
        console.error('Failed to create/download recording:', err);
        alert('Failed to download recording: ' + err.message);
    }
});
const downloadSweepBtn = document.getElementById('downloadSweepBtn');
downloadSweepBtn === null || downloadSweepBtn === void 0 ? void 0 : downloadSweepBtn.addEventListener('click', () => {
    try {
        (0, wave_1.download)(recorded[0], 48000, 'reference_audio.wav', {}, (0, wave_1.convertToIXML)(`
        <STIMULUS>
            <TYPE>chirp</TYPE>
            <START>${sweepStartFreqInput.value}</START>
            <END>${sweepEndFreqInput.value}</END>
            <FADE>0.01</FADE>
            <DURATION>${sweepDurationInput.value}</DURATION>
            <SAMPLE_RATE>48000</SAMPLE_RATE>
        </STIMULUS>
        <ORIGIN>Acquisition Module</ORIGIN>`));
    }
    catch (err) {
        console.error('Failed to create/download recording:', err);
        alert('Failed to download recording: ' + err.message);
    }
});
// Event listeners for acquisition controls
startBtn.addEventListener('click', startRecordingAndPlayback);
stopBtn.addEventListener('click', stopRecording);
playBtn.addEventListener('click', playbackOnly);
stopPlayBtn.addEventListener('click', stopPlayback);
analyzeRecordingBtn.addEventListener('click', () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Analyzing recording...');
    try {
        const recordedAudio = audio_1.Audio.fromSamples(recorded[0], 48000);
        // Generate the chirp sweep as reference data
        const startFreq = parseFloat(sweepStartFreqInput.value);
        const endFreq = parseFloat(sweepEndFreqInput.value);
        const duration = parseFloat(sweepDurationInput.value);
        const [sweepSignal] = audio_2.audio.chirp(startFreq, endFreq, duration);
        const referenceAudio = audio_1.Audio.fromSamples(sweepSignal, 48000);
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
        createAnalysisTab(recordedAudio.applyGain(1 / 16384), referenceAudio.applyGain(1 / 16384), recordingName, `${startFreq}-${endFreq}Hz`);
        //
    }
    catch (error) {
        console.error('Error analyzing recording:', error);
        alert('Error analyzing recording: ' + error.message);
    }
}));
// Save state when the user attempts to close or reload the window
window.addEventListener('beforeunload', (e) => {
    try {
        saveState();
    }
    catch (err) {
        console.error('Failed to save state on beforeunload:', err);
    }
    // If you want to prompt the user to confirm leaving (browser-dependent), uncomment:
    // e.preventDefault();
    // e.returnValue = '';
});
// Tab switching
tabsContainer.addEventListener('click', (e) => {
    var _a;
    const target = e.target;
    if (target.classList.contains('tab-close')) {
        const tab = target.parentElement;
        const tabId = tab.dataset.tab;
        if (tabId == 'upload')
            return;
        console.debug('Closing tab', tabId);
        tab.remove();
        (_a = document.querySelector(`[data-content="${tabId}"]`)) === null || _a === void 0 ? void 0 : _a.remove();
        storage_1.storage.removeItem(`analysis-${tabId}`).catch(err => console.error('Failed to remove analysis from storage:', err));
        // Activate upload tab if current was closed
        if (tab.classList.contains('active')) {
            switchTab('upload');
        }
        saveState();
        e.stopPropagation();
    }
    else if (target.classList.contains('tab')) {
        const tabId = target.dataset.tab;
        if (tabId) {
            switchTab(tabId);
        }
    }
});
function switchTab(tabId) {
    var _a, _b;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    (_a = document.querySelector(`[data-tab="${tabId}"]`)) === null || _a === void 0 ? void 0 : _a.classList.add('active');
    (_b = document.querySelector(`[data-content="${tabId}"]`)) === null || _b === void 0 ? void 0 : _b.classList.add('active');
}
function compute(computation, ...message) {
    const delegate = () => {
        onmessage = ({ data: { computation, message } }) => {
            const wrapper = (fn) => Function('"use strict"; return (' + fn.toString() + ')')();
            const result = wrapper(computation)(...message);
            postMessage(result);
        };
    };
    const functionBody = delegate.toString().replace(/^[^{]*{\s*/, '').replace(/\s*}[^}]*$/, '');
    return new Promise((resolve, reject) => {
        const worker = new Worker(URL.createObjectURL(new Blob([functionBody], { type: 'text/javascript' })));
        worker.onmessage = ({ data }) => {
            resolve(data);
            worker.terminate();
        };
        worker.onerror = worker.onmessageerror = reject;
        worker.postMessage({ computation: computation.toString(), message });
        return worker;
    });
}
function createAnalysisTab(responseData, referenceData, filename, referenceFilename) {
    setStatusMessage('Creating analysis tab...');
    tabCounter++;
    const tabId = `analysis-${tabCounter}`;
    let shortName = filename.length > 20 ? filename.substring(0, 17) + '...' : filename;
    if (referenceFilename != null) {
        const shortReferenceName = (referenceFilename === null || referenceFilename === void 0 ? void 0 : referenceFilename.length) > 20 ? referenceFilename.substring(0, 17) + '...' : referenceFilename;
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
            var _a, _b;
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
            <b>RMS Level:</b> ${(0, audio_1.db)((0, audio_1.rms)(responseData.getChannelData(0)))} dBFS<br>
            <b>Peak Level:</b> ${(0, audio_1.db)((0, math_1.max)(responseData.getChannelData(0)))} dBFS<br>
            <iXML Metadata:</i><br>
            <pre>${(((_a = responseData.metadata) === null || _a === void 0 ? void 0 : _a.iXMLdata) || "").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre>
            `;
            }
            const sidebarToggleBtn = document.getElementById(`sidebar-toggle-${tabId}`);
            const sidecar = content.querySelector('.sidecar');
            const resizeHandle = content.querySelector('#resize-handle');
            sidebarToggleBtn.addEventListener('click', () => {
                if (sidecar.style.width === '0px') {
                    sidecar.style.width = '21.5rem';
                    sidebarToggleBtn.title = 'Close settings pane';
                }
                else {
                    sidecar.style.width = '0px';
                    sidebarToggleBtn.title = 'Open settings pane';
                }
            });
            let isResizing = false;
            let lastDownX = 0;
            resizeHandle.addEventListener('mousedown', (e) => {
                isResizing = true;
                lastDownX = e.clientX;
                document.body.style.cursor = 'ew-resize';
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!isResizing)
                    return;
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
            const responseFFT = (0, audio_1.computeFFT)(responseSamples);
            const smoothedResponseFFT = (0, audio_1.smoothFFT)(responseFFT, 1 / 6, 1 / 48);
            let referenceSamples = Float32Array.from([]);
            (0, plotting_1.plot)([
                { x: responseFFT.frequency, y: (0, audio_1.db)(responseFFT.magnitude), name: 'Recorded signal', line: { color: '#0366d666', width: 0.75 } },
                { x: smoothedResponseFFT.frequency, y: (0, audio_1.db)(smoothedResponseFFT.magnitude), name: 'Recorded signal (Smoothed)', line: { color: '#0366d6', width: 1.5 } }
            ], tabId, 'Recorded Spectrum', 'Frequency (Hz)', 'Amplitude (dBFS)', { type: 'log', range: [Math.log10(20), Math.log10(20000)] }, { range: [-85, 5] }, {}, true);
            (0, plotting_1.plot)([
                { x: (0, math_1.linspace)(0, responseSamples.length / 48000, responseSamples.length), y: responseSamples, name: 'Recorded signal', line: { color: '#0366d6ff', width: 0.75 } }
            ], tabId, 'Recorded Waveform', 'Time (s)', 'Amplitude', {}, {}, {}, true);
            setStatusMessage('');
            if (referenceData) {
                referenceSamples = referenceData.getChannelData(0);
                const referenceFFT = (0, audio_1.computeFFT)(referenceSamples);
                const smoothedReferenceFFT = (0, audio_1.smoothFFT)(referenceFFT, 1 / 6, 1 / 48);
                (0, plotting_1.plot)([
                    { x: referenceFFT.frequency, y: (0, audio_1.db)(referenceFFT.magnitude), name: 'Stimulus signal', line: { color: '#0366d666', width: 0.75 } },
                    { x: smoothedReferenceFFT.frequency, y: (0, audio_1.db)(smoothedReferenceFFT.magnitude), name: 'Stimulus signal (Smoothed)', line: { color: '#0366d6', width: 1.5 } }
                ], tabId, 'Stimulus Spectrum', 'Frequency (Hz)', 'Amplitude (dBFS)', { type: 'log', range: [Math.log10(20), Math.log10(20000)] }, { range: [-85, 5] }, {}, true);
                (0, plotting_1.plot)([
                    { x: (0, math_1.linspace)(0, referenceSamples.length / 48000, referenceSamples.length), y: referenceSamples, name: 'Stimulus signal', line: { color: '#0366d6ff', width: 0.75 } }
                ], tabId, 'Stimulus Waveform', 'Time (s)', 'Amplitude', {}, {}, {}, true);
                const ir = (0, audio_1.twoChannelImpulseResponse)(responseSamples, referenceSamples);
                const farina = new farina_1.Farina(referenceSamples, 20, 20000, 48000);
                const farina_ir = farina.deconvolvedResponse(responseSamples);
                (0, farina_1.plotDistortion)(farina, 0.1, 5, tabId);
                (0, farina_1.plotTHD)(farina, 0.1, 5, tabId);
                console.log('Impulse response peak at', farina.lag_of_harmonic(2));
                (0, plotting_1.plot)([
                    { x: ir.t, y: ir.ir, type: 'scatter', mode: 'lines', name: 'Dual-FFT Impulse Response', line: { color: plotting_1.COLORS[0], width: 0.75 } }
                ], tabId, 'Impulse Response', 'Time (s)', 'Amplitude', {}, {}, {}, false);
                (0, plotting_1.plot)([
                    { x: [-(0, math_1.max)(farina_ir.t), (0, math_1.max)(farina_ir.t)], y: [-200, -200], showlegend: false },
                    { x: farina_ir.t, y: (0, audio_1.db)(farina_ir.ir.map(x => Math.abs(x))), type: 'scatter', mode: 'lines', fill: 'tonexty', name: 'Farina Impulse Response', line: { color: plotting_1.COLORS[0], width: 0.75 }, fillcolor: plotting_1.COLORS[0] },
                    { x: [-0.05, -0.05], y: [-999, 999], type: 'scatter', mode: 'lines', name: 'Fundamental window start', line: { color: '#00000033', width: 0.75 }, hoverinfo: 'skip', showlegend: false },
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
                ], tabId, 'Deconvolved Response', 'Time (s)', 'Amplitude', { range: [-1, 1] }, { range: [-150, 10] }, {}, false);
                const transferFunction = (0, audio_1.computeFFTFromIR)(ir);
                // const dreferenceFFT = twoChannelFFT(responseData.data, referenceSamples, nextPow2(referenceSamples.length), -5627);
                const smoothedFreqResponse = (0, audio_1.smoothFFT)(transferFunction, 1 / 6, 1 / 48);
                const gd = (0, audio_1.groupDelays)(transferFunction, 1000);
                (0, plotting_1.plot)([
                    { x: transferFunction.frequency, y: (0, audio_1.db)(transferFunction.magnitude), name: 'Magnitude', line: { color: '#0366d666', width: 0.75 } },
                    { x: smoothedFreqResponse.frequency, y: (0, audio_1.db)(smoothedFreqResponse.magnitude), name: 'Magnitude (Smoothed)', line: { color: '#0366d6', width: 1.5 } }
                ], tabId, 'Transfer Function', 'Frequency (Hz)', 'Amplitude (dBFS)', { type: 'log', range: [Math.log10(20), Math.log10(20000)] }, { range: [-85, 5] }, {}, false);
                (0, plotting_1.plot)([
                    { x: transferFunction.frequency, y: transferFunction.phase, name: 'Phase', line: { color: '#0366d666', width: 0.75 } },
                    { x: smoothedFreqResponse.frequency, y: smoothedFreqResponse.phase, name: 'Phase (Smoothed)', line: { color: '#0366d6', width: 1.5 } }
                ], tabId, 'Phase', 'Frequency (Hz)', 'Amplitude (dBFS)', { type: 'log', range: [Math.log10(20), Math.log10(20000)] }, { range: [-720, 720] }, {}, false);
                (0, plotting_1.plot)([
                    { x: transferFunction.frequency, y: gd, name: 'Group Delay', line: { color: plotting_1.COLORS[0], width: 1.5, dash: 'dot' } }
                ], tabId, 'Group Delay', 'Frequency (Hz)', 'Group Delay (ms)', { type: 'log', range: [Math.log10(20), Math.log10(20000)] }, { range: [-20, 20] }, {}, false);
                // --- Colormap / Spectrogram (Plotly heatmap) ---
                (() => {
                    var _a, _b;
                    const sr = (_b = (_a = responseData.sampleRate) !== null && _a !== void 0 ? _a : referenceData === null || referenceData === void 0 ? void 0 : referenceData.sampleRate) !== null && _b !== void 0 ? _b : 48000;
                    const n = responseSamples.length;
                    if (n < 4096)
                        return;
                    const windowSize = 2048;
                    const targetFrames = 320;
                    const minHop = 256;
                    const rawFrames = Math.max(1, Math.floor((n - windowSize) / minHop) + 1);
                    const hop = rawFrames > targetFrames
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
                    for (let i = 0; i < windowSize; i++)
                        firstFrame[i] *= win[i];
                    const firstFFT = (0, audio_1.computeFFT)(firstFrame);
                    const freqs = Array.from(firstFFT.frequency);
                    const bins = freqs.length;
                    // z[freqIndex][timeIndex]
                    const z = Array.from({ length: bins }, () => []);
                    const times = [];
                    for (let frame = 0; frame < frames; frame++) {
                        const start = frame * hop;
                        const slice = responseSamples.subarray(start, start + windowSize);
                        const windowed = new Float32Array(windowSize);
                        windowed.set(slice);
                        for (let i = 0; i < windowSize; i++)
                            windowed[i] *= win[i];
                        const fft = (0, audio_1.computeFFT)(windowed);
                        const magDb = (0, audio_1.db)(fft.magnitude);
                        for (let k = 0; k < bins; k++) {
                            z[k].push(magDb[k]);
                        }
                        // Use center-of-window time for x axis
                        times.push((start + windowSize / 2) / sr);
                    }
                    (0, plotting_1.plot)([
                        {
                            type: 'heatmap',
                            x: times,
                            y: freqs,
                            z,
                            colorscale: 'Electric',
                            zmin: -120,
                            zmax: 0,
                            colorbar: { title: 'dBFS' }
                        }
                    ], tabId, 'Recorded Spectrogram', 'Time (s)', 'Frequency (Hz)', {}, { type: 'log', range: [Math.log10(20), Math.log10(20000)] }, { margin: { l: 60, r: 20, t: 40, b: 50 } }, false);
                })();
            }
            saveState();
            // Persist analysis using IndexedDB (mirrored to sessionStorage for compatibility)
            storage_1.storage.setItem(`${tabId}`, JSON.stringify({
                filename,
                referenceFilename,
                responseSamples: Array.from(responseSamples),
                referenceSamples: referenceSamples.length > 0 ? Array.from(referenceSamples) : null,
            })).catch(err => console.error('Failed to persist analysis:', err));
            function initResize(e) {
                e.preventDefault();
                window.addEventListener('mousemove', resize, false);
                window.addEventListener('mouseup', stopResize, false);
                console.log('Init resize');
                document.body.style.cursor = 'col-resize';
            }
            function resize(e) {
                var _a;
                const container = content.querySelector('.flex');
                const handle = (_a = document.getElementById('resize-handle')) === null || _a === void 0 ? void 0 : _a.parentElement;
                const rect = container.getBoundingClientRect();
                const newWidth = e.clientX - rect.left;
                if (newWidth > 150 && newWidth < rect.width - 150) {
                    handle.style.width = `${newWidth}px`;
                }
            }
            function stopResize() {
                window.removeEventListener('mousemove', resize, false);
                window.removeEventListener('mouseup', stopResize, false);
                window.dispatchEvent(new Event('resize'));
                document.body.style.cursor = 'default';
            }
            (_b = document.getElementById('resize-handle')) === null || _b === void 0 ? void 0 : _b.addEventListener('mousedown', initResize, false);
            tab.classList.remove('tab-loading');
        });
    });
}
function createDirectivityPlotTab(responseDatas, referenceData, anglesDeg) {
    console.log('Creating directivity plot tab with', responseDatas.length, 'responses and reference data', referenceData);
    if (responseDatas.length === 0 || referenceData.length === 0)
        return;
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
            var _a;
            const startTime = performance.now();
            const useCustomAngles = !!anglesDeg && anglesDeg.length === responseDatas.length;
            const angles = useCustomAngles
                ? anglesDeg.map(normalizeAngleDeg)
                : responseDatas.map((_, i) => (360 * i) / responseDatas.length);
            const referenceSamples = Float32Array.from(referenceData.getChannelData(0));
            const len = Math.min(7.5 * 48000, referenceSamples.length);
            const referenceFFT = (0, audio_1.updatedFFT)(referenceSamples.subarray(0, len), len);
            const calcStartTime = performance.now();
            const transfers = [];
            const smoothTransfers = [];
            for (let i = 0; i < responseDatas.length; i++) {
                const resp = responseDatas[i];
                const loopStartTime = performance.now();
                const fftr = (0, audio_1.twoChannelFFT)(resp.getChannelData(0).subarray(0, len), referenceSamples.subarray(0, len), (0, math_1.nextPow2)(len), 0, referenceFFT);
                //
                fftr.magnitude = fftr.magnitude.map((v, i) => Math.abs(v));
                const ffto = (0, audio_1.smoothFFT)(fftr, 1 / 3, 1 / 48);
                smoothTransfers.push(ffto);
                transfers.push(fftr);
            }
            const calcEndTime = performance.now();
            console.warn(`CALC TOOK ${calcEndTime - calcStartTime} milliseconds`);
            const baseFreq = (_a = transfers[0]) === null || _a === void 0 ? void 0 : _a.frequency;
            if (!baseFreq || baseFreq.length === 0)
                return;
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
            const z = cycleTransfers.map((tf) => {
                const magDb = (0, audio_1.db)(tf.magnitude);
                return magDb.map((v, i) => v - (0, audio_1.db)(smoothTransfers[0].magnitude)[i]);
            });
            const endTime = performance.now();
            console.warn(`TOOK ${endTime - startTime} milliseconds`);
            (0, plotting_1.plot)([
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
                }
            ], tabId, 'Directivity Map', 'Frequency (Hz)', 'Angle (deg)', { type: 'log', range: [Math.log10(20), Math.log10(20000)] }, { range: [-180, 180] }, { margin: { l: 60, r: 20, t: 40, b: 50 } }, false);
            // Calculate the average response.
            const avgMagnitude = new Float32Array(baseFreq.length);
            for (let i = 0; i < baseFreq.length; i++) {
                let sum = 0;
                for (let j = 0; j < transfers.length - 1; j++) {
                    sum += transfers[j].magnitude[i];
                }
                avgMagnitude[i] = sum / (transfers.length - 1);
            }
            const smoothAvgMagnitude = (0, audio_1.smoothFFT)({ frequency: baseFreq, magnitude: avgMagnitude, phase: new Float32Array(baseFreq.length), fftSize: (0, math_1.nextPow2)(baseFreq.length) }, 1 / 6, 1 / 48);
            const on = (0, audio_1.smoothFFT)(transfers[0], 1 / 6, 1 / 48);
            const anglesToPlot = [0, 30, 60, 90, 180];
            (0, plotting_1.plot)([
                ...anglesToPlot.map((angle, i) => {
                    const idx = angles.findIndex(a => Math.abs(a - angle) < 0.1);
                    if (idx === -1) {
                        return null;
                    }
                    return { x: (0, audio_1.smoothFFT)(transfers[idx], 1 / 6, 1 / 48).frequency, y: (0, audio_1.db)((0, audio_1.smoothFFT)(transfers[idx], 1 / 6, 1 / 48).magnitude), name: `${angle} deg response`, line: { width: 1.5, color: plotting_1.COLORS[i] } };
                }),
                { x: smoothAvgMagnitude.frequency, y: (0, audio_1.db)(smoothAvgMagnitude.magnitude), name: 'Average Response', line: { width: 2, color: '#000000' } },
            ], tabId, 'Transfer Function', 'Frequency (Hz)', 'Amplitude (dB)', { type: 'log', range: [Math.log10(20), Math.log10(20000)] }, { range: [-85, 5] }, {}, false);
            // Plot directivity index.
            (0, plotting_1.plot)([
                { x: on.frequency, y: (0, audio_1.db)(smoothAvgMagnitude.magnitude).map((v, i) => (0, audio_1.db)(on.magnitude)[i] - v), name: 'Average Response', line: { width: 2, color: '#000000' } },
            ], tabId, 'Directivity Index', 'Frequency (Hz)', 'DI (dB)', { type: 'log', range: [Math.log10(20), Math.log10(20000)] }, { range: [-10, 50] }, {}, false);
            // Polar directivity plots (add several frequency slices)
            (() => {
                const freqsToPlot = [62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
                const uniqueTransfers = smoothTransfers; // last entry is duplicate to close circle
                const uniqueAngles = angles;
                const traces = [];
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
                    const magDb = uniqueTransfers.map(tf => { var _a; return (_a = (0, audio_1.db)(tf.magnitude)[idx]) !== null && _a !== void 0 ? _a : -999; });
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
                        line: { color: plotting_1.COLORS[fi % plotting_1.COLORS.length], width: 2 },
                        marker: { size: 4 }
                    });
                }
                (0, plotting_1.plot)(traces, tabId, 'Polar Directivity', 'Frequency (Hz)', 'Angle (deg)', {}, // x-axis options unused for polar
                {}, // y-axis options unused for polar
                {
                    polar: {
                        radialaxis: { title: { text: 'Relative dB (max = 0 dB)' }, angle: 90, dtick: 10, range: [-50, 0] },
                        angularaxis: { direction: 'clockwise', rotation: 90, tickmode: 'array' }
                    },
                    margin: { l: 60, r: 20, t: 40, b: 50 }
                }, false);
            })();
            tab.classList.remove('tab-loading');
        });
    });
}
// Save and load state from sessionStorage
function saveState() {
    const tabs = Array.from(document.querySelectorAll('.tab[data-tab]')).map(tab => {
        var _a;
        return ({
            id: tab.dataset.tab,
            name: (_a = tab.textContent) === null || _a === void 0 ? void 0 : _a.replace('×', '').trim()
        });
    });
    storage_1.storage.setItem('tabs', JSON.stringify(tabs));
    console.log('Saved state with tabs:', tabs);
}
function loadState() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const savedTabs = yield storage_1.storage.getItem('tabs');
            if (!savedTabs)
                return;
            const tabs = JSON.parse(savedTabs);
            console.log('Loading saved tabs:', tabs);
            for (const tab of tabs) {
                // Call createAnalysisTab for each tab
                const raw = yield storage_1.storage.getItem(`${tab.id}`);
                const analysisData = raw ? JSON.parse(raw) : null;
                console.log('Restoring analysis data for tab', tab.id, analysisData);
                if (analysisData) {
                    createAnalysisTab(audio_1.Audio.fromSamples(Float32Array.from(analysisData.responseSamples)), analysisData.referenceSamples ? audio_1.Audio.fromSamples(Float32Array.from(analysisData.referenceSamples)) : null, analysisData.filename, analysisData.referenceFilename);
                }
            }
            // Tabs will be recreated when user analyzes files again
        }
        catch (e) {
            console.error('Failed to load saved state:', e);
        }
    });
}
function normalizesAngleDeg(angle) {
    let a = angle % 360;
    if (a < 0)
        a += 360;
    return a;
}
function loadTestPolarData() {
    return __awaiter(this, void 0, void 0, function* () {
        // Load some test data for polar analysis
        const angles = [
            0, 10, 20, 30, 40, 50, 60, 70, 80,
            90, 100, 110, 120, 130, 140, 150, 160, 170,
            180, 190, 200, 210, 220, 230, 240, 250, 260,
            270, 280, 290, 300, 310, 320, 330, 340, 350
        ];
        const files = angles.map(a => `testdata/${a}.wav`);
        createDirectivityPlotTab(yield Promise.all(files.map(f => (0, audio_1.loadAudioFromFilename)(f))), yield (0, audio_1.loadAudioFromFilename)('testdata/sweep_signal.wav.wav'), angles);
    });
}
function loadWaveformsFromStorage() {
    return __awaiter(this, void 0, void 0, function* () {
        // Load waveforms from IndexedDB (mirrored to sessionStorage for compatibility)
        try {
            const raw = yield storage_1.storage.getItem('waveforms');
            console.log('Attempting:', raw);
            const items = new Map();
            const decoded = JSON.parse(raw || '[]');
            console.log('Decoded waveforms from storage:', decoded);
            const startLoadTime = performance.now();
            for (const item of decoded) {
                // Convert numeric arrays back to typed arrays so Audio.fromObject gets proper buffers.
                if (item.data && Array.isArray(item.data)) {
                    item.data = Float32Array.from(item.data);
                }
                if (item.channelData && Array.isArray(item.channelData)) {
                    item.channelData = item.channelData.map((ch) => Array.isArray(ch) ? Float32Array.from(ch) : ch);
                }
                if (item.samples && Array.isArray(item.samples)) {
                    item.samples = Float32Array.from(item.samples);
                }
                items.set(item.id, audio_1.Audio.fromObject(item));
            }
            console.log(`Loaded ${items.size} waveforms from storage in ${performance.now() - startLoadTime} milliseconds`);
            console.log('Loaded waveforms from storage:', items);
            return items;
        }
        catch (err) {
            console.warn('Failed to load waveforms from storage:', err);
            return new Map();
        }
    });
}
function saveWaveformsToStorage(waveforms) {
    // Save waveforms to IndexedDB (mirrored to sessionStorage for compatibility)
    console.warn('Saving waveforms to storage:', waveforms);
    const toSave = Array.from(waveforms.entries()).map(([id, wf]) => {
        const obj = wf.toObject();
        obj.id = id;
        return obj;
    });
    storage_1.storage.setItem('waveforms', JSON.stringify(toSave)).catch(err => {
        console.error('Failed to save waveforms to storage:', err);
    });
}
function createListItem(audioObject, id) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const li = document.createElement('li');
    li.dataset.id = id;
    li.style.display = 'flex';
    li.classList.add('file-list-item');
    li.innerHTML = `
        <div style="flex:1;min-width:0;">
            <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${((_a = audioObject.metadata) === null || _a === void 0 ? void 0 : _a.filename) || 'Unknown'}</div>
            <div style="font-size:12px;color:#666;">${((_b = audioObject.metadata) === null || _b === void 0 ? void 0 : _b.mime) || 'audio/*'}</div>
            <div style="font-size:12px;color:#666;">Duration: ${audioObject.duration.toFixed(2)} seconds</div>
            <div style="font-size:12px;color:#666;">Angle: ${(_e = (_d = (_c = audioObject === null || audioObject === void 0 ? void 0 : audioObject.metadata) === null || _c === void 0 ? void 0 : _c.iXML) === null || _d === void 0 ? void 0 : _d.angle) !== null && _e !== void 0 ? _e : 'N/A'} deg</div>
            <div style="font-size:12px;color:#666;">Origin: ${(_h = (_g = (_f = audioObject === null || audioObject === void 0 ? void 0 : audioObject.metadata) === null || _f === void 0 ? void 0 : _f.iXML) === null || _g === void 0 ? void 0 : _g.origin) !== null && _h !== void 0 ? _h : 'Imported'}</div>
        </div>
        <div class="file-list-item-controls flex:1;min-width:0;">
            <div><label style="font-size:13px;"><input type="radio" name="selectedResponse" value="${id}"> Response</label></div>
            <div><label style="font-size:13px;"><input type="radio" name="selectedReference" value="${id}"> Reference</label></div>
            <div><button type="button" data-action="remove" style="margin-left:8px;">Remove</button></div>
        </div>
    `;
    // Insert image generated by Audio.getEnvelopeImage()
    const bas = audioObject.getEnvelopeImage(0, 1000, 100);
    li.style.backgroundImage = `url(${bas})`;
    li.style.backgroundRepeat = 'no-repeat';
    li.style.backgroundPosition = 'center center';
    li.style.backgroundSize = 'fill';
    return li;
}
function updateAnalyzeState() {
    const responseSelected = !!document.querySelector('input[name="selectedResponse"]:checked');
    const referenceSelected = !!document.querySelector('input[name="selectedReference"]:checked');
    const analyzeBtn = document.getElementById('analyzeUploadBtn');
    if (responseSelected) {
        analyzeBtn.disabled = false;
    }
    else {
        analyzeBtn.disabled = true;
    }
}
function addFilesFromInput(fileList) {
    return __awaiter(this, void 0, void 0, function* () {
        yield Promise.all(Array.from(fileList).map((f) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            const a = yield audio_2.audio.loadAudioFile(f);
            fileMap.set(id, a);
            console.log('Added file:', id, a);
            console.log('Current file map:', fileMap);
            const li = createListItem(a, id);
            (_a = document.getElementById('fileList')) === null || _a === void 0 ? void 0 : _a.appendChild(li);
        }))).then(() => {
            console.log('All files added. Current file map:', fileMap);
            saveWaveformsToStorage(fileMap);
        });
        updateAnalyzeState();
    });
}
document.addEventListener('DOMContentLoaded', () => {
    var _a;
    const respInput = document.getElementById('responseFileUpload');
    const refInput = document.getElementById('referenceFileUpload'); // exists below
    if (respInput)
        respInput.addEventListener('change', e => {
            var _a, _b;
            if ((_b = (_a = e === null || e === void 0 ? void 0 : e.target) === null || _a === void 0 ? void 0 : _a.files) === null || _b === void 0 ? void 0 : _b.length)
                addFilesFromInput(e.target.files);
            e.target.value = '';
        });
    document.getElementById('fileList').addEventListener('click', e => {
        const li = e.target.closest('li');
        if (!li)
            return;
        const id = li.dataset.id;
        if (e.target.matches('button[data-action="remove"]')) {
            // remove
            // if removed file was chosen in underlying file inputs, clear radios
            const responseRadio = document.querySelector(`input[name="selectedResponse"][value="${id}"]`);
            const referenceRadio = document.querySelector(`input[name="selectedReference"][value="${id}"]`);
            if (responseRadio && responseRadio.checked) {
                responseRadio.checked = false;
            }
            if (referenceRadio && referenceRadio.checked) {
                referenceRadio.checked = false;
            }
            fileMap.delete(id);
            li.remove();
            console.log('Removed file:', id);
            console.log('Current file map:', fileMap);
            saveWaveformsToStorage(fileMap);
            // ensure analyze button is enabled/disabled
            updateAnalyzeState();
        }
    });
    document.getElementById('fileList').addEventListener('change', e => {
        if (e.target.name === 'selectedResponse') {
            // ensure analyze button is enabled/disabled
            updateAnalyzeState();
        }
    });
    loadWaveformsFromStorage().then(waveforms => {
        var _a;
        console.log('Loaded waveforms from storage on startup:', waveforms);
        for (const a of waveforms) {
            const [id, audioObj] = a;
            console.log('Creating list item for loaded waveform:', a);
            const li = createListItem(audioObj, id); // id is not needed here since we don't remove these
            fileMap.set(id, audioObj);
            (_a = document.getElementById('fileList')) === null || _a === void 0 ? void 0 : _a.appendChild(li);
        }
    });
    (_a = document.getElementById('analyzeUploadBtn')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
        var _a, _b;
        const responseRadio = document.querySelector('input[name="selectedResponse"]:checked');
        const referenceRadio = document.querySelector('input[name="selectedReference"]:checked');
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
        createAnalysisTab(response.applyGain(1 / 16384), reference ? reference.applyGain(1 / 16384) : null, ((_a = response.metadata) === null || _a === void 0 ? void 0 : _a.filename) || 'Response', ((_b = reference === null || reference === void 0 ? void 0 : reference.metadata) === null || _b === void 0 ? void 0 : _b.filename) || 'Reference');
    });
});
loadTestPolarData();
// Load state on page load
loadState();

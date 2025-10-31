'use strict'

import { FFT } from './modules/fft.js';
import { db, A_WEIGHTING_COEFFICIENTS } from './modules/audio.js';
import { clamp } from './modules/math.js';


function fmtSec(s, text = true, millis = true, range) {
    let digits = 1 - Math.floor(Math.log10(range));
    if (s >= 60) {
        const mm = Math.floor(s / 60).toString().padStart(2, '0');
        const ss = Math.floor(s % 60).toString().padStart(2, '0');
        const hh = Math.floor(mm / 60);
        const remMm = (mm % 60).toString().padStart(2, '0');
        if (millis) {
            const frac = s - Math.floor(s);
            const ms = Math.round(frac * 10 ** digits).toString().padStart(digits, '0');
            if (hh >= 1) return `${hh}:${remMm}:${ss}.${ms} ${text ? 'm' : ''}`;
            return `${mm}:${ss}.${ms} ${text ? 'm' : ''}`;
        } else {
            if (hh >= 1) return `${hh}:${remMm}:${ss} ${text ? 'm' : ''}`;
            return `${mm}:${ss} ${text ? 'm' : ''}`;
        }
    }
    if (s >= 1) {
        const sec = Math.floor(s);
        const frac = s - sec;
        if (millis) {
            const ms = Math.round(frac * 10 ** digits).toString().padStart(digits, '0');
            return `${sec}.${ms} ${text ? 's' : ''}`;
        } else {
            return `${sec} ${text ? 's' : ''}`;
        }
    }
    if (s >= 1) return (s % 1 === 0) ? `${s} ${text ? 's' : ''}` : `${s.toFixed(2)} ${text ? 's' : ''}`;
    // sub-second -> ms
    return `${Math.round(s * 1000)} ms`;
}

// Format integer sample counts in groups of three (e.g. 1234567 -> "1,234,567")
function fmtSamples(s) {
    if (s == null) return s;
    s = String(s).trim();
    // avoid touching human-readable time labels like "1.23 s" or "kHz"
    if (!/^\d+(\.\d+)?$/.test(s)) return s;
    const parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join('.');
}


function computeWaveformEnvelope(bins, signalMax, signalMin = null) {
    /* Compute max and min waveform envelope over specified number of bins. */
    signalMin = signalMin || signalMax;
    if (signalMax.length !== signalMin.length) return null;

    const step = Math.max(1, signalMax.length / bins);
    const max = new Float32Array(bins).map(() => -Infinity);
    const min = new Float32Array(bins).map(() => Infinity);

    for (let i = 0; i < signalMax.length; i++) {
        const idx = Math.floor(i / step);
        if (idx >= bins) break;
        max[idx] = Math.max(max[idx], signalMax[i]);
        min[idx] = Math.min(min[idx], signalMin[i]);
    }

    return { max, min };
}


// Audio file manager: load AudioBuffer from files, URLs or file inputs and persist view/zoom state.
class AudioFile {
    constructor() {
        this.audioBuffer = null;         // decoded AudioBuffer

        // playback state for WebAudio BufferSource-based playback
        this.source = null;
        this.playing = false;
        this.playStartTime = 0;    // ac.currentTime when playback started
        this.playStartOffset = 0;  // offset in seconds of buffer where playback started
        this.pauseTime = 0;        // position in seconds where paused (if any)

        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.sampleRate = 48000;

        this.aggregatedData = [];
        this.fineAggregatedData = [];
        this.envelopeData = [];
        this.repeat = true;

        this.filename = null;

        this.view = { start: 0, end: 0, zoom: 1, amplitude_scaling: 1, followPlayhead: true }; // persisted view/zoom state
        this.selection = { start: 0, end: 0, zoom: 1 }; // persisted selection state
        this.playhead = { position: null, passive: true, inited: false, reachedEnd: false }; // playhead state
    }

    get channels() {
        return this.audioBuffer ? this.audioBuffer.numberOfChannels : 1;
    }

    applySOSFilter(a = A_WEIGHTING_COEFFICIENTS.a, b = A_WEIGHTING_COEFFICIENTS.b) {
        if (!this.audioBuffer) return;
        for (let channel = 0; channel < this.audioBuffer.numberOfChannels; channel++) {
            const input = this.samples(channel);
            let out = new Float32Array(input.length);

            let x = new Array(b.length).fill(0);
            let y = new Array(a.length).fill(0);

            // process samples
            for (let n = 0; n < input.length; n++) {
                x[0] = input[n];
                // Direct Form I
                let sum = b[0] * x[0];
                for (let i = 1; i < b.length; i++) {
                    sum += b[i] * x[i] - a[i] * y[i];
                }
                y[0] = sum / a[0];
                out[n] = y[0];

                for (let i = b.length - 1; i > 0; i--) {
                    x[i] = x[i - 1];
                    y[i] = y[i - 1];
                }
            }

            this.audioBuffer.copyToChannel(out, channel);
            console.log('Applied SOS filter to channel', channel);
        }
    }

    async startRecording() {
        try {
            // Stop any existing playback
            this.stop();

            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: this.sampleRate,
                    channelCount: 1,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            // Create MediaRecorder for real-time audio capture
            this.mediaRecorder = new MediaRecorder(stream);
            this.recordedChunks = [];
            this.recording = true;

            // Set up real-time audio processing
            const source = this.ctx.createMediaStreamSource(stream);
            const processor = this.ctx.createScriptProcessor(4096, 1, 1);

            // Initialize recording buffer
            this.recordingBuffer = [];
            this.recordingSampleRate = this.ctx.sampleRate;

            processor.onaudioprocess = (e) => {
                if (!this.recording) return;

                const inputData = e.inputBuffer.getChannelData(0);
                // Copy input data to our recording buffer
                this.recordingBuffer.push(new Float32Array(inputData));

                // Update audioBuffer in real-time for visualization
                this.updateRecordingBuffer();
            };

            source.connect(processor);
            processor.connect(this.ctx.destination);

            this.recordingSource = source;
            this.recordingProcessor = processor;
            this.recordingStream = stream;

            this.recordingStartSample = this.playhead.position || 0;

            console.log('Recording started');
            return true;

        } catch (err) {
            console.error('Error starting recording:', err);
            alert('Failed to start recording: ' + err.message);
            return false;
        }
    }

    updateRecordingBuffer() {
        if (!this.recordingBuffer || this.recordingBuffer.length === 0) return;

        // Flatten recorded chunks into a single Float32Array
        const totalRecorded = this.recordingBuffer.reduce((s, c) => s + c.length, 0);
        const recorded = new Float32Array(totalRecorded);
        let off = 0;
        for (const chunk of this.recordingBuffer) {
            recorded.set(chunk, off);
            off += chunk.length;
        }

        // Helper: simple linear resampler (if sample rates differ)
        function resampleLinear(input, inRate, outRate) {
            if (inRate === outRate) return input;
            const ratio = outRate / inRate;
            const outLen = Math.round(input.length * ratio);
            const out = new Float32Array(outLen);
            for (let i = 0; i < outLen; i++) {
            const t = i / ratio;
            const i0 = Math.floor(t);
            const i1 = Math.min(input.length - 1, i0 + 1);
            const alpha = t - i0;
            out[i] = (1 - alpha) * input[i0] + alpha * input[i1];
            }
            return out;
        }

        // If we have an existing audioBuffer, insert/overwrite from playhead; otherwise create new buffer
        if (this.audioBuffer) {
            const targetRate = this.audioBuffer.sampleRate || this.recordingSampleRate;
            const rec = resampleLinear(recorded, this.recordingSampleRate, targetRate);
            const R = rec.length;

            // Determine insert position in samples (playhead.position is in samples in this codebase)
            const insertPos = Math.max(0, Math.floor(this.recordingStartSample));

            const oldLen = this.audioBuffer.length;
            const numChannels = this.audioBuffer.numberOfChannels;

            // New length must accommodate either original trailing samples beyond overwrite or extend if recording goes past end
            const newLen = Math.max(oldLen, insertPos + R);

            const combined = this.ctx.createBuffer(numChannels, newLen, targetRate);

            for (let ch = 0; ch < numChannels; ch++) {
            const oldCh = this.audioBuffer.getChannelData(ch);
            const outCh = combined.getChannelData(ch);

            // Copy existing data up to insertPos
            if (insertPos > 0) {
                outCh.set(oldCh.subarray(0, Math.min(oldLen, insertPos)), 0);
            }

            // Write recorded data (mono recorded data duplicated to all channels)
            outCh.set(rec, insertPos);

            // If there are leftover old samples after the inserted region, copy them after the inserted block
            const tailStartOld = insertPos + R;
            if (tailStartOld < oldLen) {
                outCh.set(oldCh.subarray(tailStartOld, oldLen), tailStartOld);
            }
            }

            this.audioBuffer = combined;
            this.sampleRate = targetRate;

            // Update view/end to reflect new data length
            this.view.end = this.audioBuffer.length;
            if (this.view.followPlayhead) {
            const visibleDuration = 5 * this.sampleRate; // show last ~5s
            this.view.start = Math.max(0, this.audioBuffer.length - visibleDuration);
            }

            // Recompute waveform envelope for visualization
            this.processWaveformData();
        } else {
            // No existing audio: create buffer from recorded data (use recordingSampleRate)
            const newBuf = this.ctx.createBuffer(1, totalRecorded, this.recordingSampleRate);
            newBuf.copyToChannel(recorded, 0, 0);

            this.audioBuffer = newBuf;
            this.sampleRate = this.recordingSampleRate;

            this.view.start = 0;
            this.view.end = totalRecorded;
            if (this.view.followPlayhead) {
            const visibleDuration = 5 * this.sampleRate;
            this.view.start = Math.max(0, totalRecorded - visibleDuration);
            }

            this.processWaveformData();
        }
    }

    stopRecording() {
        if (!this.recording) return null;

        this.recording = false;

        // Clean up audio processing
        if (this.recordingProcessor) {
            this.recordingProcessor.disconnect();
            this.recordingProcessor = null;
        }
        if (this.recordingSource) {
            this.recordingSource.disconnect();
            this.recordingSource = null;
        }
        if (this.recordingStream) {
            this.recordingStream.getTracks().forEach(track => track.stop());
            this.recordingStream = null;
        }

        console.log('Recording stopped, total samples:', this.audioBuffer ? this.audioBuffer.length : 0);

        // Return the final recorded audio buffer
        return this.audioBuffer;
    }

    resetView() {
        this.view.start = 0;
        this.view.end = this.audioBuffer ? this.audioBuffer.length : 0;
        this.view.zoom = 1;
        this.view.amplitude_scaling = 1;
    }

    samples(channel = 0) {
        if (channel < 0 || channel >= this.audioBuffer.numberOfChannels) return null;
        return this.audioBuffer.getChannelData(channel);
    }

    /**
     * Export current view (or specified sample range) as a WAV file and trigger download.
     * Usage: audioFile.downloadWav() to download current view, or provide start/end sample indices.
     */
    async downloadWav(startSample = null, endSample = null, filename = 'export.wav') {
        // Prompt the user for a filename (with a sensible default). If the user cancels, abort.
        let defaultName = filename || 'export.wav';
        let userFilename = null;
        try {
            userFilename = window.prompt('Enter filename for WAV export:', defaultName);
        } catch (err) {
            // if prompt not available, fall back to provided filename
            userFilename = defaultName;
        }
        if (userFilename === null) {
            // user cancelled the prompt -> abort export
            return null;
        }
        filename = (userFilename.trim() || defaultName)
        // sanitize filename (remove path separators and illegal characters)
        filename = filename.replace(/[\/\\]+/g, '_').replace(/[<>:"|?*\x00-\x1F]/g, '_');
        // ensure .wav extension
        if (!/\.wav$/i.test(filename)) filename += '.wav';
        if (!this.audioBuffer) throw new Error('No audio loaded');

        // default to current view if not provided
        startSample = (startSample == null) ? this.view.start : Math.max(0, Math.floor(startSample));
        endSample = (endSample == null) ? this.view.end : Math.max(0, Math.floor(endSample));
        startSample = Math.min(startSample, this.audioBuffer.length - 1);
        endSample = Math.min(Math.max(endSample, startSample + 1), this.audioBuffer.length);

        const numChannels = this.channels;
        const sampleRate = this.audioBuffer.sampleRate || this.sampleRate || 48000;
        const frameCount = endSample - startSample;
        if (frameCount <= 0) throw new Error('Invalid sample range');

        // gather channel data (sliced)
        const channelSlices = new Array(numChannels);
        for (let ch = 0; ch < numChannels; ch++) {
            const src = this.audioBuffer.getChannelData(ch);
            channelSlices[ch] = src.subarray(startSample, endSample);
        }

        // interleave and convert to 16-bit PCM
        const bytesPerSample = 2;
        const buffer = new ArrayBuffer(44 + frameCount * numChannels * bytesPerSample);
        const view = new DataView(buffer);

        // helper: write string chars
        function writeString(dataview, offset, str) {
            for (let i = 0; i < str.length; i++) {
                dataview.setUint8(offset + i, str.charCodeAt(i));
            }
        }

        // WAV header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + frameCount * numChannels * bytesPerSample, true); // file size - 8
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // PCM subchunk size
        view.setUint16(20, 1, true);  // audio format = PCM
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
        view.setUint16(32, numChannels * bytesPerSample, true); // block align
        view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
        writeString(view, 36, 'data');
        view.setUint32(40, frameCount * numChannels * bytesPerSample, true);

        // write PCM16 samples
        let offset = 44;
        for (let i = 0; i < frameCount; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                let s = channelSlices[ch][i] || 0;
                // clamp
                s = Math.max(-1, Math.min(1, s));
                // convert float [-1,1] to 16-bit PCM (signed)
                const int16 = (s < 0) ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF);
                view.setInt16(offset, int16, true);
                offset += 2;
            }
        }

        const blob = new Blob([view], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);

        return blob;
    }

    get visibleSamples() { return Math.max(1, this.view.end - this.view.start); }

    processWaveformData() {
        const data = [];
        for (let i = 0; i < this.audioBuffer.numberOfChannels; i++) {
            data[i] = this.samples(i);
            const { max, min } = computeWaveformEnvelope(data[i].length / aggregatedDataMultiplier, data[i]);
            this.aggregatedData[i] = { max: max, min: min };
            console.log('Calculating aggregated waveform data:', max.length, 'points');
        }
        console.log('Waveform processed: ', data[0].length, 'samples, duration:', fmtSec(data[0].length / this.audioBuffer.sampleRate, true, true, 0.01));
        return data;
    }

    getChannelEnvelopeData(channel = 0, bins = null) {
        if (channel < 0 || channel >= this.audioBuffer.numberOfChannels) return null;

        let max, min;
        if (this.visibleSamples < aggregatedWaveformThreshold) {
            max = this.audioBuffer.getChannelData(channel).subarray(this.view.start, this.view.end);
            return computeWaveformEnvelope(bins, max);
        } else {
            max = this.aggregatedData[channel].max.subarray(this.view.start / aggregatedDataMultiplier, this.view.end / aggregatedDataMultiplier);
            min = this.aggregatedData[channel].min.subarray(this.view.start / aggregatedDataMultiplier, this.view.end / aggregatedDataMultiplier);
            console.log('Using aggregated waveform data for rendering');
            return computeWaveformEnvelope(bins, max, min);
        }

    }

    get length() {
        return this.audioBuffer ? this.audioBuffer.length : 0;
    }

    // decode an ArrayBuffer and install into app state (uses the global AudioContext `ac` when available)
    async loadWaveformFromArrayBuffer(arrayBuffer) {
        // Extract sample rate from WAV header if present
        let sampleRate = this.sampleRate; // default fallback
        try {
            const view = new DataView(arrayBuffer);
            // Check for RIFF header
            if (view.getUint32(0, false) === 0x52494646) { // 'RIFF'
                // Check for WAVE format
                if (view.getUint32(8, false) === 0x57415645) { // 'WAVE'
                    // Look for fmt chunk
                    let offset = 12;
                    while (offset < arrayBuffer.byteLength - 8) {
                        const chunkId = view.getUint32(offset, false);
                        const chunkSize = view.getUint32(offset + 4, true);

                        if (chunkId === 0x666D7420) { // 'fmt '
                            // Read sample rate from fmt chunk (offset 24 from start of file)
                            sampleRate = view.getUint32(offset + 12, true);
                            console.log('WAV sample rate detected:', sampleRate, 'Hz');
                            break;
                        }
                        offset += 8 + chunkSize;
                    }
                }
            }
        } catch (err) {
            console.warn('Could not read WAV header, using default sample rate:', err);
        }
        console.log('Decoding audio data...');
        try {
            this.audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            if (this.audioBuffer.sampleRate < sampleRate) {
                alert(`Warning: The audio file's sample rate of ${sampleRate} Hz is higher than the playback device sample rate of ${this.audioBuffer.sampleRate} Hz. The waveform display may not be accurate for higher frequencies.`);
            }
            this.processWaveformData();
        } catch (err) {
            alert('Error decoding audio data: ' + (err && err.message ? err.message : String(err)));
            this.audioBuffer = null;
        }

        this.sampleRate = this.audioBuffer.sampleRate;
        return this.audioBuffer;
    }

    // load directly from a File object (from <input type=file>)
    async loadFile(file = '/test.wav') {
        this.stop();
        const waveform = await fetch(file);
        const arrayBuffer = await waveform.arrayBuffer();
        const loadedBuffer = await this.loadWaveformFromArrayBuffer(arrayBuffer);
        this.filename = file;
        return loadedBuffer;
    }

    // load from a File object directly (from File API)
    async loadFromFile(file) {
        if (!(file instanceof File)) {
            alert('Expected a File object');
        }

        this.stop();
        const arrayBuffer = await file.arrayBuffer();
        const loadedBuffer = await this.loadWaveformFromArrayBuffer(arrayBuffer);
        this.filename = file.name;
        return loadedBuffer;
    }

    // load from a URL (fetch)
    async loadFromUrl(url) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
        const ab = await resp.arrayBuffer();
        return this.loadWaveformFromArrayBuffer(ab);
    }

    // attach an <input type="file"> or a text input with URL to this manager
    attachInput(inputEl) {
        if (!inputEl) return;
        inputEl.addEventListener('change', async (e) => {
            try {
                if (inputEl.files && inputEl.files.length > 0) {
                    await this.loadFile(inputEl.files[0]);
                } else if (inputEl.value && inputEl.value.trim()) {
                    await this.loadFromUrl(inputEl.value.trim());
                }
            } catch (err) {
                console.error('AudioFileManager: failed to load input', err);
                alert('Failed to load audio: ' + (err && err.message ? err.message : String(err)));
            }
        }, { passive: false });
    }

    playFrom(sample) {
        if (!this.audioBuffer) return;
        sample = Math.max(0, Math.min(this.audioBuffer.length - 1, Math.floor(sample)));
        this.stop();

        const source = this.ctx.createBufferSource();
        this.source = source;
        source.buffer = this.audioBuffer;
        source.connect(this.ctx.destination);
        source.start(0, sample / this.sampleRate);

        this.playing = true;
        this.playStartTime = this.ctx.currentTime;
        this.playStartOffset = sample / this.sampleRate;
        this.playhead.position = this.ctx.currentTime * this.sampleRate;

        source.onended = () => {
            console.log('Final playhead position:', this.playhead.position);
            if (sample + (this.ctx.currentTime - this.playStartTime) * this.sampleRate >= this.audioBuffer.length - 100) {
                this.playhead.reachedEnd = true;
                console.log('Playback ended at end of buffer');
                this.playing = false;
                this.source = null;
                this.playhead.position = null;
                if (this.repeat) { this.playFrom(0); }
            }
        };
        console.log('Playback started from sample', this.playStartOffset, this.playStartTime, 's');
    }

    togglePlayPause() {
        if (this.playing) {
            this.stop();
        } else {
            this.playFrom(this.playStartOffset * this.audioBuffer.sampleRate);
        }
    }

    stop() {
        if (this.source) {
            this.source.stop();
            this.source = null;
        }
        this.playing = false;
    }
}

// Recording functionality
window.recordingIntervalId = null;

window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Space' && ev.shiftKey) {
        ev.preventDefault();
        if (!window.audioFile.recording) {
            // Start recording
            window.audioFile.startRecording().then(success => {
                if (success) {
                    window.audioFile.recording = true;
                    const recordStartTime = window.audioFile.ctx.currentTime;
                    const recordStartOffset = window.audioFile.playhead.position || 0;
                    console.log('Recording started with Shift+Space');
                    // Set up interval to call renderWaveform every second during recording
                    if (spectrogramRendered) {
                        clearSpectrogram();
                    }
                    const tick = () => {
                        if (!window.audioFile.recording) {
                            return;
                        }
                        window.audioFile.view.start = Math.max(0, window.audioFile.length - 60 * window.audioFile.sampleRate);
                        window.audioFile.view.end = window.audioFile.length;
                        console.log('Updating waveform during recording...');
                        console.log('Current recorded length:', window.audioFile.length, 'samples');
                        console.log('View range:', window.audioFile.view.start, '-', window.audioFile.view.end);

                        //window.audioFile.processWaveformData();
                        renderWaveform(); 
                        const elapsed = window.audioFile.ctx.currentTime - recordStartTime;
                        const cur = recordStartOffset + elapsed * window.audioFile.sampleRate;
                        window.audioFile.playhead.position = Math.min(window.audioFile.length, cur);
                       
                        waveformVis._playhead.updateVisual();
                        requestAnimationFrame(tick);
                    };
                    requestAnimationFrame(tick);
                    // Auto-stop recording after 10 seconds
                }
            });
        } else {
            // Stop recording
            const recordedBuffer = window.audioFile.stopRecording();
            console.log('Recording stopped with Shift+Space');
            window.audioFile.resetView();
            window.audioFile.processWaveformData();
            renderWaveform();
            renderSpectrogram(true);
            waveformVis._playhead.updateVisual();
        }
    }
});

// expose a single manager instance for the app to use
const audioFile = new AudioFile();
window.audioFile = audioFile;


// Persist view state on unload as a final safety-net
window.addEventListener('beforeunload', () => {
    try {
        localStorage.setItem('yScaleStep', window.yScaleStep);
        localStorage.setItem('fftSize', window.fftSize);
        localStorage.setItem('timeDisplayUnit', window.timeDisplayUnit);
    } catch (e) { alert('Could not save settings: ' + e.message); }
});

window.timeDisplayUnit = localStorage.getItem('timeDisplayUnit') || 'seconds';

function prepareUIElements() {
    // Initialize UI elements based on the current state
    const timeDisplaySelect = document.getElementById('timeDisplaySelect');
    if (timeDisplaySelect) {
        timeDisplaySelect.value = window.timeDisplayUnit;
    }
    console.log('UI elements prepared');
}

// colors
let uiColor = (() => {
    // pick a "modern" random HSL palette (vibrant/desaturated)
    const h = Math.floor(Math.random() * 360);
    const s = 55 + Math.floor(Math.random() * 31); // 55..85%
    const l = 40 + Math.floor(Math.random() * 16); // 40..55%

    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const hh = h / 60;
        const x = c * (1 - Math.abs((hh % 2) - 1));
        let r = 0, g = 0, b = 0;
        if (0 <= hh && hh < 1) { r = c; g = x; b = 0; }
        else if (1 <= hh && hh < 2) { r = x; g = c; b = 0; }
        else if (2 <= hh && hh < 3) { r = 0; g = c; b = x; }
        else if (3 <= hh && hh < 4) { r = 0; g = x; b = c; }
        else if (4 <= hh && hh < 5) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        const m = l - c / 2;
        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);
        const hex = n => n.toString(16).padStart(2, '0');
        return `#${hex(r)}${hex(g)}${hex(b)}`;
    }

    return hslToHex(h, s, l);
})();

// 8 modern, muted lineColor options (modern muted palette)
const lineColorOptions = [
    '#1F77B4', // steel blue
    '#2CA02C', // medium green
    '#D62728', // vermilion red
    '#9467BD', // muted purple
    '#8C564B', // warm brown
    '#E377C2', // soft magenta
    '#7F7F7F', // neutral gray
    '#BCBD22'  // olive chartreuse
];

const r = document.querySelector(':root');
//uiColor = '#cc781e';
//uiColor = '#2c95aa'
//const uiColorTool = '#30a8c0';

//uiColor = '#9095aa';
//uiColor = '#a0a8c0';
uiColor = '#a0a0c0';
const uiColorTool = uiColor;
r.style.setProperty('--color-tool', uiColorTool);
r.style.setProperty('--color', uiColor);
// choose a color (pick index 0 for base, or uncomment random line to pick randomly)
// lineColor = lineColorOptions[ Math.floor(Math.random() * lineColorOptions.length) ];
// pick a random color from indices 0..7
const lineColor = lineColorOptions[0];


//lineColor = //'#ec983e'; // override with gray for better visibility
//const uiColor = '#cc781e';
const uiColorTicks = 'color-mix(in lab, ' + uiColorTool + ' 50%, #000000 50%)';
const uiColorLabels = 'color-mix(in lab, ' + uiColorTool + ' 90%, #000000 10%)';
const gridColor = uiColor + '44'; // semi-transparent
const highlightColor = '#ffffff' + '55'; // more opaque

export function computeFFT(dataArray) {
    const fft = new FFT(dataArray.length);
    const out = fft.createComplexArray();
    const dataComplex = fft.createComplexArray();
    for (let i = 0; i < dataArray.length; i++) {
        dataComplex[2 * i] = dataArray[i];
        dataComplex[2 * i + 1] = 0;
    }
    fft.transform(out, dataComplex);
    const mag = new Float32Array(dataArray.length / 2);
    for (let i = 0; i < mag.length; i++) {
        const real = out[2 * i];
        const imag = out[2 * i + 1];
        mag[i] = Math.sqrt(real * real + imag * imag);
    }
    return { mag: mag };
}

const colormap = [
    { 'r': [0, 0, 0, 1, 1, 1, 2, 2, 3, 4, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 20, 22, 23, 25, 26, 28, 29, 31, 33, 34, 36, 38, 39, 41, 43, 45, 46, 48, 50, 52, 54, 55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74, 76, 77, 79, 80, 82, 84, 85, 87, 89, 90, 92, 93, 95, 97, 98, 100, 101, 103, 104, 106, 108, 109, 111, 112, 114, 116, 117, 119, 120, 122, 124, 125, 127, 128, 130, 132, 133, 135, 136, 138, 140, 141, 143, 144, 146, 148, 149, 151, 152, 154, 155, 157, 159, 160, 162, 163, 165, 167, 168, 170, 171, 173, 174, 176, 177, 179, 180, 182, 183, 185, 186, 188, 189, 191, 192, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207, 209, 210, 211, 213, 214, 215, 216, 217, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 237, 238, 239, 240, 241, 241, 242, 243, 243, 244, 244, 245, 246, 246, 247, 247, 248, 248, 248, 249, 249, 250, 250, 250, 251, 251, 251, 251, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, 251, 251, 251, 251, 250, 250, 250, 249, 249, 249, 248, 248, 247, 247, 246, 246, 245, 245, 244, 244, 244, 243, 243, 242, 242, 242, 242, 242, 242, 242, 243, 243, 244, 245, 246, 247, 248, 249, 251, 253], 'g': [0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12, 11, 11, 11, 11, 11, 10, 10, 10, 10, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 10, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 17, 17, 18, 18, 19, 20, 20, 21, 21, 22, 23, 23, 24, 24, 25, 26, 26, 27, 27, 28, 28, 29, 29, 30, 31, 31, 32, 32, 33, 33, 34, 35, 35, 36, 36, 37, 37, 38, 39, 39, 40, 40, 41, 42, 42, 43, 43, 44, 45, 45, 46, 47, 47, 48, 49, 49, 50, 51, 52, 52, 53, 54, 55, 56, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 76, 77, 78, 79, 81, 82, 83, 85, 86, 87, 89, 90, 91, 93, 94, 96, 97, 99, 100, 102, 103, 105, 106, 108, 110, 111, 113, 114, 116, 118, 119, 121, 123, 125, 126, 128, 130, 132, 133, 135, 137, 139, 141, 142, 144, 146, 148, 150, 152, 153, 155, 157, 159, 161, 163, 165, 167, 169, 170, 172, 174, 176, 178, 180, 182, 184, 186, 188, 190, 192, 194, 196, 198, 200, 202, 204, 206, 208, 210, 212, 214, 216, 217, 219, 221, 223, 225, 227, 229, 231, 233, 234, 236, 238, 239, 241, 243, 244, 245, 247, 248, 249, 251, 252, 253, 254, 255], 'b': [3, 4, 6, 7, 9, 11, 14, 16, 18, 20, 22, 24, 27, 29, 31, 33, 36, 38, 40, 43, 45, 47, 50, 52, 55, 57, 59, 62, 64, 67, 69, 72, 74, 76, 78, 81, 83, 85, 87, 89, 90, 92, 94, 95, 96, 98, 99, 100, 101, 102, 103, 104, 104, 105, 106, 106, 107, 107, 108, 108, 108, 109, 109, 109, 109, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 109, 109, 109, 109, 108, 108, 108, 108, 107, 107, 107, 106, 106, 105, 105, 104, 104, 104, 103, 103, 102, 101, 101, 100, 100, 99, 98, 98, 97, 96, 96, 95, 94, 93, 93, 92, 91, 90, 89, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 76, 75, 74, 73, 72, 71, 70, 69, 68, 67, 65, 64, 63, 62, 61, 60, 59, 57, 56, 55, 54, 53, 51, 50, 49, 48, 47, 45, 44, 43, 42, 40, 39, 38, 37, 35, 34, 33, 32, 30, 29, 28, 26, 25, 24, 22, 21, 20, 18, 17, 16, 14, 13, 12, 11, 9, 8, 8, 7, 6, 6, 6, 6, 6, 6, 7, 7, 8, 10, 11, 13, 14, 16, 18, 20, 22, 24, 26, 28, 30, 33, 35, 37, 40, 42, 45, 47, 50, 52, 55, 58, 61, 63, 66, 69, 73, 76, 79, 82, 86, 89, 93, 97, 101, 105, 109, 113, 117, 121, 125, 130, 134, 138, 142, 146, 150, 154, 157, 161, 165] },
    { 'r': [68, 68, 69, 69, 69, 70, 70, 70, 70, 71, 71, 71, 71, 71, 72, 72, 72, 72, 72, 72, 72, 72, 72, 72, 72, 72, 72, 72, 72, 71, 71, 71, 71, 71, 70, 70, 70, 70, 69, 69, 69, 68, 68, 68, 67, 67, 67, 66, 66, 65, 65, 65, 64, 64, 63, 63, 62, 62, 61, 61, 60, 60, 59, 59, 58, 58, 57, 57, 56, 56, 55, 55, 54, 54, 53, 53, 52, 52, 51, 51, 51, 50, 50, 49, 49, 48, 48, 47, 47, 47, 46, 46, 45, 45, 45, 44, 44, 43, 43, 43, 42, 42, 41, 41, 41, 40, 40, 40, 39, 39, 38, 38, 38, 37, 37, 37, 36, 36, 35, 35, 35, 34, 34, 34, 33, 33, 33, 32, 32, 32, 32, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 30, 30, 30, 30, 31, 31, 31, 31, 32, 32, 33, 33, 34, 35, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 46, 47, 48, 50, 51, 53, 54, 56, 57, 59, 61, 62, 64, 66, 68, 70, 72, 73, 75, 77, 79, 81, 83, 85, 88, 90, 92, 94, 96, 98, 101, 103, 105, 108, 110, 112, 115, 117, 119, 122, 124, 127, 129, 132, 134, 137, 139, 142, 144, 147, 149, 152, 155, 157, 160, 163, 165, 168, 171, 173, 176, 179, 181, 184, 187, 189, 192, 195, 197, 200, 203, 205, 208, 211, 213, 216, 219, 221, 224, 226, 229, 232, 234, 237, 239, 242, 244, 247, 249, 251, 254], 'g': [1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18, 20, 21, 22, 24, 25, 26, 28, 29, 30, 32, 33, 34, 36, 37, 38, 39, 41, 42, 43, 44, 46, 47, 48, 49, 51, 52, 53, 54, 56, 57, 58, 59, 60, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72, 73, 74, 75, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 175, 176, 177, 178, 179, 180, 181, 182, 183, 183, 184, 185, 186, 187, 188, 189, 190, 190, 191, 192, 193, 194, 194, 195, 196, 197, 198, 198, 199, 200, 201, 201, 202, 203, 204, 204, 205, 206, 206, 207, 208, 208, 209, 210, 210, 211, 212, 212, 213, 213, 214, 215, 215, 216, 216, 217, 217, 218, 218, 219, 219, 220, 220, 221, 221, 221, 222, 222, 223, 223, 223, 224, 224, 225, 225, 225, 226, 226, 226, 227, 227, 227, 228, 228, 228, 229, 229, 229, 230, 230, 230, 230, 231, 231, 231], 'b': [84, 85, 87, 88, 90, 91, 93, 94, 96, 97, 98, 100, 101, 102, 104, 105, 106, 108, 109, 110, 111, 112, 113, 115, 116, 117, 118, 119, 120, 121, 121, 122, 123, 124, 125, 126, 126, 127, 128, 129, 129, 130, 131, 131, 132, 132, 133, 133, 134, 134, 135, 135, 136, 136, 136, 137, 137, 137, 138, 138, 138, 138, 139, 139, 139, 139, 140, 140, 140, 140, 140, 140, 141, 141, 141, 141, 141, 141, 141, 141, 141, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 142, 141, 141, 141, 141, 141, 141, 141, 140, 140, 140, 140, 140, 139, 139, 139, 139, 138, 138, 138, 137, 137, 137, 136, 136, 136, 135, 135, 134, 134, 134, 133, 133, 132, 131, 131, 130, 130, 129, 129, 128, 127, 127, 126, 125, 124, 124, 123, 122, 121, 121, 120, 119, 118, 117, 116, 115, 114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 102, 101, 100, 99, 98, 96, 95, 94, 92, 91, 90, 88, 87, 85, 84, 82, 81, 79, 78, 76, 75, 73, 72, 70, 68, 67, 65, 63, 62, 60, 58, 57, 55, 53, 51, 50, 48, 46, 45, 43, 41, 39, 38, 36, 35, 33, 32, 30, 29, 28, 27, 26, 25, 24, 24, 24, 24, 24, 25, 25, 26, 27, 28, 30, 31, 33, 35, 36] }
];

// configurable parameters
// fft size (power of two). Can be changed at runtime with Ctrl+Shift+ArrowUp / ArrowDown
window.fftSize = localStorage.getItem('fftSize') || 1024; // change this value to vary FFT size
let audioBuffer = null; // decoded audio data will go here
let ac = new (window.AudioContext || window.webkitAudioContext)();

const MIN_FFT = 64;
const MAX_FFT = 16384;

document.getElementById('fftSizeDisplay').textContent = `FFT size: ${window.fftSize}`;

function clampPow2(v) {
    // ensure v is a power of two within min/max
    v = Math.max(MIN_FFT, Math.min(MAX_FFT, v));
    return 1 << Math.round(Math.log2(v));
}

function changeFftSize(increase) {
    const newSize = clampPow2(increase ? window.fftSize * 2 : Math.max(MIN_FFT, window.fftSize / 2));
    if (newSize === window.fftSize) return;
    clearSpectrogram();
    window.fftSize = newSize;
    console.log('fftSize =>', window.fftSize);
    // re-render spectrogram with new fftSize

    document.getElementById('fftSizeDisplay').textContent = `FFT size: ${window.fftSize}`;
    renderSpectrogram(true);
}

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey) {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            changeFftSize(true);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            changeFftSize(false);
        }
    }
});

function zoomYAxis(e) {
    // Use vertical wheel direction to zoom amplitude scaling.
    // Scroll up (negative deltaY) -> increase amplitude scaling (zoom in)
    // Scroll down (positive deltaY) -> decrease amplitude scaling (zoom out)
    const dir = -Math.sign(e.deltaY); // +1 for wheel-up, -1 for wheel-down
    const STEP = 1.05; // multiplicative step per wheel "tick"

    // Ensure view object exists
    if (!window.audioFile.view) window.audioFile.view = {};
    const prev = (typeof window.audioFile.view.amplitude_scaling === 'number')
        ? window.audioFile.view.amplitude_scaling
        : 1;

    let next = prev;
    if (dir > 0) next = prev * STEP;
    else if (dir < 0) next = prev / STEP;

    // clamp to reasonable range
    next = Math.max(0.00001, Math.min(2 ** 16, next));

    //window.console.log('Amplitude scaling:', prev.toFixed(3), '->', next.toFixed(3));
    //next = 10 ** (Math.floor(4 * db(next)) / 80); // expose globally for debugging

    // store both names for compatibility
    window.audioFile.view.amplitude_scaling = next;
    // re-render waveform to apply new amplitude scaling
    try { renderWaveform(); } catch (err) { /* ignore if render not available yet */ }
}
const waveformYAxisElement = document.getElementById('waveformYAxis');
waveformYAxisElement.addEventListener('wheel', (e) => {
    e.preventDefault();

    zoomYAxis(e);
}, { passive: false });

function zoomWaveform(e) {
    let deltaX = e.deltaX;
    let deltaY = e.deltaY;
    if (e.shiftKey) {
        deltaX = e.deltaY;
        deltaY = e.deltaX;
    }
    const rect = waveformVis.getBoundingClientRect();
    const mouseX = Math.min(Math.max(0, e.clientX - rect.left + (container && container.scrollLeft ? container.scrollLeft : 0)), rect.width);
    const normX = mouseX / rect.width;

    const visible = window._zoom.end - window._zoom.start;
    // zoom factor: scroll up -> zoom in, scroll down -> zoom out
    const factor = Math.pow(1.003, deltaY); // tuned sensitivity
    const minWindow = Math.max(0, Math.floor(20)); // don't zoom into less than this
    const maxWindow = window.audioFile.length; // don't zoom out beyond full length

    let newWindow = Math.round(visible * factor);
    newWindow = Math.min(Math.max(newWindow, minWindow), maxWindow);

    // focal sample under pointer should remain under pointer after zoom
    const focalSample = window._zoom.start + Math.round(normX * visible);
    let newStart = Math.round(focalSample - normX * newWindow);

    // horizontal wheel (deltaX) pans the view: convert deltaX (CSS px) to a fraction of the visible width
    // and translate that to sample offset. Positive deltaX -> pan right (increase start).
    const PAN_SENSITIVITY = .5; // adjust as needed
    if (Math.abs(deltaX) > 0) {
        const panFraction = (deltaX * PAN_SENSITIVITY) / rect.width;
        const panSamples = Math.round(panFraction * visible);
        newStart += panSamples;
    }
    newStart = Math.min(Math.max(0, newStart), window.audioFile.length - newWindow);
    let newEnd = newStart + newWindow;

    // apply
    window._zoom.start = newStart;
    window._zoom.end = newEnd;
    window.audioFile.view.start = newStart;
    window.audioFile.view.end = newEnd;

    // re-render
    renderWaveform();
    if (spectrogramRendered) {
        clearSpectrogram();
    }
    if (waveformVis._renderSpectrogramTimer) clearTimeout(waveformVis._renderSpectrogramTimer);
    waveformVis._renderSpectrogramTimer = setTimeout(() => {
        renderSpectrogram();
        waveformVis._renderSpectrogramTimer = null;
    }, 250);
}

// create a simple control to pick linear/log y-axis
(function createYScaleControl() {
    // expose current step globally for use by rendering code (0..19)
    window.yScaleStepsTotal = 20;
    window.yScaleStep = localStorage.getItem('yScaleStep') !== null ? localStorage.getItem('yScaleStep') : 0; // 0 => fully linear, 19 => fully logarithmic

    function applyYScaleStep(step) {
        step = Math.max(0, Math.min(window.yScaleStepsTotal - 1, Math.round(step)));
        window.yScaleStep = step;
        if (typeof renderSpectrogram === 'function') renderSpectrogram();
    }

    // keyboard shortcuts: Ctrl+Alt+ArrowUp / ArrowDown to change step
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && !e.shiftKey) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                applyYScaleStep(window.yScaleStep + 1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                applyYScaleStep(window.yScaleStep - 1);
            }
        }
    });
})();

function sampleForX(px, displayWidth, audioFile = window.audioFile) {
    // px: 0..displayWidth
    const frac = clamp(px / Math.max(1, displayWidth), 0, 1);
    return Math.round(
        audioFile.view.start + frac * Math.max(
            1, audioFile.view.end - audioFile.view.start
        )
    );
}

function xForSample(sample, displayWidth, audioFile = window.audioFile) {
    const frac = (
        sample - audioFile.view.start
    ) / Math.max(
        1, audioFile.view.end - audioFile.view.start
    );
    return Math.round(clamp(frac, 0, 1) * displayWidth);
}

window.prevView = { start: 0, end: 0, globalMax: null, globalMin: null, mags: null };
let spectrogramRendered = false;

function renderSpectrogram(rerender = false, channel = 0, id = 'spectrogramCanvas1') {
    if (!window.fftSize) {
        console.warn('renderSpectrogram: fftSize not set');
        window.fftSize = 1024;
        changeFftSize(true);
    }

    const element = document.getElementById(id);
    if (!element) {
        console.warn('renderSpectrogram: no element with id', id);
        return;
    }
    const displayWidth = Math.max(1, Math.floor(element.clientWidth));
    const displayHeight = element.clientHeight;

    const bins = window.fftSize / 2;
    const padding = Math.max(0, window.fftSize - window.audioFile.visibleSamples);
    console.log('renderSpectrogram: display', displayWidth, 'x', displayHeight, 'bins=', bins, 'padding=', padding);
    const rawData = window.audioFile.samples(channel).slice(window.audioFile.view.start, window.audioFile.view.end + padding);
    let hopSize = Math.floor(window.fftSize / 4);
    // create frames (and limit them to at most 10 × display width)
    let potentialFrames = Math.max(0, Math.floor((rawData.length - window.fftSize) / hopSize) + 1);


    const maxFramesAllowed = displayWidth * 2;
    if (potentialFrames < displayWidth / 4) {
        const ratio = displayWidth / Math.max(1, potentialFrames);
        console.warn('Only', potentialFrames, 'frames available; consider reducing fftSize for better spectrogram resolution.');
        hopSize = Math.ceil(window.fftSize / ratio);
        potentialFrames = Math.max(0, Math.floor((rawData.length - window.fftSize) / hopSize) + 1);
    }
    let frameStep = 1;
    if (potentialFrames > maxFramesAllowed) {
        frameStep = Math.ceil(potentialFrames / maxFramesAllowed);
        console.log('renderSpectrogram: limiting frames', potentialFrames, '->', Math.ceil(potentialFrames / frameStep), ' (step=', frameStep, ')');
    }
    const frames = Math.max(0, Math.floor((rawData.length - window.fftSize) / hopSize / frameStep) + 1);
    if (frames === 0) {
        console.warn('Not enough audio for one frame with current fftSize');
        return;
    }


    // downsampling steps to keep canvas reasonable
    const stepX = 1; // Math.max(1, Math.ceil(frames / maxCanvasWidth));
    const stepY = 1; // Math.max(1, Math.ceil(bins / maxCanvasHeight));
    const canvasWidth = Math.ceil(frames / stepX);
    const canvasHeight = Math.ceil(bins / stepY);



    // prepare Hann window
    const windowFn = new Float32Array(window.fftSize);
    for (let i = 0; i < window.fftSize; i++) {
        windowFn[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (window.fftSize - 1)));
    }



    let globalMax = -Infinity;
    let globalMin = Infinity;
    let mags;
    if (window.prevView.start === window.audioFile.view.start && window.prevView.end === window.audioFile.view.end && window.prevView.mags && !rerender) {
        mags = window.prevView.mags;
        globalMax = window.prevView.globalMax;
        globalMin = window.prevView.globalMin;
    } else {
        // compute magnitude spectrogram (linear mags)
        mags = new Array(frames);
        for (let f = 0; f < frames; f++) {
            const start = f * hopSize * frameStep;
            const frame = new Float32Array(window.fftSize);
            for (let i = 0; i < window.fftSize; i++) {
                frame[i] = (rawData[start + i] || 0) * windowFn[i];
            }
            // compute FFT magnitudes using computeFFT (returns mag length fftSize/2)
            const { mag } = computeFFT(frame);
            mags[f] = mag;
            // measure min/max in dB for normalization
            for (let i = 0; i < mag.length; i++) {
                const m = 20 * Math.log10(mag[i] + 1e-12); // in dB
                if (m > globalMax) globalMax = m;
                if (m < globalMin) globalMin = m;
            }
        }
        window.prevView.start = window.audioFile.view.start;
        window.prevView.end = window.audioFile.view.end;
        window.prevView.globalMax = globalMax;
        window.prevView.globalMin = globalMin;
        window.prevView.mags = mags;
    }

    // safety: clamp min relative to max (dynamic range)
    const dynamicRange = 80; // dB
    if (globalMax - globalMin > dynamicRange) {
        globalMin = globalMax - dynamicRange;
    }

    // get or create canvas element with id spectrogramCanvas
    let canvas = document.getElementById(id);
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'spectrogramCanvas';
        const container = document.getElementById('container') || document.body;
        container.appendChild(canvas);
    }

    // Initially set the backing store to the computed resolution
    // Set CSS sizing so the element can be stretched by the page layout.
    // Here we make it fill the available width; height will be computed to preserve aspect ratio.
    // make pixels crisp when scaling is disabled; we'll control smoothing when drawing
    canvas.style.imageRendering = 'pixelated';
    // draw into an offscreen canvas at native resolution
    const off = document.createElement('canvas');
    off.width = canvasWidth;
    off.height = canvasHeight;
    const offCtx = off.getContext('2d');
    // create imageData with the offscreen native resolution
    const imageData = offCtx.createImageData(canvasWidth, canvasHeight);
    const data = imageData.data;

    // helper to map normalized value [0..1] to color using first colormap
    const cmap = colormap[0];
    function colorForNormalized(n) {
        const idx = Math.max(0, Math.min(255, Math.round(n * 255)));
        return [cmap.r[idx], cmap.g[idx], cmap.b[idx]];
    }

    // helper to compute bin range for a given vertical pixel row (yBlockIdx)
    function binRangeForRow(yBlockIdx) {
        // yBlockIdx: 0..canvasHeight-1, where 0 is bottom (we treat 0 as lowest frequency)
        const pStart = yBlockIdx / canvasHeight;
        const pEnd = (yBlockIdx + 1) / canvasHeight;

        let startBin, endBin;

        const startBin_lin = Math.floor(pStart * bins);
        const endBin_lin = Math.floor(pEnd * bins);
        const startBin_log = Math.floor(Math.max(0, Math.pow(bins, pStart) - 1));
        const endBin_log = Math.floor(Math.max(0, Math.pow(bins, pEnd) - 1));

        startBin = Math.round(startBin_lin * (1 - window.yScaleStep / (window.yScaleStepsTotal - 1)) + startBin_log * (window.yScaleStep / (window.yScaleStepsTotal - 1)));
        endBin = Math.round(endBin_lin * (1 - window.yScaleStep / (window.yScaleStepsTotal - 1)) + endBin_log * (window.yScaleStep / (window.yScaleStepsTotal - 1)));
        // clamp and ensure at least one bin
        startBin = Math.max(0, Math.min(bins - 1, startBin));
        endBin = Math.max(0, Math.min(bins - 1, endBin));
        if (endBin < startBin) endBin = startBin;
        return { startBin, endBin };
    }

    // fill pixels (downsampled blocks -> 1 canvas pixel)
    for (let xf = 0, xIdx = 0; xf < frames; xf += stepX, xIdx++) {
        for (let yBlockIdx = 0; yBlockIdx < canvasHeight; yBlockIdx++) {
            // compute bin range for this row
            const { startBin, endBin } = binRangeForRow(yBlockIdx);

            // average magnitude across that bin range for smoother mapping
            let sum = 0;
            let count = 0;
            for (let xi = xf; xi < Math.min(xf + stepX, frames); xi++) {
                const magCol = mags[xi];
                for (let bi = startBin; bi <= endBin; bi++) {
                    const db = 20 * Math.log10((magCol[bi] || 0) + 1e-12);
                    const clamped = Math.max(globalMin, Math.min(globalMax, db));
                    sum += clamped;
                    count++;
                }
            }
            const avgDb = sum / Math.max(1, count);
            // normalize 0..1 (globalMin -> 0, globalMax -> 1)
            const norm = (avgDb - globalMin) / Math.max(1e-12, (globalMax - globalMin));
            const [r, g, b] = colorForNormalized(norm);

            // y: want low frequencies at bottom => invert vertical index
            const pixelY = canvasHeight - 1 - yBlockIdx;
            const pixelX = xIdx;
            const offset = (pixelY * canvasWidth + pixelX) * 4;
            data[offset] = r;
            data[offset + 1] = g;
            data[offset + 2] = b;
            data[offset + 3] = 255; // opaque
        }
    }

    const aticks = [
        [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000],
        [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000],
        [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000],
        [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000],
        [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 24000],
        [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 24000],
        [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
        [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
        [0, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
        [0, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
        [0, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
        [0, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
        [0, 200, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
        [0, 200, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
        [0, 200, 500, 1000, 2000, 4000, 6000, 8000, 10000, 16000, 20000, 24000],
        [0, 200, 500, 1000, 2000, 4000, 6000, 8000, 10000, 16000, 20000, 24000],
        [0, 200, 500, 1000, 2000, 5000, 8000, 10000, 16000, 20000, 24000],
        [0, 100, 200, 500, 1000, 2000, 5000, 8000, 10000, 16000, 20000, 24000],
        [0, 100, 200, 500, 1000, 2000, 5000, 8000, 10000, 16000, 20000, 24000],
        [0, 20, 50, 100, 200, 500, 1000, 2000, 5000, 8000, 10000, 16000, 20000, 24000],
        [0, 20, 50, 100, 200, 500, 1000, 2000, 5000, 8000, 10000, 16000, 20000, 24000],
    ]; // linear ticks
    if (!aticks[window.yScaleStep]) {
        console.warn('No ticks for yScaleStep', window.yScaleStep);
        window.yScaleStep = 0;
    }
    console.log('Using frequency ticks:', window.yScaleStep);
    const ticks = aticks[window.yScaleStep];


    // helper to format frequency nicely
    function fmtHz(v) {
        if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 0).replace(/\.00$/, '') + ' kHz';
        return Math.round(v) + ' Hz';
    }

    // map each frequency to a canvas row (using binRangeForRow so mapping matches the current yScaleStep)
    const y_ticks = new Array(ticks.length);
    const binForFreq = (f) => {
        const binFreq = window.audioFile ? (window.audioFile.sampleRate / window.fftSize) : (48000 / window.fftSize);
        return Math.round(f / binFreq);
    };

    for (let ti = 0; ti < ticks.length; ti++) {
        const targetBin = binForFreq(ticks[ti]);
        let foundY = null;
        for (let yBlockIdx = 0; yBlockIdx < canvasHeight; yBlockIdx++) {
            const { startBin, endBin } = binRangeForRow(yBlockIdx);
            if (targetBin >= startBin && targetBin <= endBin) {
                // invert vertical index to place low freq at bottom
                const pixelY = canvasHeight - 1 - yBlockIdx;
                foundY = pixelY;
                break;
            }
        }
        if (foundY === null) {
            // clamp to top/bottom
            foundY = targetBin <= 0 ? canvasHeight - 1 : 0;
        }
        y_ticks[ti] = foundY;
    }

    for (let i = 0; i < y_ticks.length; i++) {
        // scale from canvas coordinate space to displayed pixel space
        y_ticks[i] = Math.round((y_ticks[i] / Math.max(1, canvasHeight - 1)) * displayHeight);
    }

    const axis = document.getElementById(id + 'YAxis');
    if (!axis) return;
    axis.innerHTML = '';
    axis.style.borderLeft = `1px solid black`;

    for (let i = 0; i < ticks.length; i++) {
        const y = y_ticks[i];

        const tick = document.createElement('div');
        tick.style.position = 'absolute';
        tick.style.left = '0';
        tick.style.top = `${Math.max(0, Math.min(displayHeight - 1, Math.round(y))) - 0.5}px`;
        tick.style.width = '5px';
        tick.style.height = '1px';
        tick.style.background = uiColorTicks;
        tick.style.opacity = '1';
        axis.appendChild(tick);
        if (i === 0 || i === ticks.length - 1) {
            tick.style.width = '5px';
            continue;
        }

        const lbl = document.createElement('div');
        lbl.textContent = fmtHz(ticks[i]);
        lbl.style.position = 'absolute';
        lbl.style.left = '0';
        lbl.style.top = `${Math.max(0, Math.min(displayHeight - 12, Math.round(y - 8)))}px`;
        lbl.style.width = '100%';
        lbl.style.textAlign = 'left';
        lbl.style.fontSize = '12px';
        lbl.style.lineHeight = '12px';
        lbl.style.paddingLeft = '8px';
        lbl.style.color = uiColorLabels;
        lbl.style.userSelect = 'none';
        lbl.style.verticalAlign = 'baseline';
        axis.appendChild(lbl);
    }


    // put image onto offscreen canvas at native resolution
    offCtx.putImageData(imageData, 0, 0);
    const container = document.getElementById('container') || document.body;
    // Now stretch the offscreen image to the visible canvas size.
    requestAnimationFrame(() => {
        // determine display pixel size from computed layout
        const displayW = Math.max(1, canvas.clientWidth);
        // keep aspect ratio based on original pixel aspect
        const displayH = Math.max(1, Math.round(displayW * (canvasHeight / canvasWidth)));

        // set backing store to desired display pixel size (this clears the canvas)
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        // size the element visually
        canvas.style.width = container.clientWidth - 52 + 'px';


        const ctx = canvas.getContext('2d');
        // control smoothing: set to true if you want smooth stretch, false to keep pixelated look
        ctx.imageSmoothingEnabled = true;

        // draw the offscreen native-resolution image stretched to the new size
        ctx.drawImage(off, 0, 0, canvasWidth, canvasHeight);
    });
    spectrogramRendered = true;

}

const NS = 'http://www.w3.org/2000/svg';

const waveformVis = document.getElementById('waveformSVG');
const status = document.getElementById('waveformStatus');

const aggregatedDataMultiplier = 384;  // when audio length exceeds display width by this factor, use aggregated envelope
const aggregatedWaveformThreshold = 60 * 48000; // minimum audio length to consider aggregated waveform

function renderWaveform() {
    const audioLength = window.audioFile.length;

    const tooltip = document.getElementById('waveformTooltip');
    if (tooltip) tooltip.style.visibility = 'hidden';
    // measure the actual displayed pixel size of the SVG
    const rect = waveformVis.getBoundingClientRect();
    const displayWidth = Math.max(1, Math.floor(rect.width));
    const displayHeight = Math.max(1, Math.floor(rect.height));
    const centerY = displayHeight / 2;

    if (!window._zoom) {
        window._zoom = { start: 0, end: audioLength, inited: false };
    }

    // attach wheel handler once
    if (!window._zoom.inited) {
        waveformVis.addEventListener('wheel', (e) => {
            // allow only the dominant axis per wheel event (prevent diagonal dual-axis effect)
            e.preventDefault();
            try {
                const ax = Math.abs(e.deltaX || 0);
                const ay = Math.abs(e.deltaY || 0);
                if (ax === 0 && ay === 0) {
                    // nothing to do
                } else if (ax > ay) {
                    // prefer horizontal: zero vertical component
                    Object.defineProperty(e, 'deltaY', { value: 0, configurable: true });
                } else {
                    // prefer vertical: zero horizontal component
                    Object.defineProperty(e, 'deltaX', { value: 0, configurable: true });
                }
            } catch (err) {
                // If properties cannot be redefined, fall back to preventing default only
            }
            if (e.altKey) {
                // with Alt key, invert vertical zoom direction for more intuitive control
                zoomYAxis(e);
                return;
            }
            zoomWaveform(e);
        }, { passive: false });
        window._zoom.inited = true;
    }

    // Make the SVG coordinate system match the displayed pixels so 1 unit = 1 CSS pixel
    waveformVis.innerHTML = ''; // clear any previous content
    waveformVis.setAttribute('viewBox', `0 0 ${displayWidth} ${displayHeight}`);

    // compute visible window in samples
    //window.audioFile.view.start = Math.max(0, Math.min(audioLength - 1, Math.round(window.audioFile.view.start || window._zoom.start)));
    //window.audioFile.view.end = Math.max(window.audioFile.view.start + 1, Math.min(audioLength, Math.round(window.audioFile.view.end || window._zoom.end)));


    const ticks = [-4, -Math.SQRT2 * 2, -2, -Math.SQRT2, -1, -Math.SQRT1_2, -0.5, -Math.SQRT1_2 * 0.5, -0.25];
    for (let i = 0; i < 34; i++) {
        ticks.push(ticks[ticks.length - 1] / 2);
    }
    ticks.push(0);
    for (let i = ticks.length - 1; i > 0; i--) {
        ticks.push(-ticks[i]);
    }
    const y_ticks = ticks.map(v => centerY - (v * window.audioFile.view.amplitude_scaling * centerY));

    // render y-axis tick labels into the #WaveformYAxis element (if present)
    (function renderYAxis() {
        const axis = document.getElementById('waveformYAxis');
        if (!axis) return;

        // clear previous content and size to svg pixel height
        axis.innerHTML = '';
        axis.style.borderLeft = `1px solid black`;
        if (displayHeight < 10) return; // too small to render anything

        // small helper to format tick values
        function fmt(v) {
            if (v === 0) return '-Inf dB';
            return db(Math.abs(v)).toFixed(0) + ' dB';
        }

        for (let i = 0; i < y_ticks.length; i++) {
            const y = y_ticks[i];

            if (y < 0 || y > displayHeight) continue; // skip out-of-bounds

            if (ticks[i] != 0 && Math.abs(centerY - y) < 20) {
                // skip near-center tick (overlaps 0 dB)
                continue;
            }

            // tick mark (small horizontal line)
            const tick = document.createElement('div');
            tick.style.position = 'absolute';
            tick.style.left = '0';
            tick.style.top = `${Math.max(0, Math.min(displayHeight - 1, Math.round(y))) - 0.5}px`;
            tick.style.width = '5px';
            tick.style.height = '1px';
            tick.style.background = uiColorTicks;
            tick.style.opacity = '1';
            axis.appendChild(tick);
            if (y === 0 || y === displayHeight) {
                tick.style.width = '5px';
                continue;
            }
            // label
            const lbl = document.createElement('div');
            lbl.textContent = fmt(ticks[i]);
            lbl.style.position = 'absolute';
            lbl.style.left = '0';
            lbl.style.top = `${Math.max(-8, Math.min(displayHeight - 12, Math.round(y - 8)))}px`;
            lbl.style.width = '100%';
            lbl.style.textAlign = 'left';
            lbl.style.fontSize = '12px';
            lbl.style.lineHeight = '12px';
            lbl.style.paddingLeft = '8px';
            lbl.style.color = uiColorLabels;
            lbl.style.userSelect = 'none';
            lbl.style.verticalAlign = 'baseline';
            axis.appendChild(lbl);
        }
        const gridLines = y_ticks.length - 1;
        for (let i = 0; i <= gridLines; i++) {
            const gridColor = (i - 1 === Math.floor(gridLines / 2)) ? uiColorTicks : uiColor + '44';
            const y = y_ticks[i];
            if (ticks[i] != 0 && Math.abs(centerY - y) < 20) {
                // skip near-center tick (overlaps 0 dB)
                continue;
            }
            if (y <= 0 || y >= displayHeight) continue; // skip out-of-bounds
            const gridLine = document.createElementNS(NS, 'line');
            gridLine.setAttribute('x1', '0');
            gridLine.setAttribute('y1', String(y));
            gridLine.setAttribute('x2', String(displayWidth));
            gridLine.setAttribute('y2', String(y));
            gridLine.setAttribute('stroke', gridColor);
            gridLine.setAttribute('shape-rendering', 'crispEdges');
            waveformVis.appendChild(gridLine);
        }

    })();

    // render vertical grid lines and time labels into the #waveformXAxis element (if present)
    (function renderXAxis() {
        const select = document.getElementById('timeDisplaySelect');
        const axis = document.getElementById('waveformXAxis');
        axis.innerHTML = '';
        if (!axis) return;
        // global `ratio` controls seconds per grid line (default 1 => lines every second).
        // Set window.ratio = 0.5 for lines every 0.5s, 2 for lines every 2s, etc.
        // pick a sensible seconds-per-grid-line based on current zoom so grid density stays readable
        const baseRate = window.audioFile.sampleRate;
        const visibleSeconds = window.audioFile.visibleSamples / window.audioFile.sampleRate;
        const visibleSamples = window.audioFile.visibleSamples;

        const candidates = [2 / 48000, 0.00002, 0.00005, 0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.20, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1800, 3600];

        if (!visibleSeconds) {
            return; // avoid infinite loop below
        }
        // prefer a candidate that yields between ~4 and ~20 lines in the view
        let interval = candidates.find(c => {
            const lines = visibleSeconds / c;
            return lines >= 4 && lines <= 12;
        });
        // fallback: choose candidate that yields ~10 lines (closest)
        if (!interval) {
            interval = candidates.reduce((best, cur) => {
                const errBest = Math.abs((visibleSeconds / best) - 10);
                const errCur = Math.abs((visibleSeconds / cur) - 10);
                return errCur < errBest ? cur : best;
            });
        }

        const startSample = window.audioFile.view.start || 0;
        const endSample = window.audioFile.view.end || audioLength;

        // compute first tick (in seconds)
        const startSec = startSample / baseRate;
        const endSec = endSample / baseRate;
        const firstTick = Math.ceil(startSec / interval) * interval;
        for (let t = firstTick; t <= endSec + 1e-12; t += interval) {
            const sampleAtTick = t * baseRate;
            const frac = (sampleAtTick - startSample) / window.audioFile.visibleSamples;
            if (frac < 0 || frac > 1) continue;
            const x = Math.floor(Math.max(0, Math.min(displayWidth - 1, Math.round(frac * displayWidth))) + 0.5 * displayWidth / visibleSamples);

            const gridLineSec = document.createElementNS(NS, 'line');
            gridLineSec.setAttribute('x1', String(x));
            gridLineSec.setAttribute('y1', '0');
            gridLineSec.setAttribute('x2', String(x));
            gridLineSec.setAttribute('y2', String(displayHeight));
            gridLineSec.setAttribute('stroke', gridColor);
            gridLineSec.setAttribute('shape-rendering', 'crispEdges');
            waveformVis.appendChild(gridLineSec);

            // small tick mark
            const tick = document.createElement('div');
            tick.style.position = 'absolute';
            tick.style.left = `${x}px`;
            tick.style.top = `24px`;
            tick.style.width = '1px';
            tick.style.height = '8px';
            tick.style.background = uiColorTicks;
            tick.style.pointerEvents = 'none';
            axis.appendChild(tick);

            if (x <= 0 || x >= displayWidth) continue;
            // label
            const lbl = document.createElement('div');
            lbl.textContent = select.value === 'seconds' ? fmtSec(t, true, visibleSeconds < 10, visibleSeconds) : (t * 48000).toFixed(0);
            lbl.style.position = 'absolute';
            lbl.style.left = `${Math.min(x - 24, displayWidth - 48)}px`;
            lbl.style.top = `8px`;
            lbl.style.width = '60px';
            lbl.style.textAlign = 'center';
            lbl.style.fontSize = '12px';
            lbl.style.lineHeight = '12px';
            lbl.style.color = uiColorLabels;
            lbl.style.userSelect = 'none';
            lbl.style.pointerEvents = 'none';
            axis.appendChild(lbl);
        }
    })();

    (function renderWaveformChannels() {
        for (let channel = window.audioFile.channels - 1; channel >= 0; channel--) {
            const lineColor = lineColorOptions[channel % lineColorOptions.length]; //+ 'CC';

            // Faster envelope: aggregate per-column using the shared helper (no per-sample Math.floor calls)
            const { max, min } = window.audioFile.getChannelEnvelopeData(channel, displayWidth);
            const samples = window.audioFile.samples(channel);
            if (window.audioFile.visibleSamples > 50 * displayWidth) {
                // draw aggregated waveform (per-column max/min envelope)
                // Build SVG paths using array push + join (faster than repeated string concatenation)
                const maxParts = [];
                const minParts = [];
                maxParts.push(`M 0 ${centerY}`);
                minParts.push(`M 0 ${centerY}`);
                for (let x = 0; x < displayWidth; x++) {
                    // posArr contains max positive value (0..1)
                    maxParts.push(`${x} ${centerY - (max[x] * window.audioFile.view.amplitude_scaling * centerY)}`);
                    minParts.push(`${x} ${centerY - (min[x] * window.audioFile.view.amplitude_scaling * centerY)}`);
                }
                maxParts.push(`L ${displayWidth} ${centerY}`);
                minParts.push(`L ${displayWidth} ${centerY}`);
                const maxPath = maxParts.join(', ');
                const minPath = minParts.join(', ');
                const path = maxPath + ' ' + minPath;

                const pathElement = document.createElementNS(NS, 'path');
                pathElement.setAttribute('d', path);
                pathElement.setAttribute('fill-rule', 'evenodd');
                pathElement.setAttribute('fill', lineColor);
                pathElement.setAttribute('stroke', lineColor);
                pathElement.setAttribute('stroke-width', '.5');
                pathElement.setAttribute('shape-rendering', 'crispEdges');
                waveformVis.appendChild(pathElement);
            } else {
                // draw full waveform (per-sample mapped into display width)
                let path = `M `;
                for (let i = window.audioFile.view.start; i < window.audioFile.view.end; i++) {
                    const relIndex = i - window.audioFile.view.start;
                    const x = (relIndex * displayWidth) / window.audioFile.visibleSamples;
                    const y = centerY - (samples[i] * window.audioFile.view.amplitude_scaling * centerY);
                    if (window.audioFile.visibleSamples < 1000) {
                        // draw a dot at each sample when few samples are visible
                        const dot = document.createElementNS(NS, 'circle');

                        // tooltip (single reusable element appended to body)
                        let tooltip = document.getElementById('waveformTooltip');
                        if (!tooltip) {
                            tooltip = document.createElement('div');
                            tooltip.id = 'waveformTooltip';
                            Object.assign(tooltip.style, {
                                position: 'fixed',
                                zIndex: 10000,
                                background: uiColor + '44',
                                color: uiColorLabels,
                                pointerEvents: 'none',
                                visibility: 'hidden',
                                fontSize: '12px',
                                padding: '2px 4px',
                            });
                            document.body.appendChild(tooltip);
                        }

                        if (window.audioFile.visibleSamples < 200) {
                            // Add drag cursor and drag functionality for individual samples
                            dot.style.cursor = 'grab';

                            // Drag functionality for individual samples
                            let isDragging = false;
                            let dragStartY = 0;
                            let originalValue = 0;

                            dot.addEventListener('mousedown', (ev) => {
                                if (window.penTool && window.penTool.active) return; // Don't interfere with pen tool
                                ev.preventDefault();
                                ev.stopPropagation(); // Prevent waveform click handler

                                isDragging = true;
                                dragStartY = ev.clientY;
                                originalValue = samples[i];
                                dot.style.cursor = 'grabbing';
                                dot.style.r = String(Math.min(10, 10 - window.audioFile.visibleSamples / 20));

                                // Capture mouse globally during drag
                                document.addEventListener('mousemove', onMouseMove);
                                document.addEventListener('mouseup', onMouseUp);
                            });

                            function onMouseMove(ev) {
                                if (!isDragging) return;

                                const deltaY = ev.clientY - dragStartY;
                                const rect = waveformVis.getBoundingClientRect();
                                const displayHeight = rect.height;
                                const centerY = displayHeight / 2;

                                // Convert pixel movement to sample value change
                                const amplitudeScaling = window.audioFile.view.amplitude_scaling || 1;
                                const valueChange = -deltaY / (centerY * amplitudeScaling);

                                // Calculate new value and clamp to [-1, 1]
                                const newValue = Math.max(-1, Math.min(1, originalValue + valueChange));

                                // Update the sample value
                                samples[i] = newValue;

                                // Update the visual position of the dot
                                const newY = centerY - (newValue * amplitudeScaling * centerY);
                                dot.setAttribute('cy', String(newY));
                            }

                            function onMouseUp(ev) {
                                if (!isDragging) return;

                                isDragging = false;
                                dot.style.cursor = 'grab';

                                // Remove global mouse listeners
                                document.removeEventListener('mousemove', onMouseMove);
                                document.removeEventListener('mouseup', onMouseUp);

                                // Schedule full re-render after drag is complete
                                setTimeout(() => {
                                    try {
                                        window.audioFile.processWaveformData();
                                        renderWaveform();
                                        if (spectrogramRendered) {
                                            renderSpectrogram(true, 0, 'spectrogramCanvas1');
                                        }
                                        // Update stats if available
                                        if (typeof updateAudioStats === 'function') {
                                            updateAudioStats();
                                        }
                                    } catch (err) {
                                        console.warn('Error re-rendering after sample drag:', err);
                                    }
                                }, 10);
                            }
                        }
                        // show sample/time/value on hover
                        dot.addEventListener('mouseenter', (ev) => {
                            try {
                                const sampleIdx = i;
                                const sr = window.audioFile.sampleRate;
                                const timeSec = sampleIdx / sr;
                                const linearVal = samples[sampleIdx];
                                // use imported db() if available, otherwise compute 20*log10(abs(x))
                                tooltip.innerHTML = `Channel ${channel + 1}<br>${fmtSec(timeSec, false, true, 0.0001)}<br>#${sampleIdx}<br>${linearVal.toFixed(10)}`;
                                tooltip.style.visibility = 'visible';
                                // position near pointer
                                tooltip.style.left = (ev.clientX + 12) + 'px';
                                tooltip.style.top = (ev.clientY + 12) + 'px';
                            } catch (err) {
                                // ignore
                            }
                        });
                        dot.addEventListener('mouseleave', () => {
                            tooltip.style.visibility = 'hidden';
                        });
                        dot.setAttribute('cx', String(x + 0.5 * displayWidth / window.audioFile.visibleSamples));
                        dot.setAttribute('cy', String(y));
                        dot.setAttribute('r', String(Math.min(3, 3 - window.audioFile.visibleSamples / 333)));
                        dot.setAttribute('fill', lineColor);
                        dot.setAttribute('stroke', 'none');
                        dot.setAttribute('shape-rendering', 'crispEdges');
                        waveformVis.appendChild(dot);
                    }
                    path += `${x} ${y}, `;
                }
                const posElem = document.createElementNS(NS, 'path');
                // If few samples are visible, replace the straight polyline with a smooth sinc (Lanczos) interpolation.
                if (window.audioFile.visibleSamples < 500) {
                    const N = window.audioFile.visibleSamples;
                    // build y-values in sample-index space
                    const ys = new Float32Array(N);
                    for (let n = 0; n < N; n++) {
                        ys[n] = centerY - (samples[window.audioFile.view.start + n] * window.audioFile.view.amplitude_scaling * centerY);
                    }

                    // sinc and Lanczos kernels
                    function sinc(x) {
                        if (x === 0) return 1;
                        const v = Math.PI * x;
                        return Math.sin(v) / v;
                    }
                    function lanczos(x, a) {
                        if (Math.abs(x) >= a) return 0;
                        return sinc(x) * sinc(x / a);
                    }

                    const a = 2; // Lanczos window size (3 lobes)
                    // build interpolated path sampled at each display pixel (x = 0..displayWidth)
                    let interpPath = '';
                    const X = Math.max(1, displayWidth);
                    console.log('Lanczos interpolation of', N, 'samples into', X, 'pixels');
                    for (let px = 0; px <= X; px++) {
                        // fractional sample index corresponding to this x
                        const t = (px / X) * (N - 1);
                        let sum = 0;
                        let norm = 0;
                        const k0 = Math.max(0, Math.floor(t - a));
                        const k1 = Math.min(N - 1, Math.ceil(t + a));
                        for (let k = k0; k <= k1; k++) {
                            const w = lanczos(t - k, a);
                            if (w !== 0) {
                                sum += ys[k] * w;
                                norm += w;
                            }
                        }
                        const y = norm > 0 ? (sum / norm) : ys[Math.max(0, Math.min(N - 1, Math.round(t)))];
                        interpPath += (px === 0 ? `M ${px} ${y}` : `, ${px} ${y}`);
                    }
                    posElem.setAttribute('d', interpPath);
                } else {
                    posElem.setAttribute('d', path);
                }
                posElem.setAttribute('fill', 'none');
                posElem.setAttribute('stroke', lineColor);
                posElem.setAttribute('shape-rendering', 'crispEdges');
                waveformVis.appendChild(posElem);
            }
        }
    })();

    (function createPlayheadElements() {
        waveformVis._playhead = {};
        // create svg line element for playhead
        const phLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        phLine.setAttribute('x1', '0');
        phLine.setAttribute('x2', '0');
        phLine.setAttribute('y1', '0');
        phLine.setAttribute('y2', String(displayHeight));
        phLine.setAttribute('stroke', highlightColor);
        phLine.setAttribute('stroke-width', '1');
        phLine.setAttribute('visibility', 'hidden');
        phLine.setAttribute('shape-rendering', 'crispEdges');
        waveformVis.appendChild(phLine);
        waveformVis._playhead.line = phLine;

        const phLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        phLabel.setAttribute('x', '4');
        phLabel.setAttribute('y', String(displayHeight - 6));
        phLabel.setAttribute('fill', uiColor);
        phLabel.setAttribute('font-size', '12');
        phLabel.setAttribute('font-family', 'monospace');
        phLabel.setAttribute('visibility', 'hidden');
        phLabel.setAttribute('pointer-events', 'none');
        phLabel.textContent = '';
        waveformVis.appendChild(phLabel);

        // small time label shown at bottom of playhead
        const phLabelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        phLabelBg.setAttribute('x', '0');
        phLabelBg.setAttribute('y', String(displayHeight - 18));
        phLabelBg.setAttribute('width', '64');
        phLabelBg.setAttribute('height', '16');
        phLabelBg.setAttribute('fill', uiColor + '44');
        phLabelBg.setAttribute('visibility', 'hidden');
        phLabelBg.setAttribute('rx', '3');
        phLabelBg.setAttribute('ry', '3');
        waveformVis.appendChild(phLabelBg);

        // attach to playhead state
        waveformVis._playhead.label = phLabel;
        waveformVis._playhead.labelBg = phLabelBg;

        const axis = document.getElementById('waveformXAxis');
        if (axis) {
            // ensure axis can host absolutely-positioned children
            axis.style.position = axis.style.position || 'relative';

            const axisHighlight = document.createElement('div');
            axisHighlight.style.position = 'absolute';
            axisHighlight.style.top = '0';
            axisHighlight.style.height = '100%';
            axisHighlight.style.background = uiColor;
            axisHighlight.style.width = '2px';
            axisHighlight.style.pointerEvents = 'none';
            axisHighlight.style.visibility = 'hidden';
            axis.appendChild(axisHighlight);

            const axisHighlightStart = document.createElement('div');
            axisHighlightStart.style.position = 'absolute';
            axisHighlightStart.style.top = '0';
            axisHighlightStart.style.height = '100%';
            axisHighlightStart.style.background = uiColor;
            axisHighlightStart.style.width = '2px';
            axisHighlightStart.style.pointerEvents = 'none';
            axisHighlightStart.style.visibility = 'hidden';
            axis.appendChild(axisHighlightStart);

            const axisHighlights = document.createElement('div');
            axisHighlights.style.position = 'absolute';
            axisHighlights.style.top = 'calc(50vh - 12px)';
            axisHighlights.style.height = 'calc(50vh - 48px - 1px)';
            axisHighlights.style.background = '#ffffff' + '55';
            axisHighlights.style.width = '1px';
            axisHighlights.style.pointerEvents = 'none';
            axisHighlights.style.visibility = 'hidden';
            axis.appendChild(axisHighlights);

            const axisSelection = document.createElement('div');
            axisSelection.style.position = 'absolute';
            axisSelection.style.top = '0';
            axisSelection.style.height = '100%';
            axisSelection.style.background = uiColor + '22';
            axisSelection.style.pointerEvents = 'none';
            axisSelection.style.visibility = 'hidden';
            axis.appendChild(axisSelection);
            waveformVis._playhead._axisSelection = axisSelection;

            if (window.MutationObserver) {
                const mo = new MutationObserver(() => {
                    try {
                        const vis = phLine.getAttribute('visibility');
                        if (!vis || vis === 'hidden') {
                            axisHighlight.style.visibility = 'hidden';
                            axisHighlights.style.visibility = 'hidden';
                            axisSelection.style.visibility = 'hidden';
                            axisHighlightStart.style.visibility = 'hidden';
                            return;
                        }
                        axisHighlight.style.visibility = 'visible';
                        axisHighlights.style.visibility = 'visible';
                        const x = parseFloat(phLine.getAttribute('x1')) || 0;
                        axisHighlight.style.left = `${x - 1}px`;
                        axisHighlights.style.left = `${x - 0.5}px`;

                        axisHighlight.style.background = phLine.getAttribute('stroke');
                        if (window.audioFile.playing) {
                            axisHighlight.style.background = highlightColorActive + 'ff';
                            axisHighlights.style.background = highlightColorActive + '55';
                        } else if (window.audioFile.recording) {
                            axisHighlight.style.background = highlightColorRecording + 'ff';
                            axisHighlights.style.background = highlightColorRecording + '55';
                            axisSelection.style.visibility = 'visible';
                            axisSelection.style.background = highlightColorRecording + '22';

                            const offset = window.audioFile.length - (window.audioFile.recordingStartSample || 0);
                            const startX = xForSample(window.audioFile.recordingStartSample || 0, displayWidth);
                            
                            const endX = xForSample(window.audioFile.length-offset, displayWidth);
                            const selX = Math.min(startX, endX);
                            const selW = Math.abs(xForSample(window.audioFile.playhead.position, displayWidth) - startX);
                            axisSelection.style.left = `${selX}px`;
                            axisSelection.style.width = `${Math.max(1, selW)}px`;

                            axisHighlightStart.style.left = `${startX - 1}px`;
                            axisHighlightStart.style.background = highlightColorRecording + 'ff';
                            axisHighlightStart.style.visibility = 'visible';
                        } else {
                            axisHighlight.style.background = uiColor + 'ff';
                            axisHighlights.style.background = uiColor + '55';
                        }
                    } catch (err) {
                        // ignore errors from parsing attrs
                    }
                });
                mo.observe(phLine, { attributes: true });
                waveformVis._playhead._axisObserver = mo;
            }
        }
    })();
    const highlightColorActive = '#72cc1e';
    const highlightColorRecording = '#cc4f1e';

    // --- Playhead (click-to-seek + playback) ---
    // update visual position/visibility of playhead (called every render)
    waveformVis._playhead.updateVisual = function () {
        const ph = waveformVis._playhead;
        if (window.audioFile.playhead.position == null
            || window.audioFile.playhead.position < window.audioFile.view.start
            || window.audioFile.playhead.position > window.audioFile.view.end
        ) {
            ph.line.setAttribute('visibility', 'hidden');
            if (ph.label) ph.label.setAttribute('visibility', 'hidden');
            if (ph.labelBg) ph.labelBg.setAttribute('visibility', 'hidden');
            return;
        }
        console.log(window.audioFile.playhead.position, window.audioFile.view.start, window.audioFile.view.end);
        const x = xForSample(window.audioFile.playhead.position, displayWidth);
        ph.line.setAttribute('x1', String(x));
        ph.line.setAttribute('x2', String(x));
        ph.line.setAttribute('y2', String(displayHeight));
        ph.line.setAttribute('visibility', 'visible');
        if (window.audioFile.playing) {
            ph.line.setAttribute('stroke', highlightColorActive + '55');
            ph.labelBg.setAttribute('fill', highlightColorActive + '44');
            ph.label.setAttribute('fill', highlightColorActive);
        } else if (window.audioFile.recording) {
            ph.line.setAttribute('stroke', highlightColorRecording + '55');
            ph.labelBg.setAttribute('fill', highlightColorRecording + '44');
            ph.label.setAttribute('fill', highlightColorRecording);
        } else {
            ph.line.setAttribute('stroke', highlightColor);
            ph.labelBg.setAttribute('fill', highlightColor + '44');
            ph.label.setAttribute('fill', highlightColor);
        }

        // update time label at bottom of playhead
        try {
            const sampleRate = window.audioFile.sampleRate;
            const visibleSeconds = window.audioFile.visibleSamples / sampleRate;
            const timeSec = window.audioFile.playhead.position / sampleRate;
            // visibleSeconds is in scope of renderWaveform; fall back if missing
            const range = (typeof visibleSeconds === 'number' && visibleSeconds > 0) ? visibleSeconds : 1;
            const txt = fmtSec(timeSec, true, true, 0.01);
            ph.label.innerHTML = txt;
            // position label a few px to the right of the playhead, but keep inside svg width
            const approxW = ph.label.getBBox().width + 8;
            const labelX = Math.max(2, Math.min(displayWidth - approxW - 2, x + 4));
            ph.label.setAttribute('x', String(labelX));
            ph.label.setAttribute('y', String(displayHeight - 6));
            ph.label.setAttribute('visibility', 'visible');
            ph.labelBg.setAttribute('x', String(labelX - 2));
            ph.labelBg.setAttribute('y', String(displayHeight - 18));
            ph.labelBg.setAttribute('width', String(ph.label.getBBox().width + 8));
            ph.labelBg.setAttribute('height', String(ph.label.getBBox().height + 4));
            ph.labelBg.setAttribute('visibility', 'visible');
        } catch (err) {
            console.error('Error updating playhead label:', err);
        }
    };

    // Ensure playhead vertical size matches current render
    if (waveformVis._playhead && waveformVis._playhead.line) {
        waveformVis._playhead.line.setAttribute('y2', String(displayHeight));
    }

    // Click / touch handlers for seeking + toggling playback
    (function attachPlayheadHandlers() {
        // avoid attaching multiple times
        if (window.audioFile.playhead.inited) return;
        window.audioFile.playhead.inited = true;

        waveformVis.addEventListener('click', (e) => {
            const rect = waveformVis.getBoundingClientRect();
            const xPosition = clamp(e.clientX - rect.left, 0, rect.width);
            const sample = sampleForX(xPosition, Math.max(1, Math.floor(rect.width)));

            if (window.audioFile.playing) {
                // if clicking near current play position, pause; otherwise restart at new position
                const near = Math.abs((window.audioFile.playhead.position || 0) - sample) < 2;
                if (near) {
                    window.audioFile.stop();
                } else {
                    window.audioFile.playFrom(sample);
                }
            } else {
                window.audioFile.playhead.position = sample;
                waveformVis._playhead.updateVisual();
                console.log('Playhead seek to sample', sample);
            }
            const tick = () => {
                if (!window.audioFile.playing) return;
                const elapsed = window.audioFile.ctx.currentTime - window.audioFile.playStartTime;
                const cur = window.audioFile.playStartOffset * window.audioFile.sampleRate + elapsed * window.audioFile.sampleRate;
                window.audioFile.playhead.position = Math.min(audioFile.length, cur);

                waveformVis._playhead.updateVisual();
                window.audioFile.playhead.raf = requestAnimationFrame(tick);
            };
            window.audioFile.playhead.raf = requestAnimationFrame(tick);
            waveformVis._playhead.updateVisual();
        });

        const axis = document.getElementById('waveformXAxis');
        axis.style.cursor = 'pointer';
        axis.addEventListener('click', (e) => {
            const rect = waveformVis.getBoundingClientRect();
            const xPosition = clamp(e.clientX - rect.left, 0, rect.width);
            const sample = sampleForX(xPosition, Math.max(1, Math.floor(rect.width)));

            if (window.audioFile.playing) {
                // if clicking near current play position, pause; otherwise restart at new position
                const near = Math.abs((window.audioFile.playhead.position || 0) - sample) < 2;
                if (near) {
                    window.audioFile.stop();
                } else {
                    window.audioFile.playFrom(sample);
                }
            } else {
                window.audioFile.playFrom(sample);
                console.log('Playhead seek to sample', sample);
            }
            const tick = () => {
                if (!window.audioFile.playing) return;
                const elapsed = window.audioFile.ctx.currentTime - window.audioFile.playStartTime;
                const cur = window.audioFile.playStartOffset * window.audioFile.sampleRate + elapsed * window.audioFile.sampleRate;
                window.audioFile.playhead.position = Math.min(audioFile.length, cur);

                waveformVis._playhead.updateVisual();
                window.audioFile.playhead.raf = requestAnimationFrame(tick);
            };
            window.audioFile.playhead.raf = requestAnimationFrame(tick);
        });

        // support basic touch (tap to seek/play)
        waveformVis.addEventListener('touchend', (ev) => {
            if (!ev.changedTouches || ev.changedTouches.length === 0) return;
            if (waveformVis._selection && waveformVis._selection.dragging) return;
            const t = ev.changedTouches[0];
            const rect = waveformVis.getBoundingClientRect();
            const px = clamp(t.clientX - rect.left, 0, rect.width);
            const sample = sampleForX(px, displayWidth);
            if (window.audioFile.playing) {
                // if clicking near current play position, pause; otherwise restart at new position
                const near = Math.abs((window.audioFile.playhead.position || 0) - sample) < 2;
                if (near) {
                    window.audioFile.stop();
                } else {
                    window.audioFile.playFrom(sample);
                }
            } else {
                window.audioFile.playhead.position = sample;
                waveformVis._playhead.updateVisual();
                console.log('Playhead seek to sample', sample);
            }
            ev.preventDefault();
        });

        // keyboard: space toggles play/pause at current playhead or start of view
        window.addEventListener('keydown', (ev) => {
            if (ev.shiftKey) return; // ignore modified clicks
            if (ev.code === 'Space') {
                if (window.audioFile.recording) {
                    console.log('Space key pressed: stop recording');
                    window.audioFile.stopRecording();
                    waveformVis._playhead.updateVisual();
                    return;
                }
                console.log('Space key pressed: toggle play/pause');
                ev.preventDefault();
                if (window.audioFile.playing) {
                    window.audioFile.stop();
                    console.log('Playback stopped');

                    waveformVis._playhead.updateVisual();
                } else {
                    // if no currentSample, start at window.audioFile.view.start; else at currentSample
                    const startSamp = window.audioFile.playhead.position != null ? window.audioFile.playhead.position : window.audioFile.view.start;
                    window.audioFile.playFrom(startSamp);
                    console.log('Playback started from sample', startSamp);
                }
                const tick = () => {
                    if (!window.audioFile.playing) return;
                    const elapsed = window.audioFile.ctx.currentTime - window.audioFile.playStartTime;
                    const cur = window.audioFile.playStartOffset * window.audioFile.sampleRate + elapsed * window.audioFile.sampleRate;
                    window.audioFile.playhead.position = Math.min(window.audioFile.length, cur);

                    waveformVis._playhead.updateVisual();
                    window.audioFile.playhead.raf = requestAnimationFrame(tick);
                };
                window.audioFile.playhead.raf = requestAnimationFrame(tick);
                
                
                waveformVis._playhead.updateVisual();
            }
            
        });
    })();

    // ensure playhead visual is updated for this render (reposition if necessary)
    if (waveformVis._playhead) waveformVis._playhead.updateVisual();

    // update status text with current zoom window
    status.innerHTML = `View: &nbsp; ${fmtSec(window.audioFile.view.start / window.audioFile.sampleRate, false, true, 0.01)} — ${fmtSec(window.audioFile.view.end / window.audioFile.sampleRate, false, true, 0.01)} (${fmtSamples(window.audioFile.view.start)} — ${fmtSamples(window.audioFile.view.end)}) &nbsp; Duration: ${fmtSec(window.audioFile.visibleSamples / window.audioFile.sampleRate, false, true, 0.01)} (${fmtSamples(window.audioFile.visibleSamples)})`;

    // stop further rendering in the outer function (we handled drawing here)
    return;

}

function clearSpectrogram() {
    spectrogramRendered = false;
    const canvas = document.getElementById('spectrogramCanvas1');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;
    try {
        const w = canvas.width, h = canvas.height;
        if (w === 0 || h === 0) return;
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            // halve RGB channels, leave alpha unchanged
            d[i] = d[i] >> 1;
            d[i + 1] = d[i + 1] >> 1;
            d[i + 2] = d[i + 2] >> 1;
        }
        ctx.putImageData(img, 0, 0);
    } catch (err) {
        // fallback to clearing if pixel access is not permitted
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// upload handler: use file input (type=file) or a text/url input. Triggered by uploadBtn.
(function () {
    const input = document.getElementById('wavefileInput');
    if (!input) return;

    input.addEventListener('change', async (e) => {
        e.preventDefault();
        window.audioFile.stop();
        let arrayBuffer = null;
        setLoadingState(true);
        clearSpectrogram();
        // If the input is a file input and a file is selected, use it
        if (input.files && input.files.length > 0) {
            arrayBuffer = await input.files[0].arrayBuffer();
        } else {
            alert('Please select a .wav file or enter a valid URL in the wavefileInput.');
            return;
        }
        await window.audioFile.loadWaveformFromArrayBuffer(arrayBuffer);
        setLoadingState(false);
        if (!window.audioFile.audioBuffer) {
            setLoadingState(true);
            const loadingAninm = document.getElementById('loadingAnimation');
            if (loadingAninm) {
                loadingAninm.style.display = 'none';
            }
            const loadingText = document.getElementById('loadingText');
            if (loadingText) {
                loadingText.innerText = 'Click "Open..." to load a .wav file';
            }
            const fileTitle = document.getElementById('fileTitle');
            if (fileTitle) {
                fileTitle.innerText = 'No file loaded';
            }
            return;
        }
        // update UI and re-render views
        const status = document.getElementById('waveformStatus');
        window.prevView = { start: 0, end: null, globalMax: null, globalMin: null, mags: null };
        window._zoom = null;
        window.audioFile.resetView();

        setLoadingState(false);

        renderWaveform();
        renderSpectrogram(true);

        document.getElementById('fileTitle').innerText = `${(input.files && input.files.length > 0) ? input.files[0].name : input.value}`;
        window.audioFile.filename = `${(input.files && input.files.length > 0) ? input.files[0].name : input.value}`;

        try {
        } catch (err) {
            console.error('Error loading audio file:', err);
            alert('Failed to load audio file: ' + (err && err.message ? err.message : String(err)));
        }
        setLoadingState(false);
    }, { passive: false });
})();

function setLoadingState(isLoading, text = 'Loading...') {
    const loadingSVG = document.getElementById('waveformLoading');
    const spectrogramCanvas1 = document.getElementById('spectrogramCanvas1');
    const waveformVis = document.getElementById('waveformSVG');
    if (isLoading) {
        const loadingAninm = document.getElementById('loadingAnimation');
        if (loadingAninm) {
            loadingAninm.style.display = 'block';
        }
        const loadingText = document.getElementById('loadingText');
        if (loadingText) {
            loadingText.innerText = text;
        }
        loadingSVG.style.display = 'flex';
        spectrogramCanvas1.style.display = 'none';
        waveformVis.style.display = 'none';
    } else {
        loadingSVG.style.display = 'none';
        spectrogramCanvas1.style.display = 'block';
        waveformVis.style.display = 'block';
    }
}

setLoadingState(true);

window.addEventListener('resize', function (event) {
    renderSpectrogram(true, 0, 'spectrogramCanvas1');
    renderWaveform();
    console.log('resize event triggered')
}, true);

const select = document.getElementById('timeDisplaySelect');
select.addEventListener('change', function (event) {
    renderWaveform();
    window.timeDisplayUnit = select.value;
    console.log('timeDisplayUnit set to', window.timeDisplayUnit);
}, true);

document.getElementById('resetZoomBtn').addEventListener('click',
    function (event) {
        window._zoom = null;
        window.audioFile.resetView();
        renderWaveform();
        renderSpectrogram(true, 0, 'spectrogramCanvas1');
        console.log('reset zoom')
    }, true);

document.addEventListener('DOMContentLoaded', async () => {
    prepareUIElements();
    /*document.getElementById('fileTitle').innerText = `static/test4.wav`;
    await window.audioFile.loadFile('test4.wav');
    setLoadingState(false);*/
    const loadingAninm = document.getElementById('loadingAnimation');
    if (loadingAninm) {
        loadingAninm.style.display = 'none';
    }
    const loadingText = document.getElementById('loadingText');
    if (loadingText) {
        loadingText.innerText = 'Click "Open..." to load a .wav file';
    }
});

// Toggle side panel visibility and adjust container width
function toggleSidePanel() {
    const sidePanel = document.getElementById('sidePanel');
    const container = document.getElementById('container');

    if (!sidePanel || !container) {
        console.warn('Side panel or container element not found');
        return;
    }

    // Check current visibility state
    const isVisible = sidePanel.style.display == 'block';

    if (isVisible) {
        // Hide side panel
        sidePanel.style.display = 'none';
        // Expand container to full width
        container.style.width = '100%';
    } else {
        // Show side panel
        sidePanel.style.display = 'block';
        // Adjust container width to account for side panel
        container.style.width = 'calc(100% - 16.666667%)'; // Equivalent to lg:w-1/6
    }

    // Trigger re-rendering to adjust to new layout
    setTimeout(() => {
        try {
            renderWaveform();
            if (spectrogramRendered) {
                renderSpectrogram(true, 0, 'spectrogramCanvas1');
            }
        } catch (err) {
            console.warn('Error re-rendering after panel toggle:', err);
        }
    }, 0); // Small delay to ensure layout has settled
}

function applyFilter(filterCoeff = A_WEIGHTING_COEFFICIENTS) {
    setLoadingState(true);
    window.audioFile.applySOSFilter(filterCoeff.a, filterCoeff.b);
    window.audioFile.processWaveformData();
    setLoadingState(false);
    updateAudioStats();
    renderWaveform();
    renderSpectrogram(true, 0, 'spectrogramCanvas1');
}

function newFile() {
    window.audioFile.stop();
    window.audioFile = new AudioFile();
    setLoadingState(false);
    renderWaveform();
    renderSpectrogram(true, 0, 'spectrogramCanvas1');
    document.getElementById('fileTitle').innerText = 'No filename entered';
    window.audioFile.filename = '';
    window.audioFile.startRecording();
    window.audioFile.stopRecording();
}
window.newFile = newFile;

window.applyFilter = applyFilter;
// Make function globally available
window.toggleSidePanel = toggleSidePanel;
window.renderSpectrogram = renderSpectrogram;
window.renderWaveform = renderWaveform;
window.setLoadingState = setLoadingState;
window.waveformVis = waveformVis;

console.log('waveform.js loaded');


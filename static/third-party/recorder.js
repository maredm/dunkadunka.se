"use strict";
/**
 * Audio Recorder with Web Worker
 *
 * Original implementation using inline-worker
 * TypeScript port: 2026-01-29
 *
 * This recorder uses a Web Worker to handle audio buffer processing
 * and WAV encoding off the main thread.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Recorder = void 0;
class Recorder {
    constructor(source, cfg) {
        this.recording = false;
        this.config = Object.assign({ bufferLen: 4096, numChannels: 2, mimeType: 'audio/wav', callback: () => { } }, cfg);
        this.callbacks = {
            getBuffer: [],
            exportWAV: []
        };
        this.context = source.context;
        // Create audio node: prefer AudioWorkletNode, fall back to ScriptProcessorNode
        this.node = null;
        const setupScriptProcessor = () => {
            const sp = (this.context.createScriptProcessor ||
                this.context.createJavaScriptNode).call(this.context, this.config.bufferLen, this.config.numChannels, this.config.numChannels);
            sp.onaudioprocess = (e) => {
                if (!this.recording)
                    return;
                const buffer = [];
                for (let channel = 0; channel < this.config.numChannels; channel++) {
                    buffer.push(e.inputBuffer.getChannelData(channel));
                }
                this.worker.postMessage({
                    command: 'record',
                    buffer: buffer
                });
            };
            source.connect(sp);
            sp.connect(this.context.destination);
            this.node = sp;
        };
        // Try to use AudioWorklet if available
        if (this.context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
            const processorCode = `
                        class RecorderProcessor extends AudioWorkletProcessor {
                            constructor() {
                                super();
                            }
                            process(inputs) {
                                const input = inputs[0];
                                if (input && input.length > 0) {
                                    // copy channel data to send to main thread
                                    const channels = input.map(channel => channel.slice(0));
                                    this.port.postMessage({ command: 'record', buffer: channels });
                                }
                                return true;
                            }
                        }
                        registerProcessor('recorder-processor', RecorderProcessor);
                    `;
            const blob = new Blob([processorCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            this.context.audioWorklet.addModule(url).then(() => {
                const workletNode = new AudioWorkletNode(this.context, 'recorder-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    channelCount: this.config.numChannels
                });
                workletNode.port.onmessage = (e) => {
                    if (e.data && e.data.command === 'record') {
                        this.worker.postMessage({ command: 'record', buffer: e.data.buffer });
                    }
                };
                source.connect(workletNode);
                workletNode.connect(this.context.destination);
                // disconnect any previous node (fallback) and replace
                if (this.node) {
                    try {
                        this.node.disconnect();
                    }
                    catch (err) { /* ignore */ }
                }
                this.node = workletNode;
                URL.revokeObjectURL(url);
            }).catch(() => {
                // if worklet fails to load, fall back to ScriptProcessor
                setupScriptProcessor();
            });
        }
        else {
            // no audioWorklet support, use ScriptProcessor fallback
            setupScriptProcessor();
        }
        // Create inline worker
        this.worker = this.createWorker();
        this.worker.postMessage({
            command: 'init',
            config: {
                sampleRate: this.context.sampleRate,
                numChannels: this.config.numChannels
            }
        });
        this.worker.onmessage = (e) => {
            const cb = this.callbacks[e.data.command].pop();
            if (typeof cb === 'function') {
                cb(e.data.data);
            }
        };
    }
    createWorker() {
        const workerCode = `
            let recLength = 0;
            let recBuffers = [];
            let sampleRate;
            let numChannels;

            this.onmessage = function(e) {
                switch (e.data.command) {
                    case 'init':
                        init(e.data.config);
                        break;
                    case 'record':
                        record(e.data.buffer);
                        break;
                    case 'exportWAV':
                        exportWAV(e.data.type);
                        break;
                    case 'getBuffer':
                        getBuffer();
                        break;
                    case 'clear':
                        clear();
                        break;
                }
            };

            function init(config) {
                sampleRate = config.sampleRate;
                numChannels = config.numChannels;
                initBuffers();
            }

            function record(inputBuffer) {
                for (let channel = 0; channel < numChannels; channel++) {
                    recBuffers[channel].push(inputBuffer[channel]);
                }
                recLength += inputBuffer[0].length;
            }

            function exportWAV(type) {
                let buffers = [];
                for (let channel = 0; channel < numChannels; channel++) {
                    buffers.push(mergeBuffers(recBuffers[channel], recLength));
                }
                let interleaved;
                if (numChannels === 2) {
                    interleaved = interleave(buffers[0], buffers[1]);
                } else {
                    interleaved = buffers[0];
                }
                let dataview = encodeWAV(interleaved);
                let audioBlob = new Blob([dataview], { type: type });

                self.postMessage({ command: 'exportWAV', data: audioBlob });
            }

            function getBuffer() {
                let buffers = [];
                for (let channel = 0; channel < numChannels; channel++) {
                    buffers.push(mergeBuffers(recBuffers[channel], recLength));
                }
                self.postMessage({ command: 'getBuffer', data: buffers });
            }

            function clear() {
                recLength = 0;
                recBuffers = [];
                initBuffers();
            }

            function initBuffers() {
                for (let channel = 0; channel < numChannels; channel++) {
                    recBuffers[channel] = [];
                }
            }

            function mergeBuffers(recBuffers, recLength) {
                let result = new Float32Array(recLength);
                let offset = 0;
                for (let i = 0; i < recBuffers.length; i++) {
                    result.set(recBuffers[i], offset);
                    offset += recBuffers[i].length;
                }
                return result;
            }

            function interleave(inputL, inputR) {
                let length = inputL.length + inputR.length;
                let result = new Float32Array(length);

                let index = 0;
                let inputIndex = 0;

                while (index < length) {
                    result[index++] = inputL[inputIndex];
                    result[index++] = inputR[inputIndex];
                    inputIndex++;
                }
                return result;
            }

            function floatTo16BitPCM(output, offset, input) {
                for (let i = 0; i < input.length; i++, offset += 2) {
                    let s = Math.max(-1, Math.min(1, input[i]));
                    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                }
            }

            function writeString(view, offset, string) {
                for (let i = 0; i < string.length; i++) {
                    view.setUint8(offset + i, string.charCodeAt(i));
                }
            }

            function encodeWAV(samples) {
                let buffer = new ArrayBuffer(44 + samples.length * 2);
                let view = new DataView(buffer);

                /* RIFF identifier */
                writeString(view, 0, 'RIFF');
                /* RIFF chunk length */
                view.setUint32(4, 36 + samples.length * 2, true);
                /* RIFF type */
                writeString(view, 8, 'WAVE');
                /* format chunk identifier */
                writeString(view, 12, 'fmt ');
                /* format chunk length */
                view.setUint32(16, 16, true);
                /* sample format (raw) */
                view.setUint16(20, 1, true);
                /* channel count */
                view.setUint16(22, numChannels, true);
                /* sample rate */
                view.setUint32(24, sampleRate, true);
                /* byte rate (sample rate * block align) */
                view.setUint32(28, sampleRate * 4, true);
                /* block align (channel count * bytes per sample) */
                view.setUint16(32, numChannels * 2, true);
                /* bits per sample */
                view.setUint16(34, 16, true);
                /* data chunk identifier */
                writeString(view, 36, 'data');
                /* data chunk length */
                view.setUint32(40, samples.length * 2, true);

                floatTo16BitPCM(view, 44, samples);

                return view;
            }
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        return new Worker(URL.createObjectURL(blob));
    }
    /**
     * Start recording
     */
    record() {
        this.recording = true;
    }
    /**
     * Stop recording
     */
    stop() {
        this.recording = false;
    }
    /**
     * Clear recorded buffers
     */
    clear() {
        this.worker.postMessage({ command: 'clear' });
    }
    /**
     * Get recorded buffers
     * @param cb - Callback function to receive the buffers
     */
    getBuffer(cb) {
        const callback = cb || this.config.callback;
        if (!callback)
            throw new Error('Callback not set');
        this.callbacks.getBuffer.push(callback);
        this.worker.postMessage({ command: 'getBuffer' });
    }
    /**
     * Export recorded audio as WAV
     * @param cb - Callback function to receive the Blob
     * @param mimeType - MIME type for the exported audio
     */
    exportWAV(cb, mimeType) {
        const type = mimeType || this.config.mimeType;
        const callback = cb || this.config.callback;
        if (!callback)
            throw new Error('Callback not set');
        this.callbacks.exportWAV.push(callback);
        this.worker.postMessage({
            command: 'exportWAV',
            type: type
        });
    }
    /**
     * Force download of a blob
     * @param blob - The blob to download
     * @param filename - The filename for the download
     */
    static forceDownload(blob, filename) {
        const url = (window.URL || window.webkitURL).createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'output.wav';
        const click = document.createEvent('Event');
        click.initEvent('click', true, true);
        link.dispatchEvent(click);
    }
    /**
     * Disconnect and cleanup
     */
    disconnect() {
        this.stop();
        if (this.node) {
            try {
                this.node.disconnect();
            }
            catch (err) { /* ignore */ }
        }
        this.worker.terminate();
    }
}
exports.Recorder = Recorder;
exports.default = Recorder;

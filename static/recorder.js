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
exports.AudioRecorder = void 0;
class AudioRecorder {
    constructor(streamSource) {
        this.isRecording = false;
        this.streamSource = streamSource;
    }
    record(durationSec) {
        return __awaiter(this, void 0, void 0, function* () {
            const recording = [
                new Float32Array(durationSec * this.streamSource.context.sampleRate),
                new Float32Array(durationSec * this.streamSource.context.sampleRate)
            ];
            let pointer = 0;
            yield this.streamSource.context.audioWorklet.addModule('static/buffering-processor.worklet.js');
            const worklet = new AudioWorkletNode(this.streamSource.context, 'buffering-processor', {
                numberOfInputs: 1,
                numberOfOutputs: 0,
                processorOptions: {
                    buffer: null
                }
            });
            this.streamSource.connect(worklet);
            worklet.port.onmessage = (event) => {
                var _a, _b, _c;
                if (this.isRecording) {
                    if (pointer + ((_a = event.data.buffer[0]) === null || _a === void 0 ? void 0 : _a.length) > ((_b = recording[0]) === null || _b === void 0 ? void 0 : _b.length)) {
                        this.isRecording = false;
                        return new Promise((resolve) => { resolve(recording); });
                    }
                    recording[0].set(event.data.buffer[0], pointer);
                    recording[1].set(event.data.buffer[1], pointer);
                    pointer += (_c = event.data.buffer[0]) === null || _c === void 0 ? void 0 : _c.length;
                }
            };
            this.isRecording = true;
            return new Promise((resolve) => {
                setTimeout(() => {
                    worklet.disconnect();
                    this.streamSource.disconnect();
                    this.streamSource.mediaStream.getTracks().forEach(track => track.stop());
                    resolve(recording);
                    this.isRecording = false;
                }, durationSec * 1000);
            });
        });
    }
}
exports.AudioRecorder = AudioRecorder;

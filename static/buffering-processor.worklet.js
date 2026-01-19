// import { AudioWorkletProcessor, registerProcessor } from "../src/worklet";

class BufferingProcessor extends AudioWorkletProcessor {
    recording = [];
    buffer = [];
    recordingAimed = true;

    constructor(options) {
        super();
        this.buffer = options.processorOptions.buffer;
        this.recording = [];
        console.log('BufferingProcessor initialized');
    }

    static get parameterDescriptors() {
        return [
            {
                name: 'isRecording',
                defaultValue: 0,
                minValue: 0,
                maxValue: 1,
            },
            {
                name: 'recordingLength',
                defaultValue: 0,
                minValue: 0,
                maxValue: 48000 * 60 * 5, // 5 minutes at 48kHz
            },
        ];
    }

    process(inputs, outputs, parameters) {
        this.buffer = inputs[0];
        if (this.recordingAimed) { 
            this.recording = [...this.recording, ...inputs[0][0]];
            if (this.recording.length >= parameters.recordingLength[0]) {
                this.port.postMessage({ buffer: this.buffer, recording: this.recording });
                this.recording = [];
                this.recordingAimed = false;
            } else {
                this.port.postMessage({ buffer: this.buffer, recording: null });
            }
        }
        return true;
    }
}

registerProcessor('buffering-processor', BufferingProcessor);

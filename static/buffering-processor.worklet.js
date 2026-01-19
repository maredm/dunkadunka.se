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

    process(inputs, outputs, parameters) {
        this.buffer = inputs[0];
        this.port.postMessage({ buffer: this.buffer});
        return true;
    }
}

registerProcessor('buffering-processor', BufferingProcessor);

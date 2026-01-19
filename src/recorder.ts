export class AudioRecorder {
    // Record using buffering processor worklet.
    static async recordWithBufferingProcessor(audioContext: AudioContext, durationSec: number): Promise<Float32Array> {
        await audioContext.audioWorklet.addModule('static/buffering-processor.worklet.js');
        const bufferingNode = new AudioWorkletNode(audioContext, 'buffering-processor', {
            numberOfInputs: 1,
            parameterData: {
                isRecording: 1,
                recordingLength: durationSec * audioContext.sampleRate
            }
        });

        return new Promise<Float32Array>((resolve) => {
            bufferingNode.port.onmessage = (event) => {
                console.debug('Received recording from buffering processor worklet');
                if (event.data.recording) {
                    resolve(Float32Array.from(event.data.recording));
                }
            };
        });
    }

    // Convenience record function that delegates to recordWithBufferingProcessor.
    static async record(audioContext: AudioContext, durationSec: number): Promise<Float32Array> {
        return this.recordWithBufferingProcessor(audioContext, durationSec);
    }
}
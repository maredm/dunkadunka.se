import audio from "./audio";

export class AudioRecorder {
    streamSource: MediaStreamAudioSourceNode;
    isRecording: boolean = false;

    constructor(streamSource: MediaStreamAudioSourceNode) {
        this.streamSource = streamSource;

    }

    async record(durationSec: number): Promise<Float32Array[]> {
        const recording: Float32Array[] = [
            new Float32Array(durationSec * this.streamSource.context.sampleRate),
            new Float32Array(durationSec * this.streamSource.context.sampleRate)
        ];
        let pointer = 0;

        await this.streamSource.context.audioWorklet.addModule('static/buffering-processor.worklet.js');
        const worklet = new AudioWorkletNode(
            this.streamSource.context, 'buffering-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 0,
            processorOptions: {
                buffer: null
            }
        });

        this.streamSource.connect(worklet);

        worklet.port.onmessage = (event) => {
            if (this.isRecording) {
                if (pointer + event.data.buffer[0]?.length > recording[0]?.length) {
                    this.isRecording = false;
                    return new Promise<Float32Array[]>((resolve) => { resolve(recording); });
                }
                recording[0].set(event.data.buffer[0], pointer);
                recording[1].set(event.data.buffer[1], pointer);
                pointer += event.data.buffer[0]?.length;
            }
        };

        this.isRecording = true;
        return new Promise<Float32Array[]>((resolve) => {
            setTimeout(() => {
                worklet.disconnect();
                this.streamSource.disconnect();
                this.streamSource.mediaStream.getTracks().forEach(track => track.stop());
                resolve(recording);
                this.isRecording = false;
            }, durationSec * 1000);
        });

    }
}
import audio from "./audio";

export class AudioRecorder {
    audioContext: AudioContext;

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext;
    }

    async record(durationSec: number): Promise<Float32Array[]> {
        const recording: Float32Array[] = [
            new Float32Array(durationSec * this.audioContext.sampleRate),
            new Float32Array(durationSec * this.audioContext.sampleRate)
        ];
        let pointer = 0;

        await this.audioContext.audioWorklet.addModule('static/buffering-processor.worklet.js');
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: false, 
                noiseSuppression: false, 
                autoGainControl: false 
            } 
        });

        const streamSource = this.audioContext.createMediaStreamSource(stream);
        const worklet = new AudioWorkletNode(
        this.audioContext, 'buffering-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 0,
            processorOptions: {
                buffer: null
            }
        });
        
        streamSource.connect(worklet);

        worklet.port.onmessage = (event) => {
            if (pointer + event.data.buffer[0].length > recording[0].length) 
            {
                worklet.disconnect();
                streamSource.disconnect();
                return new Promise<Float32Array[]>((resolve) => {resolve(recording);});
            }
            recording[0].set(event.data.buffer[0], pointer);
            recording[1].set(event.data.buffer[1], pointer);
            pointer += event.data.buffer[0].length;
        };

        return new Promise<Float32Array[]>((resolve) => {
            setTimeout(() => {
                worklet.disconnect();
                streamSource.disconnect();
                stream.getTracks().forEach(track => track.stop());
                resolve(recording);
            }, durationSec * 1500);
        });
    }
}
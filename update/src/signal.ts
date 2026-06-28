/** Audio processing utility module providing functions for audio signal analysis and manipulation. */

import { fft } from "./fft";

export type FloatArray = number[] | Float32Array | Float64Array;
export type IntegerArray = number[] | Int32Array | Int16Array;
export type NumberArray = FloatArray | IntegerArray;

export type MultichannelFloatArray = FloatArray[];
export type MultichannelIntegerArray = IntegerArray[];
export type MultichannelNumberArray = NumberArray[];

export type StereoBuffer = readonly [Float32Array, Float32Array];

export function toNumberArray(samples: NumberArray): number[] {
    if (samples instanceof Float32Array || samples instanceof Float64Array) {
        return Array.from(samples);
    } else if (samples instanceof Int32Array || samples instanceof Int16Array) {
        return Array.from(samples);
    } else {
        return samples;
    }
}

export function toFloat32Array(samples: NumberArray): Float32Array {
    const output = new Float32Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
        output[index] = samples[index];
    }
    return output;
}

export function numberArrayToStereoBuffer(samples: NumberArray): StereoBuffer {
    const left = toFloat32Array(samples);
    return [left, new Float32Array(left)];
}

export function createSilenceStereo(frameCount: number): StereoBuffer {
    if (frameCount < 0) {
        throw new Error("frameCount must be non-negative");
    }
    return [new Float32Array(frameCount), new Float32Array(frameCount)];
}

export function concatStereoBuffers(chunks: StereoBuffer[]): StereoBuffer {
    const totalFrames = chunks.reduce((sum, chunk) => {
        if (chunk[0].length !== chunk[1].length) {
            throw new Error("stereo chunks must have equal channel lengths");
        }
        return sum + chunk[0].length;
    }, 0);

    const left = new Float32Array(totalFrames);
    const right = new Float32Array(totalFrames);
    let offset = 0;
    for (const chunk of chunks) {
        left.set(chunk[0], offset);
        right.set(chunk[1], offset);
        offset += chunk[0].length;
    }
    return [left, right];
}

export function isFloatArray(arr: NumberArray): arr is FloatArray {
    return arr instanceof Float32Array || arr instanceof Float64Array;
}

export function isIntegerArray(arr: NumberArray): arr is IntegerArray {
    return arr instanceof Int32Array || arr instanceof Int16Array;
}

export function numberOfChannels(arr: MultichannelNumberArray): number {
    return arr.length;
}

export function duration(arr: MultichannelNumberArray): number {
    if (arr.length === 0) {
        return 0;
    }
    // All channels must have the same length, otherwise throw error.
    if (!arr.every(channel => channel.length === arr[0].length)) {
        throw new Error('All channels must have the same length');
    }
    return arr[0].length;
}

export function transpose(arr: MultichannelNumberArray): MultichannelNumberArray {
    if (arr.length === 0) {
        return [];
    }
    const numChannels = arr.length;
    const numSamples = arr[0].length;
    const transposed: MultichannelNumberArray = new Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        transposed[i] = new Array(numChannels);
        for (let j = 0; j < numChannels; j++) {
            transposed[i][j] = arr[j][i];
        }
    }
    return transposed;
}

export function sum(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
    }
    return sum
}

export function rms(buffer: Float32Array): number {
    // Assuming mono channel for simplicity; extend as needed for multi-channel
    return Math.sqrt(sum(buffer) / buffer.length);
}

export function normalize(input: Float32Array, peak: boolean = false): Float32Array {
    const rms_value = rms(input);
    if (rms_value === 0) return input; // avoid division by zero, return original (silence)

    const factor = (1 / rms_value) * (peak ? 1 : Math.SQRT2);

    return input.map(v => v * factor);
}

export function db(value: Float32Array): Float32Array;
export function db(value: number): number;
export function db(value: Float32Array | number): Float32Array | number {
    if (value instanceof Float32Array) {
        return value.map(v => 20 * Math.log10(v + 1e-50));
    } else {
        return 20 * Math.log10(value + 1e-50);
    }
}

export function exponentialMovingAverage(old: number, value: number, alpha: number): number {
    return alpha * value + (1 - alpha) * old;
}

export const smoothingFactor = (timeConstant: number, sampleRate: number): number => {
    return 1 - Math.exp(-1 / (sampleRate * timeConstant));
}

export function dbToLinear(value: Float32Array): Float32Array;
export function dbToLinear(value: number): number;
export function dbToLinear(value: Float32Array | number): Float32Array | number {
    if (value instanceof Float32Array) {
        return value.map(v => Math.pow(10, v / 20));
    } else {
        return Math.pow(10, value / 20);
    }
}

export function getExponentialSmoothingFactor(timeConstant: number, sampleRate: number): number {
    return 1 - Math.exp(-1 / (timeConstant * sampleRate));
}


/** Signal generation functions. */

export function chirp(fStart: number, fStop: number, duration: number | null = null, rate: number | null = null, fade: number = 0.01, fs: number = 48000): [Float32Array, Float32Array, Float32Array] {
    const c = Math.log(fStop / fStart);

    let L: number;
    let samples_count: number;

    if (duration == null && rate == null) {
        // Default to one decade per second if nothing provided
        rate = 1.0;
    }

    if (duration == null) {
        // rate is seconds per decade -> L = rate / ln(10)
        L = (rate as number) / Math.log(10);
        samples_count = Math.round(L * c * fs);
        duration = samples_count / fs;
    } else {
        L = duration / c;
        rate = Math.log(10) * L;
        samples_count = Math.round(L * c * fs);
    }

    samples_count = Math.max(1, samples_count);

    const fade_in = Math.max(0, Math.floor(fade * fs));
    const fade_out = Math.max(0, Math.floor((fade / 10) * fs));

    // instantaneous phase
    // phi = (L * f_start) * (exp(t/L) - 1)
    // compact phi: pre-fade (fade_in samples), main sweep, post-fade (fade_out samples)
    const pre = Math.max(0, fade_in);
    const post = Math.max(0, fade_out);
    const phi = Float32Array.from({ length: pre + samples_count + post }, () => 0);

    // offset matches original phi_fade_in last value: f_start * ((fade_in+1)/fs)
    const offset = fStart * ((fade_in + 1) / fs);

    // pre-fade linear ramp
    for (let i = 0; i < pre; i++) phi[i] = fStart * (i / fs);

    // main sweep (adds offset)
    const baseIdx = pre;
    for (let i = 0; i < samples_count; i++) {
        let t = i / fs;
        phi[baseIdx + i] = L * fStart * (Math.exp(t / L) - 1) + offset;
    }

    // post-fade linear ramp starting from last sweep value
    const last = phi[baseIdx + samples_count - 1] || 0;
    for (let i = 0; i < post; i++) {
        phi[baseIdx + samples_count + i] = last + fStop * ((i + 1) / fs);
    }

    // sweep = sin(2 * PI * phi)
    const sweep = Float32Array.from({ length: phi.length }, () => 0);
    for (let i = 0; i < phi.length; i++) sweep[i] = Math.sin(2 * Math.PI * phi[i]);

    // compute time vector t for sweep length
    const t = Float32Array.from({ length: sweep.length }, () => 0);
    for (let i = 0; i < sweep.length; i++) t[i] = i / fs;

    // envelope main: (exp(-t/L) / L) * f_stop * duration^2
    const envMain = Float32Array.from({ length: t.length }, () => 0);
    const factor = fStop * (duration as number) * (duration as number);
    for (let i = 0; i < t.length; i++) envMain[i] = (Math.exp(-t[i] / L) / L) * factor;

    // prepend and append small zero pads (approx. 10ms and 1ms at given fs)
    const startZeros = Math.floor(0.01 * fs); // ~480 samples at 48k
    const endZeros = Math.floor(0.001 * fs);  // ~48 samples at 48k
    const envelope = Float32Array.from({ length: startZeros + envMain.length + endZeros }, () => 0);
    // copy envMain into middle
    for (let i = 0; i < envMain.length; i++) {
        envelope[startZeros + i] = envMain[i];
    }

    // window: simple linear fade in/out over fade_in / fade_out samples
    const window = Float32Array.from({ length: sweep.length }, () => 0);
    for (let i = 0; i < sweep.length; i++) {
        let w = 1.0;
        if (fade_in > 0 && i < fade_in) {
            w = i / Math.max(1, fade_in);
        }
        if (fade_out > 0 && i >= sweep.length - fade_out) {
            const k = i - (sweep.length - fade_out);
            w *= 1 - (k / Math.max(1, fade_out));
        }
        window[i] = w;
    }

    // apply window to sweep
    const sweepWindowed = Float32Array.from({ length: sweep.length }, () => 0);
    for (let i = 0; i < sweep.length; i++) sweepWindowed[i] = sweep[i] * window[i];

    return [sweepWindowed, t, envelope];
}

export function normalizeToRMS(samples: Float32Array, targetRMS: number = 0.1): Float32Array {
    const currentRMS = rms(samples);
    if (currentRMS === 0) return samples; // avoid division by zero, return original (silence)

    const factor = targetRMS / currentRMS;
    return samples.map(v => v * factor);
}

export function calculateTwoChannelImpulseResponse(recorded: NumberArray, stimulus: NumberArray): NumberArray {
    // Convert to frequency domain
    const [recordedReal, recordedImag] = fft(toNumberArray(recorded));
    const [stimulusReal, stimulusImag] = fft(toNumberArray(stimulus));

    // Calculate the frequency response H(f) = Y(f) / X(f)
    const HReal: Float32Array = new Float32Array(recordedReal.length);
    const HImag: Float32Array = new Float32Array(recordedImag.length);

    for (let i = 0; i < recordedReal.length; i++) {
        const denom = stimulusReal[i] * stimulusReal[i] + stimulusImag[i] * stimulusImag[i];
        if (denom === 0) {
            HReal[i] = 0;
            HImag[i] = 0;
        } else {
            HReal[i] = (recordedReal[i] * stimulusReal[i] + recordedImag[i] * stimulusImag[i]) / denom;
            HImag[i] = (recordedImag[i] * stimulusReal[i] - recordedReal[i] * stimulusImag[i]) / denom;
        }
    }

    // Convert back to time domain and limit to the length of the recorded signal.
    const [impulseResponseReal, impulseResponseImag] = fft(toNumberArray(HReal), true);

    const size = recorded.length;

    // Rotate the impulse response to align with the recorded signal's length.
    const rotatedImpulseResponse = new Float32Array(recorded.length);
    for (let i = 0; i < recorded.length; i++) {
        rotatedImpulseResponse[i] = impulseResponseReal[(i + Math.floor(size / 2)) % size];
    }

    return rotatedImpulseResponse.map(v => v * 2); // Normalize by the size of the FFT
}

/** Estimate the delay between two signals using GCC-Phat
 * 
 * @param signal1 - The first signal (reference)
 * @param signal2 - The second signal (delayed version of the first)
 * @param sampleRate - The sample rate of the signals
 * @returns The estimated delay in seconds
*/
export function estimateDelay(signal1: Float32Array, signal2: Float32Array, sampleRate: number): number {
    const n = signal1.length + signal2.length - 1;
    const size = Math.pow(2, Math.ceil(Math.log2(n)));

    // Zero-pad both signals to the same length
    const paddedSignal1 = new Float32Array(size);
    const paddedSignal2 = new Float32Array(size);
    paddedSignal1.set(signal1);
    paddedSignal2.set(signal2);

    // Compute FFT of both signals
    const [fft1Real, fft1Imag] = fft(toNumberArray(paddedSignal1));
    const [fft2Real, fft2Imag] = fft(toNumberArray(paddedSignal2));

    // Compute cross-power spectrum
    const crossPowerReal = new Float32Array(size);
    const crossPowerImag = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        crossPowerReal[i] = fft1Real[i] * fft2Real[i] + fft1Imag[i] * fft2Imag[i];
        crossPowerImag[i] = fft1Imag[i] * fft2Real[i] - fft1Real[i] * fft2Imag[i];
    }

    // Normalize the cross-power spectrum (PHAT)
    const magnitude = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        magnitude[i] = Math.sqrt(crossPowerReal[i] ** 2 + crossPowerImag[i] ** 2);
        if (magnitude[i] > 0) {
            crossPowerReal[i] /= magnitude[i];
            crossPowerImag[i] /= magnitude[i];
        }
    }

    // Compute inverse FFT to get the cross-correlation
    const [crossCorrReal, _] = fft(toNumberArray(crossPowerReal), true);

    // Find the index of the maximum value in the cross-correlation
    let maxIndex = 0;
    let maxValue = crossCorrReal[0];
    for (let i = 1; i < crossCorrReal.length; i++) {
        if (crossCorrReal[i] > maxValue) {
            maxValue = crossCorrReal[i];
            maxIndex = i;
        }
    }

    // Calculate the delay in seconds
    const delaySamples = maxIndex < size / 2 ? maxIndex : maxIndex - size;

    return delaySamples / sampleRate;
}
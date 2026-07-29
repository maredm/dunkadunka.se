/** Audio processing utility module providing functions for audio signal analysis and manipulation. */

import { rms } from "../math";
import type { ComplexFloat32Array, FloatArray, IntegerArray, NumberArray } from "../math";
import { fft, nextPow2 } from "./fft";

export type { FloatArray, IntegerArray, NumberArray, ComplexNumberArray } from "../math";

export type MultichannelFloatArray = FloatArray[];
export type MultichannelIntegerArray = IntegerArray[];
export type MultichannelNumberArray = NumberArray[];
export type MultichannelBuffer = readonly Float32Array[];

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

export const A_WEIGHTING_COEFFICIENTS: [Float32Array, Float32Array] = [
    Float32Array.from([0.234301792299513, -0.468603584599026, -0.234301792299513, 0.937207169198054, -0.234301792299515, -0.468603584599025, 0.234301792299513]),
    Float32Array.from([1.000000000000000, -4.113043408775871, 6.553121752655047, -4.990849294163381, 1.785737302937573, -0.246190595319487, 0.011224250033231]),
];

export const K_WEIGHTING_COEFFICIENTS_PRE: [Float32Array, Float32Array] = [
    Float32Array.from([1.53512485958697, -2.69169618940638, 1.19839281085285]),
    Float32Array.from([1, -1.69065929318241, 0.73248077421585]),
];

export const K_WEIGHTING_COEFFICIENTS_RLB: [Float32Array, Float32Array] = [
    Float32Array.from([1.0, -2.0, 1.0]),
    Float32Array.from([1, -1.99004745483398, 0.99007225036621]),
];

function applyIIRFilter(
    buffer: Float32Array,
    coefficients: [Float32Array, Float32Array],
    zi: Float32Array,
): Float32Array {
    const [b, a] = coefficients;
    if (zi.length < b.length) {
        throw new Error(`IIR state must have length at least ${b.length}`);
    }

    const output = new Float32Array(buffer.length);
    for (let n = 0; n < buffer.length; n += 1) {
        output[n] = (b[0] * (buffer[n] ?? 0)) + zi[0];
        for (let i = 1; i < b.length; i += 1) {
            zi[i - 1] = (b[i] * (buffer[n] ?? 0)) + zi[i] - (a[i] * output[n]);
        }
    }

    return output;
}

export function applyAWeightingToBuffer(buffer: Float32Array, zi: Float32Array): Float32Array {
    return applyIIRFilter(buffer, A_WEIGHTING_COEFFICIENTS, zi);
}

export function applyAWeighting(buffer: Float32Array, zi: Float32Array = new Float32Array(A_WEIGHTING_COEFFICIENTS[0].length)): Float32Array {
    const b = A_WEIGHTING_COEFFICIENTS[0];
    if (zi.length < b.length) {
        throw new Error(`A-weighting state must have length at least ${b.length}`);
    }

    return applyAWeightingToBuffer(buffer, zi);
}


/** Signal generation functions. */

export function normalizeToRMS(samples: Float32Array, targetRMS: number = 0.1): Float32Array {
    const currentRMS = rms(samples);
    if (currentRMS === 0) return samples; // avoid division by zero, return original (silence)

    const factor = targetRMS / currentRMS;
    return samples.map(v => v * factor);
}


export function calculateTwoChannelImpulseResponse(recorded: NumberArray, stimulus: NumberArray): NumberArray {
    // Convert to frequency domain
    const { real: recordedReal, imag: recordedImag } = fft(toNumberArray(recorded));
    const { real: stimulusReal, imag: stimulusImag } = fft(toNumberArray(stimulus));

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
    const { real: impulseResponseReal, imag: impulseResponseImag } = fft(toNumberArray(HReal), true);

    const size = recorded.length;

    // Rotate the impulse response to align with the recorded signal's length.
    const rotatedImpulseResponse = new Float32Array(recorded.length);
    for (let i = 0; i < recorded.length; i++) {
        rotatedImpulseResponse[i] = impulseResponseReal[(i + Math.floor(size / 2)) % size];
    }

    return rotatedImpulseResponse.map(v => v * 2); // Normalize by the size of the FFT
}

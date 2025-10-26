import { abs } from './math.js';
import { FFT } from './fft.js'
window.FFT = FFT; // Make FFT globally available
export function rms(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
}

export function exponentialMovingAverage(old, value, alpha) {
    return alpha * value + (1 - alpha) * old;
}

export function db(value) {
    return value > 0 ? 20 * Math.log10(value) : -Infinity;
}

export const smoothingFactor = (timeConstant, sampleRate) => {
    return 1 - Math.exp(-1 / (sampleRate * timeConstant));
}

export function dbToLinear(db) {
    return Math.pow(10, db / 20);
}

export function getExponentialSmoothingFactor(timeConstant, sampleRate) {
    return 1 - Math.exp(-1 / (timeConstant * sampleRate));
}

export function linearToDb(linear) {
    return linear > 0 ? 20 * Math.log10(linear) : -Infinity;
}

export function computeFFT(buffer) {
    if (window.FFT) {
        const N = buffer.length;
        const fft = new FFT(N);
        const input = Array.from(buffer);
        const out = fft.createComplexArray();
        fft.realTransform(out, input);
        const mags = [];
        for (let i = 0; i < N / 2; i++) {
            const re = out[2 * i];
            const im = out[2 * i + 1];
            mags[i] = abs(re, im) * 1.41421356237; // Normalize by sqrt(2) for RMS
        }
        return mags;
    } else {
        return buffer;
    }
}


export const A_WEIGHTING_COEFFICIENTS = [
    [0.234301792299513, -0.468603584599026, -0.234301792299513, 0.937207169198054, -0.234301792299515, -0.468603584599025, 0.234301792299513],
    [1.000000000000000, -4.113043408775871, 6.553121752655047, -4.990849294163381, 1.785737302937573, -0.246190595319487, 0.011224250033231],
];
// Coefficients for K-weighting filter (pre-emphasis and high-frequency shelving)
// From ITU-R BS.1770-4, Table 1
// https://www.itu.int/dms_pubrec/itu-r/rec/bs/r-rec-bs.1770-2-201103-s!!pdf-e.pdf
export const K_WEIGHTING_COEFFICIENTS_PRE = [
    [1.53512485958697, -2.69169618940638, 1.19839281085285],
    [1, -1.69065929318241, 0.73248077421585]
];

export const K_WEIGHTING_COEFFICIENTS_RLB = [
    [1.0, -2.0, 1.0],
    [1, -1.99004745483398, 0.99007225036621]
];


export function applyAWeightingToBuffer(buffer, zi) {
    const b = A_WEIGHTING_COEFFICIENTS[0];
    const a = A_WEIGHTING_COEFFICIENTS[1];
    const output = new Float32Array(buffer.length);
    for (let n = 0; n < buffer.length; n++) {
        output[n] = b[0] * buffer[n] + zi[0];
        for (let i = 1; i < b.length; i++) {
            zi[i - 1] = b[i] * buffer[n] + zi[i] - a[i] * output[n];
        }
    }
    return output;
}

export function gateBuffer(buffer, sampleRate, thresholdDb = -70, blockMs = 400, overlap = 0.75) {
    const blockSize = Math.floor((blockMs / 1000) * sampleRate);
    const hopSize = Math.floor(blockSize * (1 - overlap));
    const threshold = dbToLinear(thresholdDb);

    const gated = new Float32Array(buffer.length);
    let i = 0;

    while (i < buffer.length) {
        const start = i;
        const end = Math.min(i + blockSize, buffer.length);
        const block = buffer.subarray(start, end);
        const blockRms = rms(block);

        if (blockRms >= threshold) {
            gated.set(block, start);
        }
        // else: leave zeros (gate closed)

        i += hopSize;
    }

    return gated;
}

/**
 * Calculate ITU-R BS.1770-4 loudness (LKFS/LUFS) for a mono or stereo buffer.
 * https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-5-202311-I!!PDF-E.pdf
 * @param {Float32Array|Array<Float32Array>} input - Mono buffer or array of channel buffers.
 * @param {number} sampleRate - Sample rate in Hz.
 * @returns {number} Integrated loudness in LUFS.
 */
export function bs1770Loudness(input, sampleRate) {
    // K-weighting filter coefficients (biquad, 2nd order)
    // From ITU-R BS.1770-4, Table 1
    const b = [1.53512485958697, -2.69169618940638, 1.19839281085285];
    const a = [1, -1.69065929318241, 0.73248077421585];

    // Helper: apply biquad filter to a buffer
    function biquadFilter(buffer, b, a) {
        const out = new Float32Array(buffer.length);
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let n = 0; n < buffer.length; n++) {
            const x0 = buffer[n];
            const y0 = b[0]*x0 + b[1]*x1 + b[2]*x2 - a[1]*y1 - a[2]*y2;
            out[n] = y0;
            x2 = x1; x1 = x0;
            y2 = y1; y1 = y0;
        }
        return out;
    }

    // Accept mono or stereo
    let channels;
    if (Array.isArray(input)) {
        channels = input;
    } else {
        channels = [input];
    }

    // Apply K-weighting filter to each channel
    const filtered = channels.map(ch => biquadFilter(ch, b, a));

    // Gating parameters
    const windowMs = 400;
    const windowSize = Math.floor(windowMs * sampleRate / 1000);
    const overlap = 0.75;
    const hopSize = Math.floor(windowSize * (1 - overlap));
    const absoluteGate = dbToLinear(-70);
    const relativeGateOffset = -10; // dB

    // Calculate channel weights (ITU: [1, 1] for stereo)
    const weights = channels.length === 2 ? [1, 1] : [1];

    // Calculate block energies
    let energies = [];
    for (let i = 0; i + windowSize <= filtered[0].length; i += hopSize) {
        let sum = 0;
        for (let ch = 0; ch < filtered.length; ch++) {
            const block = filtered[ch].subarray(i, i + windowSize);
            const blockSum = block.reduce((acc, v) => acc + v*v, 0);
            sum += weights[ch] * blockSum;
        }
        const energy = sum / (windowSize * weights.reduce((a, b) => a + b, 0));
        energies.push(energy);
    }

    // Absolute gating
    const gatedEnergies = energies.filter(e => e >= absoluteGate);

    if (gatedEnergies.length === 0) return -Infinity;

    // Relative gating
    const meanEnergy = gatedEnergies.reduce((a, b) => a + b, 0) / gatedEnergies.length;
    const relativeGate = meanEnergy * dbToLinear(relativeGateOffset);
    const finalEnergies = gatedEnergies.filter(e => e >= relativeGate);

    if (finalEnergies.length === 0) return -Infinity;

    // Integrated loudness (LUFS)
    const integrated = finalEnergies.reduce((a, b) => a + b, 0) / finalEnergies.length;
    return linearToDb(Math.sqrt(integrated));
}


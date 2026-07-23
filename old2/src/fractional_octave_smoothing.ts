import { average, closest, logspace, linspace } from './math';

console.debug("Fractional Octave Smoothing module loaded");

export function getFractionalOctaveFrequencies(fraction: number, f_low: number = 20, f_high: number = 24000, fftSize: number): Float32Array {
    if (fraction <= 0) {
        throw new Error("Fraction must be greater than 0");
    }
    if (f_low <= 0 || f_high <= 0) {
        throw new Error("Frequencies must be greater than 0");
    }
    if (f_low >= f_high) {
        throw new Error("f_low must be less than f_high");
    }
    const num_points = Math.round((Math.log10(f_high) - Math.log10(f_low)) / fraction) + 1;

    let frequencies = logspace(f_low, f_high, num_points);

    const frequency_resolution = 48000 / fftSize; // Assuming a sample rate of 48000 Hz

    for (let i = 0; i < frequencies.length; i++) {
        frequencies[i] = Math.round(frequencies[i] / frequency_resolution) * frequency_resolution;
    }
    frequencies = Float32Array.from(new Set(frequencies)); // Remove duplicates

    return frequencies;
}

export function fractionalOctaveSmoothing(frequencyData: Float32Array, fraction: number, frequencies: Float32Array): Float32Array{
    const FD = frequencyData;
    const F = frequencies;
    const n = FD.length | 0;
    const out = new Float32Array(F.length);
    if (n === 0 || F.length === 0) return out;

    const nMinus1 = n - 1;
    const half = n * 0.5;
    const fac = Math.pow(2, 0.5 * fraction) - Math.pow(2, -0.5 * fraction);
    const invBin = n > 1 ? (nMinus1) / 24000 : 0;

    // prefix sum (double precision for accumulation)
    const pref = new Float64Array(n + 1);
    for (let k = 0; k < n; ++k) pref[k + 1] = pref[k] + FD[k];

    for (let p = 0, P = F.length; p < P; ++p) {
        // map center frequency to nearest bin index
        const fp = F[p];
        let i = invBin ? ((fp * invBin) + 0.5) | 0 : 0;
        if (i < 0) i = 0;
        else if (i > nMinus1) i = nMinus1;

        // compute window half-width in bins (integer)
        const dist = Math.abs(half - i);
        let w = ((0.5 * fac * (half - dist)) + 0.5) | 0;

        if (w <= 0) {
            out[p] = FD[i];
            continue;
        }

        // inclusive start/end indices
        let s = i - w + 1;
        if (s < 0) s = 0;
        let e = i + w;
        if (e > nMinus1) e = nMinus1;

        const len = e - s + 1;
        if (len <= 0) {
            out[p] = FD[i];
        } else {
            const sum = pref[e + 1] - pref[s];
            out[p] = sum / len;
        }
    }
    return out;
}

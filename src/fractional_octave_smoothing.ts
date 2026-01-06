import { average, closest, logspace, linspace } from './math';

console.debug("Fractional Octave Smoothing module loaded");

export function getFractionalOctaveFrequencies(fraction: number, f_low: number = 20, f_high: number = 24000, fftSize: number): number[] {
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
    frequencies = Array.from(new Set(frequencies)); // Remove duplicates

    return frequencies;
}

export function fractionalOctaveSmoothing(frequencyData: number[], fraction: number, frequencies: number[]): Float32Array {
    const frequenciesAll = linspace(0, 48000 / 2, frequencyData.length);
    const frequency_resolution = 48000 / frequencyData.length;
    const smoothedData = new Float32Array(frequencies.length);
    const n = frequencyData.length;
    const factor = Math.pow(2, (0.5 * fraction)) - Math.pow(0.5, (0.5 * fraction));
    for (let p = 0; p < frequencies.length; p++) {
        const i = closest(frequencies[p], frequenciesAll);
        // If the distance between this and previous frequency is less than frequency_resolution, pass direct value

        let sum = 0;
        const width = Math.round(0.5 * factor * (n * 0.5 - Math.abs(n * 0.5 - i)));
        if (width === 0) {
            sum = frequencyData[i];
        } else {
            const as = frequencyData.slice(Math.round(i - width + 1), Math.min(Math.round(i + width), n - 1));
            sum = average(as);
        }
        smoothedData[p] = sum;
    }
    return smoothedData;
}
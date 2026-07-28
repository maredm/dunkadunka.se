import { fft } from "./fft";
import { toNumberArray } from "./signal";

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
    const { real: fft1Real, imag: fft1Imag } = fft(toNumberArray(paddedSignal1));
    const { real: fft2Real, imag: fft2Imag } = fft(toNumberArray(paddedSignal2));

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
    const { real: crossCorrReal, imag: _ } = fft(toNumberArray(crossPowerReal), true);

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
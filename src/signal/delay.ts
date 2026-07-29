import { fft } from "./fft";
import { toNumberArray } from "./signal";
import { crossCorrelation } from "./spectrum";  

/** Estimate the delay between two signals using GCC-Phat
 * 
 * @param x - The source signal of the system.
 * @param y - The delayed signal of the system.
 * @param sampleRate - The sample rate of the signals
 * @returns The estimated delay in seconds
*/
export function estimateDelay(source: Float32Array, delayed: Float32Array, sampleRate: number): number {
    const normalizedCrossCorrelation = crossCorrelation(source, delayed, true);

    // Find the index of the maximum value in the cross-correlation
    let maxIndex = 0;
    let maxValue = normalizedCrossCorrelation[0];
    for (let i = 1; i < normalizedCrossCorrelation.length; i++) {
        if (normalizedCrossCorrelation[i] > maxValue) {
            maxValue = normalizedCrossCorrelation[i];
            maxIndex = i;
        }
    }

    // Calculate the delay in seconds
    const delaySamples = maxIndex < normalizedCrossCorrelation.length / 2 ? maxIndex : maxIndex - normalizedCrossCorrelation.length;

    return delaySamples / sampleRate;
}
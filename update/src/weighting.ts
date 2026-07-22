import { fft } from "./fft";
import { nextPow2 } from "./math";

export type FrequencyWeighting = "z" | "a" | "c";

const A_WEIGHTING_REFERENCE_DB = 1.9997;
const C_WEIGHTING_REFERENCE_DB = 0.0619;
const F1 = 20.598997;
const F2 = 107.65265;
const F3 = 737.86223;
const F4 = 12194.217;

export function getFrequencyWeightingGainDb(weighting: FrequencyWeighting, frequencyHz: number): number {
	if (weighting === "z") {
		return 0;
	}
	if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
		return Number.NEGATIVE_INFINITY;
	}

	const frequencySquared = frequencyHz * frequencyHz;
	const f1Squared = F1 * F1;
	const f2Squared = F2 * F2;
	const f3Squared = F3 * F3;
	const f4Squared = F4 * F4;

	if (weighting === "a") {
		const numerator = f4Squared * frequencySquared * frequencySquared;
		const denominator = (frequencySquared + f1Squared)
			* Math.sqrt((frequencySquared + f2Squared) * (frequencySquared + f3Squared))
			* (frequencySquared + f4Squared);
		return 20 * Math.log10(Math.max(numerator / Math.max(denominator, 1e-30), 1e-30)) + A_WEIGHTING_REFERENCE_DB;
	}

	const numerator = f4Squared * frequencySquared;
	const denominator = (frequencySquared + f1Squared) * (frequencySquared + f4Squared);
	return 20 * Math.log10(Math.max(numerator / Math.max(denominator, 1e-30), 1e-30)) + C_WEIGHTING_REFERENCE_DB;
}

export function getFrequencyWeightingGain(weighting: FrequencyWeighting, frequencyHz: number): number {
	const gainDb = getFrequencyWeightingGainDb(weighting, frequencyHz);
	if (!Number.isFinite(gainDb)) {
		return 0;
	}
	return 10 ** (gainDb / 20);
}

export function computeWeightedMeanSquare(samples: Float32Array, sampleRate: number, weighting: FrequencyWeighting): number {
	if (samples.length === 0) {
		return 0;
	}
	if (weighting === "z") {
		let sumSquares = 0;
		for (let index = 0; index < samples.length; index += 1) {
			const value = samples[index] ?? 0;
			sumSquares += value * value;
		}
		return sumSquares / samples.length;
	}

	const fftSize = nextPow2(samples.length);
	const padded = new Array<number>(fftSize).fill(0);
	for (let index = 0; index < samples.length; index += 1) {
		padded[index] = samples[index] ?? 0;
	}

	const [real, imag] = fft(padded);
	let weightedEnergy = 0;
	const half = fftSize / 2;
	for (let binIndex = 0; binIndex <= half; binIndex += 1) {
		const re = real[binIndex] ?? 0;
		const im = imag[binIndex] ?? 0;
		const magnitudeSquared = (re * re) + (im * im);
		const isMirroredBin = binIndex !== 0 && binIndex !== half;
		const symmetryFactor = isMirroredBin ? 2 : 1;
		const frequency = (binIndex * sampleRate) / fftSize;
		const gain = getFrequencyWeightingGain(weighting, frequency);
		weightedEnergy += symmetryFactor * magnitudeSquared * gain * gain;
	}

	return weightedEnergy / (fftSize * samples.length);
}
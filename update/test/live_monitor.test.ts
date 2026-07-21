import { expect, test } from "bun:test";

import {
	applyExponentialAverage,
	applyFrequencyWeightingToWaveform,
	buildSmoothedSpectrum,
	computeExponentialAverageAlpha,
	computeWaveformDecibels,
	computeWeightedWaveformDecibels,
} from "../src/live_monitor";
import { A_WEIGHTING_COEFFICIENTS, applyAWeightingToBuffer } from "../src/signal";

test("computeWaveformDecibels returns 0 dBFS for unity sine RMS scaled to full scale square", () => {
	const samples = new Float32Array([1, -1, 1, -1]);
	expect(computeWaveformDecibels(samples)).toBeCloseTo(0, 6);
});

test("computeExponentialAverageAlpha reaches unity when averaging constant is non-positive", () => {
	expect(computeExponentialAverageAlpha(0.1, 0)).toBe(1);
});

test("applyExponentialAverage blends current and previous values", () => {
	const output = applyExponentialAverage(new Float32Array([0, 10]), new Float32Array([10, 20]), 0.25);
	expect(Array.from(output)).toEqual([2.5, 12.5]);
});

test("buildSmoothedSpectrum returns logarithmic points in range", () => {
	const samples = new Float32Array(Array.from({ length: 2048 }, (_, index) => Math.sin((2 * Math.PI * 1000 * index) / 48000)));
	const spectrum = buildSmoothedSpectrum(samples, 48000, 1 / 6);

	expect(spectrum.frequencies.length).toBeGreaterThan(10);
	expect(spectrum.frequencies[0]).toBeGreaterThanOrEqual(20);
	expect(spectrum.frequencies[spectrum.frequencies.length - 1]).toBeLessThanOrEqual(24000);
	expect(spectrum.valuesDb.length).toBe(spectrum.frequencies.length);
	const maxDb = Math.max(...spectrum.valuesDb);
	expect(Number.isFinite(maxDb)).toBe(true);
});

test("signal A-weighting helper uses the expected filter state size", () => {
	const state = new Float32Array(A_WEIGHTING_COEFFICIENTS[0].length);
	const filtered = applyAWeightingToBuffer(new Float32Array([1, 0, 0, 0]), state);

	expect(filtered.length).toBe(4);
	expect(state.length).toBe(A_WEIGHTING_COEFFICIENTS[0].length);
	expect(Array.from(filtered).some((value) => value !== 0)).toBe(true);
});

test("A-weighted live level is lower than Z-weighted level for low frequency content", () => {
	const samples = new Float32Array(Array.from({ length: 2048 }, (_, index) => Math.sin((2 * Math.PI * 100 * index) / 48000)));
	const zLevel = computeWeightedWaveformDecibels(samples, "z");
	const aLevel = computeWeightedWaveformDecibels(samples, "a");

	expect(aLevel).toBeLessThan(zLevel - 5);
});

test("A-weighted live level stays stable for repeated overlapping windows", () => {
	const samples = new Float32Array(Array.from({ length: 2048 }, (_, index) => Math.sin((2 * Math.PI * 1000 * index) / 48000)));
	const first = computeWeightedWaveformDecibels(samples, "a");
	const second = computeWeightedWaveformDecibels(samples, "a");

	expect(second).toBeCloseTo(first, 6);
});

test("A-weighting state carries forward across split buffers", () => {
	const samples = new Float32Array(Array.from({ length: 4096 }, (_, index) => Math.sin((2 * Math.PI * 1000 * index) / 48000)));
	const fullState = new Float32Array(A_WEIGHTING_COEFFICIENTS[0].length);
	const full = applyAWeightingToBuffer(samples, fullState);

	const splitState = new Float32Array(A_WEIGHTING_COEFFICIENTS[0].length);
	const firstHalf = applyAWeightingToBuffer(samples.subarray(0, 2048), splitState);
	const secondHalf = applyAWeightingToBuffer(samples.subarray(2048), splitState);
	const joined = new Float32Array(samples.length);
	joined.set(firstHalf, 0);
	joined.set(secondHalf, firstHalf.length);

	for (let index = 0; index < joined.length; index += 1) {
		expect(joined[index]).toBeCloseTo(full[index], 5);
	}
});

test("live spectrum remains unweighted when SPL weighting changes", () => {
	const samples = new Float32Array(Array.from({ length: 4096 }, (_, index) => Math.sin((2 * Math.PI * 100 * index) / 48000)));
	const zSpectrum = buildSmoothedSpectrum(samples, 48000, 1 / 6);
	const weightedWaveformSpectrum = buildSmoothedSpectrum(applyFrequencyWeightingToWaveform(samples, "a"), 48000, 1 / 6);
	const unweightedSpectrum = buildSmoothedSpectrum(samples, 48000, 1 / 6);
	const bandIndex = zSpectrum.frequencies.findIndex((value) => value >= 100);

	expect(bandIndex).toBeGreaterThanOrEqual(0);
	expect(weightedWaveformSpectrum.valuesDb[bandIndex]).toBeLessThan(zSpectrum.valuesDb[bandIndex] - 5);
	expect(unweightedSpectrum.valuesDb[bandIndex]).toBeCloseTo(zSpectrum.valuesDb[bandIndex], 6);
});
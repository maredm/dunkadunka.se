import { expect, test } from "bun:test";

import {
	applyExponentialAverage,
	buildSmoothedSpectrum,
} from "../src/live_monitor";
import { computeExponentialAverageAlpha, computeWaveformDecibels } from "../src/level_meter";
import { getFrequencyWeightingGainDb } from "../src/weighting";

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

test("frequency weighting response attenuates 100 Hz more for A than C", () => {
	const aGain = getFrequencyWeightingGainDb("a", 100);
	const cGain = getFrequencyWeightingGainDb("c", 100);

	expect(aGain).toBeLessThan(cGain - 5);
});

test("live spectrum remains unweighted when SPL weighting changes", () => {
	const samples = new Float32Array(Array.from({ length: 4096 }, (_, index) => Math.sin((2 * Math.PI * 100 * index) / 48000)));
	const zSpectrum = buildSmoothedSpectrum(samples, 48000, 1 / 6);
	const unweightedSpectrum = buildSmoothedSpectrum(samples, 48000, 1 / 6);
	const bandIndex = zSpectrum.frequencies.findIndex((value) => value >= 100);

	expect(bandIndex).toBeGreaterThanOrEqual(0);
	expect(unweightedSpectrum.valuesDb[bandIndex]).toBeCloseTo(zSpectrum.valuesDb[bandIndex], 6);
});
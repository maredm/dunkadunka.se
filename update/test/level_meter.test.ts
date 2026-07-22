import { expect, test } from "bun:test";

import {
	computeWeightedWaveformDecibels,
	createLevelMeterState,
	parseLevelMetric,
	updateLevelMeter,
} from "../src/level_meter";

test("parseLevelMetric falls back to LAeq for unknown values", () => {
	expect(parseLevelMetric("unknown")).toBe("laeq");
});

test("A-weighted level is lower than Z-weighted level for low frequency content", () => {
	const samples = new Float32Array(Array.from({ length: 4096 }, (_, index) => Math.sin((2 * Math.PI * 100 * index) / 48000)));
	const zLevel = computeWeightedWaveformDecibels(samples, "z", 48000);
	const aLevel = computeWeightedWaveformDecibels(samples, "a", 48000);

	expect(aLevel).toBeLessThan(zLevel - 5);
});

test("C-weighted level attenuates low frequency content less than A-weighting", () => {
	const samples = new Float32Array(Array.from({ length: 4096 }, (_, index) => Math.sin((2 * Math.PI * 100 * index) / 48000)));
	const aLevel = computeWeightedWaveformDecibels(samples, "a", 48000);
	const cLevel = computeWeightedWaveformDecibels(samples, "c", 48000);

	expect(cLevel).toBeGreaterThan(aLevel + 5);
});

test("LAeq accumulation matches one-shot equivalent level for split buffers", () => {
	const samples = new Float32Array(Array.from({ length: 4096 }, (_, index) => 0.5 * Math.sin((2 * Math.PI * 1000 * index) / 48000)));
	const fullLevel = computeWeightedWaveformDecibels(samples, "a", 48000);
	const meter = createLevelMeterState("laeq", 48000);
	updateLevelMeter(meter, samples.subarray(0, 2048), 48000);
	const splitLevel = updateLevelMeter(meter, samples.subarray(2048), 48000);

	expect(splitLevel).toBeCloseTo(fullLevel, 1);
});

test("LCmax holds the highest observed C-weighted level", () => {
	const loud = new Float32Array(Array.from({ length: 2048 }, (_, index) => 0.8 * Math.sin((2 * Math.PI * 1000 * index) / 48000)));
	const quiet = new Float32Array(Array.from({ length: 2048 }, (_, index) => 0.2 * Math.sin((2 * Math.PI * 1000 * index) / 48000)));
	const meter = createLevelMeterState("lcmax", 48000);
	const first = updateLevelMeter(meter, loud, 48000);
	const second = updateLevelMeter(meter, quiet, 48000);

	expect(second).toBeCloseTo(first, 6);
});
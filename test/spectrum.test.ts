import { expect, test } from "bun:test";
import { computeCoherenceResponse } from "../src/signal/spectrum";

test("computeCoherenceResponse returns a bounded frequency series", () => {
	const x = new Float32Array([0, 1, 0, -1]);
	const y = new Float32Array([0, 1, 0, -1]);
	const response = computeCoherenceResponse(x, y, 48000);

	expect(response).not.toBeNull();
	if (!response) {
		throw new Error("expected coherence response");
	}
	expect(response.frequencies.length).toBeGreaterThan(0);
	expect(response.values.length).toBe(response.frequencies.length);
	for (const value of response.values) {
		expect(value).toBeGreaterThanOrEqual(0);
		expect(value).toBeLessThanOrEqual(1);
	}
});

test("computeCoherenceResponse falls below one for unrelated tones", () => {
	const sampleRate = 48000;
	const length = 1024;
	const x = Float32Array.from({ length }, (_, index) => Math.sin(2 * Math.PI * 10 * index / sampleRate));
	const y = Float32Array.from({ length }, (_, index) => Math.sin(2 * Math.PI * 20 * index / sampleRate));
	const response = computeCoherenceResponse(x, y, sampleRate);

	expect(response).not.toBeNull();
	if (!response) {
		throw new Error("expected coherence response");
	}
	const maxValue = Math.max(...Array.from(response.values));
	expect(maxValue).toBeLessThan(0.5);
});

import { expect, test } from "bun:test";

import { fft } from "../src/fft";

function expectArrayClose(actual: number[], expected: number[], precision = 10): void {
	expect(actual.length).toBe(expected.length);
	for (let index = 0; index < expected.length; index += 1) {
		expect(actual[index]).toBeCloseTo(expected[index], precision);
	}
}

test("fft returns the expected spectrum for an impulse", () => {
	const [real, imag] = fft([1, 0, 0, 0]);

	expectArrayClose(real, [1, 1, 1, 1]);
	expectArrayClose(imag, [0, 0, 0, 0]);
});

test("fft inverse normalizes the output", () => {
	const [real, imag] = fft([1, 0, 0, 0], true);

	expectArrayClose(real, [0.25, 0.25, 0.25, 0.25]);
	expectArrayClose(imag, [0, 0, 0, 0]);
});

test("fft rejects non power of two lengths", () => {
	expect(() => fft([1, 2, 3])).toThrow("fft input length must be a power of two");
});
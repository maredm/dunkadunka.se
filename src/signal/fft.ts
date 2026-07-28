import { ComplexNumberArray, NumberArray, isNumberArray } from "../math";

/**
 * Compute the Fast Fourier Transform (FFT) of a signal.
 *
 * The input can be either a real-valued NumberArray, which is treated as the real part,
 * or a ComplexNumberArray containing both real and imaginary components.
 *
 * @param signal The input signal as either a real-valued array or a complex-number object.
 * @param inverse If true, computes the inverse FFT. Defaults to false.
 * @returns An object containing the real and imaginary parts of the FFT result.
 */
export function fft(signal: NumberArray, inverse?: boolean): ComplexNumberArray;
export function fft(signal: ComplexNumberArray, inverse?: boolean): ComplexNumberArray;
export function fft(signal: ComplexNumberArray | NumberArray, inverse = false): ComplexNumberArray {
	let real: NumberArray, imag: NumberArray;
	if (isNumberArray(signal)) {
		real = Array.from(signal);
		imag = new Array(real.length).fill(0);
	} else {
		real = signal.real;
		imag = signal.imag ?? new Array(signal.real.length).fill(0);
	}
	const n = real.length;
	if (n === 0) return { real: [], imag: [] };
	if ((n & (n - 1)) !== 0) {
		throw new Error('fft input length must be a power of two');
	}

	real = real.slice();
	imag = imag.slice();

	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[real[i], real[j]] = [real[j], real[i]];
			[imag[i], imag[j]] = [imag[j], imag[i]];
		}
	}

	for (let len = 2; len <= n; len <<= 1) {
		const ang = (2 * Math.PI / len) * (inverse ? 1 : -1);
		const wlenReal = Math.cos(ang);
		const wlenImag = Math.sin(ang);

		for (let i = 0; i < n; i += len) {
			let wReal = 1;
			let wImag = 0;
			for (let j = 0; j < len / 2; j++) {
				const uReal = real[i + j];
				const uImag = imag[i + j];
				const idx = i + j + len / 2;
				const vReal = real[idx] * wReal - imag[idx] * wImag;
				const vImag = real[idx] * wImag + imag[idx] * wReal;

				real[i + j] = uReal + vReal;
				imag[i + j] = uImag + vImag;
				real[idx] = uReal - vReal;
				imag[idx] = uImag - vImag;

				const nextWReal = wReal * wlenReal - wImag * wlenImag;
				wImag = wReal * wlenImag + wImag * wlenReal;
				wReal = nextWReal;
			}
		}
	}

	if (inverse) {
		for (let i = 0; i < n; i++) {
			real[i] /= n;
			imag[i] /= n;
		}
	}

	return { real, imag };
}

export function rfft(signal: NumberArray, inverse = false): Float32Array {
	const n = signal.length;
	if (n === 0) return new Float32Array();
	if ((n & (n - 1)) !== 0) {
		throw new Error('rfft input length must be a power of two');
	}

	const { real, imag } = fft(signal, inverse);
	const halfN = n / 2;
	const rfftResult = new Float32Array(halfN + 1);
	for (let i = 0; i <= halfN; i++) {
		rfftResult[i] = Math.sqrt(real[i] ** 2 + imag[i] ** 2);
	}
	return rfftResult;
}

/** Returns frequency axis for the FFT of a signal */
export function fftFreq(signal: Float32Array, sampleRate: number): Float32Array {
	const n = signal.length;
	if (n === 0) return new Float32Array();
	if ((n & (n - 1)) !== 0) {
		throw new Error('fftfreq input length must be a power of two');
	}

	const frequencies = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		frequencies[i] = (i < n / 2 ? i : i - n) * (sampleRate / n);
	}
	return frequencies;
}

/** Returns frequency axis for the RFFT of a signal */
export function rfftFreq(signal: Float32Array, sampleRate: number): Float32Array {
	const n = signal.length;
	if (n === 0) return new Float32Array();
	if ((n & (n - 1)) !== 0) {
		throw new Error('rfftfreq input length must be a power of two');
	}

	const halfN = n / 2;
	const frequencies = new Float32Array(halfN + 1);
	for (let i = 0; i <= halfN; i++) {
		frequencies[i] = i * (sampleRate / n);
	}
	return frequencies;
}

export function nextPow2(n: number): number {
	if (n <= 0) return 1;
	return 2 ** Math.ceil(Math.log2(n));
}

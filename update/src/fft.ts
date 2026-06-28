/** Fast Fourier Transform */

export function fft(signal: number[], inverse = false): [number[], number[]] {
	const n = signal.length;
	if (n === 0) return [[], []];
	if ((n & (n - 1)) !== 0) {
		throw new Error('fft input length must be a power of two');
	}

	const real = signal.slice();
	const imag = new Array<number>(n).fill(0);

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

	return [real, imag];
}

import { fft, nextPow2 } from "./fft";
import { type ComplexFloat32Array, normalizeArray } from "../math";

function zeroPad(signal: Float32Array, targetLength: number): Float32Array {
    const padded = new Float32Array(targetLength);
    padded.set(signal);
    return padded;
}

function createHannWindow(length: number): Float32Array {
    if (length <= 1) {
        return new Float32Array(length);
    }
    const window = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
        const value = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
        window[index] = value;
    }
    return window;
}

function crossPowerSpectrum(x: Float32Array, y: Float32Array): ComplexFloat32Array {
    const n = x.length + y.length - 1;
    const size = nextPow2(n);

    const paddedX = zeroPad(x, size);
    const paddedY = zeroPad(y, size);

    const { real: realX, imag: imagX } = fft(paddedX);
    const { real: realY, imag: imagY } = fft(paddedY);

    const crossPowerReal = new Float32Array(size);
    const crossPowerImag = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        crossPowerReal[i] = realX[i] * realY[i] + imagX[i] * imagY[i];
        crossPowerImag[i] = imagX[i] * realY[i] - realX[i] * imagY[i];
    }

    return { real: crossPowerReal, imag: crossPowerImag };
}

export function coherence(x: Float32Array, y: Float32Array): Float32Array {
    const sourceLength = Math.max(x.length, y.length);
    const size = nextPow2(sourceLength);
    const paddedX = zeroPad(x, size);
    const paddedY = zeroPad(y, size);

    const segmentSize = Math.min(size, 1024);
    const step = Math.max(1, Math.floor(segmentSize / 2));
    const window = createHannWindow(segmentSize);
    const windowEnergy = window.reduce((sum, value) => sum + value * value, 0);
    const half = Math.floor(segmentSize / 2);

    const crossSpectrumReal = new Float32Array(half + 1);
    const crossSpectrumImag = new Float32Array(half + 1);
    const autoSpectrumX = new Float32Array(half + 1);
    const autoSpectrumY = new Float32Array(half + 1);
    let segmentCount = 0;

    for (let start = 0; start + segmentSize <= size; start += step) {
        const windowedX = new Float32Array(segmentSize);
        const windowedY = new Float32Array(segmentSize);
        for (let index = 0; index < segmentSize; index += 1) {
            const sampleIndex = start + index;
            windowedX[index] = (paddedX[sampleIndex] ?? 0) * window[index];
            windowedY[index] = (paddedY[sampleIndex] ?? 0) * window[index];
        }

        const { real: xReal, imag: xImag } = fft(windowedX);
        const { real: yReal, imag: yImag } = fft(windowedY);

        for (let bin = 0; bin <= half; bin += 1) {
            const xr = xReal[bin] ?? 0;
            const xi = xImag[bin] ?? 0;
            const yr = yReal[bin] ?? 0;
            const yi = yImag[bin] ?? 0;

            crossSpectrumReal[bin] += xr * yr + xi * yi;
            crossSpectrumImag[bin] += xi * yr - xr * yi;
            autoSpectrumX[bin] += xr * xr + xi * xi;
            autoSpectrumY[bin] += yr * yr + yi * yi;
        }

        segmentCount += 1;
    }

    if (segmentCount === 0) {
        return new Float32Array(half + 1);
    }

    const residualValues = new Float32Array(half + 1);
    const scale = windowEnergy * segmentCount;
    for (let bin = 0; bin <= half; bin += 1) {
        const crossMagnitudeSquared = (crossSpectrumReal[bin] / scale) ** 2 + (crossSpectrumImag[bin] / scale) ** 2;
        const autoXValue = autoSpectrumX[bin] / scale;
        const autoYValue = autoSpectrumY[bin] / scale;
        const denominator = autoXValue * autoYValue;
        const coherence = denominator > 0 ? crossMagnitudeSquared / denominator : 0;
        residualValues[bin] = Math.min(1, Math.max(0, 1 - coherence));
    }

    return residualValues;
}

export function computeCoherenceResponse(x: Float32Array, y: Float32Array, sampleRate: number): { frequencies: Float32Array; values: Float32Array } | null {
    if (x.length === 0 || y.length === 0 || sampleRate <= 0) {
        return null;
    }

    const size = nextPow2(Math.max(x.length, y.length));
    const values = coherence(x, y);
    const half = values.length;

    const frequencies = new Float32Array(half);
    const coherenceValues = new Float32Array(half);
    for (let index = 0; index < half; index += 1) {
        frequencies[index] = (index * sampleRate * 500) / size;
        coherenceValues[index] = values[index] ?? 0;
    }

    return { frequencies, values: coherenceValues };
}

export function crossCorrelation(x: Float32Array, y: Float32Array, normalize = false): Float32Array {
    const cps = normalize ? normalizeArray(crossPowerSpectrum(x, y)) : crossPowerSpectrum(x, y);
    const { real: crossCorrReal } = fft(cps.real as Float32Array, true);
    return Float32Array.from(crossCorrReal);
}
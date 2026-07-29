export type FloatArray = number[] | Float32Array | Float64Array;
export type IntegerArray = number[] | Int32Array | Int16Array;
export type NumberArray = FloatArray | IntegerArray;

export type ComplexFloatArray = {
	real: FloatArray;
	imag: FloatArray;
};

export type ComplexNumberArray = {
    real: NumberArray;
    imag: NumberArray;
};

export type ComplexFloat32Array = {
    real: Float32Array;
    imag: Float32Array;
};

export const isNumberArray = (arr: any): arr is NumberArray => {
    return Array.isArray(arr) || arr instanceof Float32Array || arr instanceof Float64Array || arr instanceof Int32Array || arr instanceof Int16Array;
}

export const logspace = (start: number, end: number, num: number): Float32Array => {
    const logStart = Math.log10(start);
    const logEnd = Math.log10(end);
    const logStep = (logEnd - logStart) / (num - 1);
    return Float32Array.from({ length: num }, (_, i) => Math.pow(10, logStart + i * logStep));
};

export const linspace = (start: number, end: number, num: number): Float32Array => {
    if (num === 1) return Float32Array.from([start]);
    const step = (end - start) / (num - 1);
    return Float32Array.from({ length: num }, (_, i) => start + i * step);
};

export const closest = (num: number, arr: Float32Array): number => {
    let curr = arr[0];
    let diff = Math.abs(num - curr);
    let index = 0;
    for (let val = 0; val < arr.length; val++) {
        const newDiff = Math.abs(num - arr[val]);
        if (newDiff < diff) {
            diff = newDiff;
            curr = arr[val];
            index = val;
        }
    }
    return index;
};

export const clamp = (v: number, lower: number, upper: number): number => {
    return Math.max(lower, Math.min(upper, v));
};

export const average = (array: Float32Array): number => array.reduce((a, b) => a + b) / array.length;

export const abs = (re: number, im: number = 0): number => Math.sqrt(re * re + im * im);

export const mod = (n: number, m: number): number => ((n % m) + m) % m;

export const max = (arr: Float32Array): number => {
    let maxVal = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] > maxVal) maxVal = Math.abs(arr[i]);
    }
    return maxVal;
};

export const rms = (arr: Float32Array): number => {
    let sumSquares = 0;
    for (let i = 0; i < arr.length; i++) {
        sumSquares += arr[i] * arr[i];
    }
    return Math.sqrt(sumSquares / arr.length);
};

export const sum = (arr: Float32Array): number => {
    let total = 0;
    for (let i = 0; i < arr.length; i++) {
        total += arr[i];
    }
    return total;
}

export function normalizeArray(input: Float32Array, peak?: boolean): Float32Array;
export function normalizeArray(input: ComplexFloat32Array, peak?: boolean): ComplexFloat32Array;
export function normalizeArray(input: Float32Array | ComplexFloat32Array, peak: boolean = false): Float32Array | ComplexFloat32Array {
    const isComplex = !(input instanceof Float32Array);

    const { real, imag } = isComplex ? input : { real: input, imag: new Float32Array(input.length) };
    const size = real.length;

    const magnitude = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        magnitude[i] = Math.sqrt(real[i] ** 2 + imag[i] ** 2);
        if (magnitude[i] > 0) {
            real[i] /= magnitude[i];
            imag[i] /= magnitude[i];
        }
    }

    if (peak) {
        const maxMagnitude = Math.max(...magnitude);
        if (maxMagnitude > 0) {
            for (let i = 0; i < size; i++) {
                real[i] /= maxMagnitude;
                imag[i] /= maxMagnitude;
            }
        }
    }

    return !isComplex ? real : { real, imag };
}

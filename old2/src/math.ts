console.debug("Math module loaded");

export function logspace(start: number, end: number, num: number): Float32Array {
    const logStart = Math.log10(start);
    const logEnd = Math.log10(end);
    const logStep = (logEnd - logStart) / (num - 1);
    return Float32Array.from({ length: num }, (_, i) => Math.pow(10, logStart + i * logStep));
}

export function linspace(start: number, end: number, num: number): Float32Array {
    if (num === 1) return Float32Array.from([start]);
    const step = (end - start) / (num - 1);
    return Float32Array.from({ length: num }, (_, i) => start + i * step);
}

export function closest(num: number, arr: Float32Array): number {
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
}

export function clamp(v: number, lower: number, upper: number): number {
    return Math.max(lower, Math.min(upper, v));
}

export const average = (array: Float32Array): number => array.reduce((a, b) => a + b) / array.length;

export const abs = (re: number, im: number = 0): number => Math.sqrt(re * re + im * im);

export const mod = (n: number, m: number): number => ((n % m) + m) % m;

export const nextPow2 = (v: number): number => {
        let p = 1;
        while (p < v) p <<= 1;
        return p;
    };

export function max(arr: Float32Array): number {
    let maxVal = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] > maxVal) maxVal = Math.abs(arr[i]);
    }
    return maxVal;
}
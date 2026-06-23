export function logspace(start, end, num) {
    const logStart = Math.log10(start);
    const logEnd = Math.log10(end);
    const logStep = (logEnd - logStart) / (num - 1);
    return Array.from({ length: num }, (_, i) => Math.pow(10, logStart + i * logStep));
}

export function linspace(start, end, num) {
    if (num === 1) return [start];
    const step = (end - start) / (num - 1);
    return Array.from({ length: num }, (_, i) => start + i * step);
}

export function closest(num, arr) {
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

export function clamp(v, lower, upper) {
    return Math.max(lower, Math.min(upper, v));
}

export const average = (array) => array.reduce((a, b) => a + b) / array.length;

export const abs = (re, im = 0) => Math.sqrt(re * re + im * im);

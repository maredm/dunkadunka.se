"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextPow2 = exports.mod = exports.abs = exports.average = void 0;
exports.logspace = logspace;
exports.linspace = linspace;
exports.closest = closest;
exports.clamp = clamp;
exports.max = max;
console.debug("Math module loaded");
function logspace(start, end, num) {
    const logStart = Math.log10(start);
    const logEnd = Math.log10(end);
    const logStep = (logEnd - logStart) / (num - 1);
    return Float32Array.from({ length: num }, (_, i) => Math.pow(10, logStart + i * logStep));
}
function linspace(start, end, num) {
    if (num === 1)
        return Float32Array.from([start]);
    const step = (end - start) / (num - 1);
    return Float32Array.from({ length: num }, (_, i) => start + i * step);
}
function closest(num, arr) {
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
function clamp(v, lower, upper) {
    return Math.max(lower, Math.min(upper, v));
}
const average = (array) => array.reduce((a, b) => a + b) / array.length;
exports.average = average;
const abs = (re, im = 0) => Math.sqrt(re * re + im * im);
exports.abs = abs;
const mod = (n, m) => ((n % m) + m) % m;
exports.mod = mod;
const nextPow2 = (v) => {
    let p = 1;
    while (p < v)
        p <<= 1;
    return p;
};
exports.nextPow2 = nextPow2;
function max(arr) {
    let maxVal = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] > maxVal)
            maxVal = Math.abs(arr[i]);
    }
    return maxVal;
}

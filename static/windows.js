"use strict";
// windows.ts
// Various window functions for signal processing.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSelectedWindow = getSelectedWindow;
exports.tukeyWindow = tukeyWindow;
function hanningWindow(length) {
    const window = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)));
    }
    return window;
}
function hammingWindow(length) {
    const window = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        window[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (length - 1));
    }
    return window;
}
function blackmanWindow(length) {
    const window = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        window[i] = (0.42 - 0.5 * Math.cos(2 * Math.PI * i / (length - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (length - 1)));
    }
    return window;
}
function equirippleWindow(length, attenuation = 60) {
    // Dolph-Chebyshev window (approximate equiripple)
    // attenuation: sidelobe attenuation in dB
    // Reference: https://en.wikipedia.org/wiki/Chebyshev_window
    if (length < 2)
        return new Float32Array([1]);
    const M = length - 1;
    const tg = Math.cosh(1 / M * Math.acosh(Math.pow(10, attenuation / 20)));
    const window = new Float32Array(length);
    // Precompute Chebyshev polynomial coefficients
    for (let n = 0; n <= M; n++) {
        let sum = 0;
        for (let k = 0; k <= M; k++) {
            const x = tg * Math.cos(Math.PI * k / M);
            // Chebyshev polynomial of degree M
            let Tm;
            if (Math.abs(x) <= 1) {
                Tm = Math.cos(M * Math.acos(x));
            }
            else {
                Tm = Math.cosh(M * Math.acosh(x));
            }
            const coeff = ((k === 0 || k === M) ? 0.5 : 1) * Tm * Math.cos(Math.PI * n * (k - M / 2) / M);
            sum += coeff;
        }
        window[n] = sum;
    }
    return window;
}
function rectangularWindow(length) {
    const window = new Float32Array(length);
    window.fill(1);
    return window;
}
function getSelectedWindow(windowType, length, correct = true) {
    const type = windowType;
    let window = new Float32Array(length);
    let wcf = 1; // Window correction factor
    if (type === 'hanning') {
        window = hanningWindow(length);
        wcf = 2.000;
    }
    if (type === 'hamming') {
        window = hammingWindow(length);
        wcf = 1.852;
    }
    if (type === 'blackman') {
        window = blackmanWindow(length);
        wcf = 2.381;
    }
    if (type === 'rectangular') {
        window = rectangularWindow(length);
        wcf = 1.000;
    }
    if (correct) {
        window = window.map(v => v / wcf); // Scale to max 2 for better visualization
    }
    return window;
}
function tukeyWindow(length, alpha = 0.5) {
    if (length < 1)
        return new Float32Array(0);
    if (length === 1)
        return new Float32Array([1]);
    const N = length;
    const w = new Float32Array(N);
    if (alpha <= 0) {
        w.fill(1); // rectangular
        return w;
    }
    if (alpha >= 1) {
        // Equivalent to a Hann/Hanning window
        for (let i = 0; i < N; i++) {
            w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
        }
        return w;
    }
    const edge = alpha * (N - 1) / 2;
    const denom = alpha * (N - 1);
    for (let n = 0; n < N; n++) {
        if (n <= edge) {
            w[n] = 0.5 * (1 + Math.cos(Math.PI * ((2 * n) / denom - 1)));
        }
        else if (n >= (N - 1 - edge)) {
            // symmetric tail
            const m = N - 1 - n;
            w[n] = 0.5 * (1 + Math.cos(Math.PI * ((2 * m) / denom - 1)));
        }
        else {
            w[n] = 1;
        }
    }
    return w;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Farina = void 0;
exports.plotDistortion = plotDistortion;
exports.plotTHD = plotTHD;
const math_1 = require("./math");
const windows_1 = require("./windows");
const audio_1 = require("./audio");
const plotting_1 = require("./plotting");
class Farina {
    /* Farina deconvolution implementation according to the Python implementation. */
    constructor(stimulus, f_start = 50, f_stop = 22800, fs = 48000) {
        this.deconvolved = Float32Array.from([]);
        this.f_start = f_start;
        this.f_stop = f_stop;
        this.fs = fs;
        this.stimulus = stimulus;
        this.duration = (this.stimulus.length - 528) / this.fs;
    }
    lag_of_harmonic(n) {
        return this.ell() * Math.log(n);
    }
    margin_of_harmonic(n) {
        return this.ell() * Math.log(n + 1) - this.ell() * Math.log(n);
    }
    max_safe_harmonic(window_size) {
        const t = [];
        for (let n = 1; n < 1000; n++) {
            if (this.margin_of_harmonic(n) > window_size) {
                t.push(this.margin_of_harmonic(n));
            }
        }
        return t.length < 999 ? t.length : 0;
    }
    ell() {
        return this.duration / Math.log(this.f_stop / this.f_start);
    }
    rate(length) {
        return 1 / this.f_start * Math.PI * Math.round(length * this.f_start / Math.log2(this.f_stop / this.f_start));
    }
    instant() {
        // Lag between the start of the sweep and the stimulus.
        return (0, math_1.closest)(100000000, this.deconvolved);
    }
    window(signal, at, length) {
        const size = Math.floor(length * this.fs);
        const window = (0, windows_1.getSelectedWindow)('hanning', size, false);
        const si = signal.ir.slice(at - size / 2, at + size / 2);
        const w = Float32Array.from({ length: size }, () => 0);
        if (si.length === window.length) {
            for (let i = 0; i < window.length; i++) {
                w[i] = window[i] * si[i];
            }
        }
        const ir_complex = Float32Array.from({ length: w.length * 2 }, () => 0);
        for (let i = 0; i < w.length; i++) {
            ir_complex[2 * i] = w[i];
            ir_complex[2 * i + 1] = 0;
        }
        return {
            ir: w,
            ir_complex,
            t: (0, math_1.linspace)((-size - 1) / 2 / this.fs, (size - 1) / 2 / this.fs, size),
            peakAt: at,
            sampleRate: this.fs,
            fftSize: w.length,
        };
    }
    deconvolution(signal) {
        const n = (0, math_1.linspace)(0, this.stimulus.length - 1, this.stimulus.length);
        const ell = this.ell();
        const k = n.map(v => Math.exp(v / ell / this.fs)); // simplified for first element
        const inv_stimulus = this.stimulus.slice().reverse().map((v, i) => v / k[i]);
        const deconvolved = (0, audio_1.fftConvolve)(signal, inv_stimulus, 'same').slice();
        const norm = (0, math_1.max)((0, audio_1.fftConvolve)(this.stimulus, inv_stimulus, 'same').map(v => Math.abs(v)));
        this.deconvolved = deconvolved.map(v => v / norm);
        return this.deconvolved;
    }
    deconvolvedResponse(signal) {
        const ir = this.deconvolution(signal);
        const peakAt = this.instant();
        const ir_complex = Float32Array.from({ length: ir.length * 2 }, () => 0);
        for (let i = 0; i < ir.length; i++) {
            ir_complex[2 * i] = ir[i];
            ir_complex[2 * i + 1] = 0;
        }
        return {
            ir,
            ir_complex,
            t: (0, math_1.linspace)((-peakAt) / this.fs, (-peakAt + ir.length - 1) / this.fs, ir.length),
            peakAt,
            sampleRate: this.fs,
            fftSize: ir.length,
        };
    }
    harmonics(windowSize, harmonicsCount) {
        const results = [];
        for (let n = 0; n <= harmonicsCount; n++) {
            const at = Math.round(this.instant() - this.lag_of_harmonic(n + 1) * this.fs);
            const w = this.window({
                ir: this.deconvolved,
                ir_complex: Float32Array.from([]),
                t: Float32Array.from([]),
                peakAt: at,
                sampleRate: this.fs,
                fftSize: this.deconvolved.length,
            }, at, windowSize);
            results.push(w);
        }
        return results;
    }
}
exports.Farina = Farina;
function plotDistortion(farina, windowSize, maxHarmonics, tabId) {
    const harmonics = farina.harmonics(windowSize, maxHarmonics);
    const harmonicsFFT = harmonics.map((h, n) => (0, audio_1.computeFFTFromIR)(h, 1000, 1 / (n + 1)));
    const smoothedHarmonicsFFT = harmonicsFFT.map(hf => (0, audio_1.smoothFFT)(hf, 1 / 6, 1 / 96));
    const traces = [];
    for (let n = 0; n < smoothedHarmonicsFFT.length; n++) {
        const color = plotting_1.COLORS[n % plotting_1.COLORS.length];
        const response = harmonicsFFT[n];
        const smoothedResponse = smoothedHarmonicsFFT[n];
        if (n === 0) {
            traces.push({
                x: response.frequency.map(f => f / (n + 1)),
                y: (0, audio_1.db)(response.magnitude),
                type: 'scatter',
                mode: 'lines',
                name: n === 0 ? 'Fundamental' : `Harmonic ${n + 1}`,
                line: {
                    width: .75,
                    color: color + '33', // Lighter color for raw
                },
                showlegend: n === 0,
            });
        }
        traces.push({
            x: smoothedResponse.frequency.map(f => f / (n + 1)),
            y: (0, audio_1.db)(smoothedResponse.magnitude),
            type: 'scatter',
            mode: 'lines',
            name: (n === 0 ? 'Fundamental' : `Harmonic ${n + 1}`) + ' (Smoothed)',
            line: {
                width: 1.5,
                color: color,
            },
        });
    }
    (0, plotting_1.plot)(traces, tabId, 'Fundamental and Harmonic Distortion', 'Frequency (Hz)', 'Amplitude (dBFS)', { type: 'log', range: [Math.log10(20), Math.log10(20000)] }, { range: [-85, 5] }, {}, false);
}
function plotTHD(farina, windowSize, maxHarmonics, tabId) {
    const harmonics = farina.harmonics(windowSize, maxHarmonics);
    const harmonicsFFT = harmonics.map((h, n) => (0, audio_1.computeFFTFromIR)(h, 1000, 1 / (n + 1)));
    const smoothedHarmonicsFFT = harmonicsFFT.map(hf => (0, audio_1.smoothFFT)(hf, 1 / 6, 1 / 96));
    const fundamental = smoothedHarmonicsFFT[0];
    const traces = [];
    const thd = Float32Array.from({ length: fundamental.magnitude.length }, () => 0);
    for (let i = 0; i < fundamental.magnitude.length; i++) {
        let sumSquares = 0;
        for (let n = 1; n < smoothedHarmonicsFFT.length; n++) {
            sumSquares += Math.pow(smoothedHarmonicsFFT[n].magnitude[i], 2);
        }
        thd[i] = Math.sqrt(sumSquares) / fundamental.magnitude[i];
    }
    traces.push({
        x: fundamental.frequency,
        y: thd.map(v => v * 100), // Convert to percentage
        type: 'scatter',
        mode: 'lines',
        name: 'Total Harmonic Distortion (THD)',
        line: {
            width: 1.5,
            color: plotting_1.COLORS[0],
        },
    });
    (0, plotting_1.plot)(traces, tabId, 'Total Harmonic Distortion', 'Frequency (Hz)', 'THD (%)', { type: 'log', range: [Math.log10(20), Math.log10(20000)] }, { range: [0, 5] }, {}, false);
}

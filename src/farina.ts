import { closest, linspace, max } from './math';
import { getSelectedWindow } from './windows';
import { computeFFTFromIR, db, fftConvolve, smoothFFT } from './audio';
import { ImpulseResponseResult } from './audio';
import { plot, COLORS } from './plotting';

export class Farina {
    /* Farina deconvolution implementation according to the Python implementation. */
    constructor(stimulus: Float32Array, f_start: number = 50, f_stop: number = 22800, fs: number = 48000) {
        this.f_start = f_start;
        this.f_stop = f_stop;
        this.fs = fs;
        this.stimulus = stimulus;
        this.duration = (this.stimulus.length - 528) / this.fs;
    }

    f_start: number;
    f_stop: number;
    fs: number;
    stimulus: Float32Array;
    deconvolved: Float32Array = Float32Array.from([]);
    duration: number;

    lag_of_harmonic(n: number) {
        return this.ell() * Math.log(n);
    }

    margin_of_harmonic(n: number) {
        return this.ell() * Math.log(n + 1) - this.ell() * Math.log(n);
    }

    max_safe_harmonic(window_size: number): number {
        const t: number[] = [];
        for (let n = 1; n < 1000; n++) {
            if (this.margin_of_harmonic(n) > window_size) {
                t.push(this.margin_of_harmonic(n));
            }
        }
        return t.length < 999 ? t.length : 0;
    }

    ell(): number {
        return this.duration / Math.log(this.f_stop / this.f_start);
    }

    rate(length: number): number {
        return 1 / this.f_start * Math.PI * Math.round(length * this.f_start / Math.log2(this.f_stop / this.f_start));
    }

    instant(): number {
        // Lag between the start of the sweep and the stimulus.
        return closest(100000000, this.deconvolved);
    }

    window(signal: ImpulseResponseResult, at: number, length: number): ImpulseResponseResult {
        const size = Math.floor(length * this.fs);
        const window: Float32Array = getSelectedWindow('rectangular', size, false);

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
            t: linspace((-size - 1) / 2 / this.fs, (size - 1) / 2 / this.fs, size),
            peakAt: at,
            sampleRate: this.fs,
            fftSize: w.length,
        }
    }

    deconvolution(signal: Float32Array): Float32Array {
        const n: Float32Array = linspace(0, this.stimulus.length - 1, this.stimulus.length);
        const ell = this.ell();
        const k: Float32Array = n.map(v => Math.exp(v / ell / this.fs)); // simplified for first element

        const inv_stimulus = this.stimulus.slice().reverse().map ((v, i) => v / k[i]);

        const deconvolved: Float32Array = fftConvolve(signal, inv_stimulus, 'same').slice();
        const norm = max(fftConvolve(this.stimulus, inv_stimulus, 'same').map(v => Math.abs(v)));

        this.deconvolved = deconvolved.map(v => v / norm);
        return this.deconvolved;
    }

    deconvolvedResponse(signal: Float32Array): ImpulseResponseResult {
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
            t: linspace((- peakAt)/ this.fs, (- peakAt + ir.length - 1)/ this.fs, ir.length),
            peakAt,
            sampleRate: this.fs,
            fftSize: ir.length,
        };
    }

    harmonics(windowSize: number, harmonicsCount: number): ImpulseResponseResult[] {
        const results: ImpulseResponseResult[] = [];
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

export function plotDistortion(farina: Farina, windowSize: number, maxHarmonics: number, tabId: string): void {
    const harmonics = farina.harmonics(windowSize, maxHarmonics);
    const harmonicsFFT = harmonics.map((h, n) => computeFFTFromIR(h, 1000, 1 / (n + 1)));
    const smoothedHarmonicsFFT = harmonicsFFT.map(hf => smoothFFT(hf, 1/6, 1/96));

    const traces: any[] = [];
    for (let n = 0; n < smoothedHarmonicsFFT.length; n++) {
        const color = COLORS[n % COLORS.length];

        const response = harmonicsFFT[n];
        const smoothedResponse = smoothedHarmonicsFFT[n];
        if (n === 0) {
            traces.push({
                x: response.frequency.map(f => f / (n + 1)),
                y: db(response.magnitude),
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
            y: db(smoothedResponse.magnitude),
            type: 'scatter',
            mode: 'lines',
            name: (n === 0 ? 'Fundamental' : `Harmonic ${n + 1}`) + ' (Smoothed)',
            line: {
                width: 1.5,
                color: color,
            },
        });

        
    }
    plot(
        traces,
        tabId, 
        'Fundamental and Harmonic Distortion', 
        'Frequency (Hz)', 
        'Amplitude (dBFS)',
        {type: 'log', range: [Math.log10(20), Math.log10(20000)]}, 
        {range: [-85, 5]},
        {}, 
        false
    );
}

export function plotTHD(farina: Farina, windowSize: number, maxHarmonics: number, tabId: string): void {
    const harmonics = farina.harmonics(windowSize, maxHarmonics);
    const harmonicsFFT = harmonics.map((h, n) => computeFFTFromIR(h, 1000, 1 / (n + 1)));
    const smoothedHarmonicsFFT = harmonicsFFT.map(hf => smoothFFT(hf, 1/6, 1/96));

    const fundamental = smoothedHarmonicsFFT[0];
    const traces: any[] = [];

    const thd: Float32Array = Float32Array.from({ length: fundamental.magnitude.length }, () => 0);
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
            color: COLORS[0],
        },
    });

    plot(
        traces,
        tabId, 
        'Total Harmonic Distortion', 
        'Frequency (Hz)', 
        'THD (%)',
        {type: 'log', range: [Math.log10(20), Math.log10(20000)]}, 
        {range: [0, 5]},
        {}, 
        false
    );  
}

import { closest, linspace, max } from './math';
import { getSelectedWindow } from './windows';
import { fftConvolve } from './audio';
import { ImpulseResponseResult } from './audio';

export class Farina {
    /* Farina deconvolution implementation according to the Python implementation. */
    constructor(stimulus: Float32Array, f_start: number = 50, f_stop: number = 22800, fs: number = 48000) {
        this.f_start = f_start;
        this.f_stop = f_stop;
        this.fs = fs;
        this.stimulus = stimulus;
        this.duration = this.stimulus.length / this.fs;
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

    window(signal: Float32Array, at: number, length: number): Float32Array {
        const size = Math.floor(length * this.fs);
        const window: Float32Array = getSelectedWindow('hanning', size);
        const sig = this.deconvolution(signal);
        const si = sig.slice(at - size / 2, at + size / 2);
        const w = Float32Array.from({ length: size }, () => 0);
        return si;
        if (si.length === window.length) {
            for (let i = 0; i < window.length; i++) {
                w[i] = window[i] * si[i];
            }
            return w;
        } else {
            return Float32Array.from({ length: window.length }, () => 0); // zeros
        }        
    }

    deconvolution(signal: Float32Array, customLength: number = 5.5): Float32Array {
        const n: Float32Array = linspace(0, this.stimulus.length - 1, this.stimulus.length);
        const k: Float32Array = n.map(v => Math.exp(v / this.ell() / this.fs)); // simplified for first element

        const inv_stimulus = this.stimulus.slice().reverse().map ((v, i) => v / k[i]);

        const deconvolved: Float32Array = fftConvolve(signal, inv_stimulus, 'same').slice().reverse();
        const norm = max(fftConvolve(this.stimulus, inv_stimulus, 'same').map(v => Math.abs(v)));

        this.deconvolved = deconvolved;
        return deconvolved.map(v => v / norm);
    }
    
    
}

export function FarinaImpulseResponse(y: Float32Array, x: Float32Array, customLength: number = 5.5): ImpulseResponseResult {
    const farina = new Farina(x, 2, 20000, 48000);

    const measurementResponse = farina.deconvolution(y, customLength);
    console.log(farina.max_safe_harmonic(0.1));
    
    const peakAt = farina.instant();
    console.log('peakAt', peakAt);
    
    const s: Float32Array = farina.window(y, peakAt, 0.1); // 250 ms windowed IR

    const ir = Float32Array.from({ length: s.length }, () => 0);
    for (let i = 0; i < s.length; i++) {
        ir[i] = s[i];
    }

    const ir_complex = Float32Array.from({ length: s.length * 2 }, () => 0);
    for (let i = 0; i < s.length; i++) {
            ir_complex[2 * i] = s[i];
            ir_complex[2 * i + 1] = 0;
    }

    return {
        ir,
        ir_complex,
        t: linspace((-measurementResponse.length - 1) / 2 / 48000, (measurementResponse.length - 1) / 2 / 48000, measurementResponse.length),
        peakAt,
        sampleRate: 48000,
        fftSize: measurementResponse.length,
    };
}
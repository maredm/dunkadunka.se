import { abs, average, closest, linspace, mod, nextPow2 } from './math';
import { FFT } from './fft';
import { fractionalOctaveSmoothing, getFractionalOctaveFrequencies } from './fractional_octave_smoothing';
import { getSelectedWindow } from './windows';

console.debug("Audio module loaded");

(window as any).FFT = FFT; // Make FFT globally available

export function sum(buffer: number[] | Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
    }
    return sum
}

export function rms(buffer: number[] | Float32Array): number {
    return Math.sqrt(sum(buffer) / buffer.length);
}



export function normalize(input: number[] | Float32Array, peak: boolean = false): Float32Array {
    const signal = Float32Array.from(input);

    const rms_value = rms(input);
    if (rms_value === 0) return Float32Array.from(input); // avoid division by zero, return original (silence)

    const factor = (1 / rms_value) * (peak ? 1 : Math.SQRT2);

    return signal.map(v => v * factor);
}

export function exponentialMovingAverage(old: number, value: number, alpha: number): number {
    return alpha * value + (1 - alpha) * old;
}

export function db(value: Array<number>): Array<number>;
export function db(value: number): number;
export function db(value: Array<number> | number): Array<number> | number {
    if (Array.isArray(value)) {
        return value.map(v => 20 * Math.log10(v + 1e-50));
    } else {
        return 20 * Math.log10(value + 1e-50);
    }
}

export const smoothingFactor = (timeConstant: number, sampleRate: number): number => {
    return 1 - Math.exp(-1 / (sampleRate * timeConstant));
}

export function dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
}

export function getExponentialSmoothingFactor(timeConstant: number, sampleRate: number): number {
    return 1 - Math.exp(-1 / (timeConstant * sampleRate));
}

export function linearToDb(linear: number): number {
    return linear > 0 ? 20 * Math.log10(linear) : -Infinity;
}

/**
 * Generate a logarithmic chirp (sweep) similar to the provided Python version.
 * @param f_start - start frequency (Hz)
 * @param f_stop - stop frequency (Hz)
 * @param duration - total duration in seconds (if null, computed from rate)
 * @param rate - seconds per decade (if null, computed from duration)
 * @param fade - fade fraction (used to compute fade-in/out lengths)
 * @param fs - sample rate in Hz
 * @returns [sweepWindowed, timeVector, envelope]
 */
export function chirp(f_start: number, f_stop: number, duration: number | null = null, rate: number | null = null, fade: number = 0.01, fs: number = 48000): [Float32Array, Float32Array, Float32Array] {
    const c = Math.log(f_stop / f_start);

    let L: number;
    let samples_count: number;

    if (duration == null && rate == null) {
        // Default to one decade per second if nothing provided
        rate = 1.0;
    }

    if (duration == null) {
        // rate is seconds per decade -> L = rate / ln(10)
        L = (rate as number) / Math.log(10);
        samples_count = Math.round(L * c * fs);
        duration = samples_count / fs;
    } else {
        L = duration / c;
        rate = Math.log(10) * L;
        samples_count = Math.round(L * c * fs);
    }

    samples_count = Math.max(1, samples_count);

    const fade_in = Math.max(0, Math.floor(fade * fs));
    const fade_out = Math.max(0, Math.floor((fade / 10) * fs));

    // instantaneous phase
    // phi = (L * f_start) * (exp(t/L) - 1)
    // compact phi: pre-fade (fade_in samples), main sweep, post-fade (fade_out samples)
    const pre = Math.max(0, fade_in);
    const post = Math.max(0, fade_out);
    const phi = new Float32Array(pre + samples_count + post);

    // offset matches original phi_fade_in last value: f_start * ((fade_in+1)/fs)
    const offset = f_start * ((fade_in + 1) / fs);

    // pre-fade linear ramp
    for (let i = 0; i < pre; i++) phi[i] = f_start * (i / fs);

    // main sweep (adds offset)
    const baseIdx = pre;
    for (let i = 0; i < samples_count; i++) {
        let t = i / fs;
        phi[baseIdx + i] = L * f_start * (Math.exp(t / L) - 1) + offset;
    }

    // post-fade linear ramp starting from last sweep value
    const last = phi[baseIdx + samples_count - 1] || 0;
    for (let i = 0; i < post; i++) {
        phi[baseIdx + samples_count + i] = last + f_stop * ((i + 1) / fs);
    }

    // sweep = sin(2 * PI * phi)
    const sweep = new Float32Array(phi.length);
    for (let i = 0; i < phi.length; i++) sweep[i] = Math.sin(2 * Math.PI * phi[i]);

    // compute time vector t for sweep length
    const t = new Float32Array(sweep.length);
    for (let i = 0; i < sweep.length; i++) t[i] = i / fs;

    // envelope main: (exp(-t/L) / L) * f_stop * duration^2
    const envMain = new Float32Array(t.length);
    const factor = f_stop * (duration as number) * (duration as number);
    for (let i = 0; i < t.length; i++) envMain[i] = (Math.exp(-t[i] / L) / L) * factor;

    // prepend and append small zero pads (approx. 10ms and 1ms at given fs)
    const startZeros = Math.floor(0.01 * fs); // ~480 samples at 48k
    const endZeros = Math.floor(0.001 * fs);  // ~48 samples at 48k
    const envelope = new Float32Array(startZeros + envMain.length + endZeros);
    // zeros already, copy envMain into middle
    envelope.set(envMain, startZeros);

    // window: simple linear fade in/out over fade_in / fade_out samples
    const window = new Float32Array(sweep.length);
    for (let i = 0; i < sweep.length; i++) {
        let w = 1.0;
        if (fade_in > 0 && i < fade_in) {
            w = i / Math.max(1, fade_in);
        }
        if (fade_out > 0 && i >= sweep.length - fade_out) {
            const k = i - (sweep.length - fade_out);
            w *= 1 - (k / Math.max(1, fade_out));
        }
        window[i] = w;
    }

    // apply window to sweep
    const sweepWindowed = new Float32Array(sweep.length);
    for (let i = 0; i < sweep.length; i++) sweepWindowed[i] = sweep[i] * window[i];

    return [sweepWindowed, t, envelope];
}

export interface Audio {
    sampleRate: number;
    channels: number;
    data: Float32Array[];
}

export interface FFTResult {
    frequency: number[];
    magnitude: number[];
    phase: number[];
    fftSize: number;
}


export function smoothFFT(fftData: FFTResult, fraction: number, resolution: number): FFTResult {
    const { frequency, magnitude, phase, fftSize } = fftData;
    const smoothedMagnitude = new Float32Array(magnitude.length);

    // Get fractional octave frequencies
    const fractionalFrequencies = getFractionalOctaveFrequencies(resolution, 20, 24000, fftSize);

    // Apply fractional octave smoothing
    const smoothed = fractionalOctaveSmoothing(db(magnitude), fraction, fractionalFrequencies);
    const smoothedPhase = fractionalOctaveSmoothing(phase, fraction, fractionalFrequencies);

    return {
        frequency: fractionalFrequencies,
        magnitude: Array.from(smoothed),
        phase: Array.from(smoothedPhase),
        fftSize
    };
}

export function computeFFT(data: Array<number> | Float32Array, fftSize: number | null = null): FFTResult {
    fftSize ??= 2 ** Math.ceil(Math.log2(data.length));
    console.log(`Computing FFT with ${fftSize} bins for data length ${data.length}`);
    const fft = new FFT(fftSize);
    const out = fft.createComplexArray();

    // Fix data length by zero-padding or truncating.
    const frame = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
        frame[i] = (data[i] || 0) * 1;
    }
    fft.realTransform(out, frame);
    
    const frequency: number[] = [];
    const magnitude: number[] = [];
    const phase: number[] = [];

    for (let i = 0; i < fftSize / 2; i++) {
            const re = out[2 * i];
            const im = out[2 * i + 1];
            magnitude[i] = abs(re, im) * Math.SQRT2; // Scale by sqrt(2) for single-sided spectrum.
            phase[i] = Math.atan2(im, re); // phase in radians, range [-PI, PI].
    }
    const frequencyResolution = 48000 / fftSize; // Assuming sample rate of 48000 Hz
    for (let i = 0; i < fftSize / 2; i++) {
        frequency[i] = i * frequencyResolution;
    }

    return {
        frequency,
        magnitude,
        phase,
        fftSize,
    };
}

export interface CorrelationResult {
    corr: Float64Array;
    lags: Int32Array;
    estimatedLagSamples: number;
    estimatedLagIndex: number;
    peakCorrelation: number;
    raw: Float64Array;
    nfft: number;
}

export function fftCorrelation(x: number[] | Float32Array, y: number[] | Float32Array): CorrelationResult {
    // cross-correlate x with y using FFT (fft.js). Returns normalized cross-correlation,
    // lags (samples), estimated lag (samples) and peak correlation value.
    const lenX = x.length;
    const lenY = y.length;
    const fullLen = lenX + lenY - 1;

    // next pow2 >= fullLen
    const nextPow2 = (v: number): number => {
        let p = 1;
        while (p < v) p <<= 1;
        return p;
    };
    const n = nextPow2(fullLen);

    // zero-pad inputs to length n
    const xP = new Float32Array(n);
    const yP = new Float32Array(n);
    xP.set(x, 0);
    yP.set(y, 0);

    const fft = new FFT(n);
    const A = fft.createComplexArray();
    const B = fft.createComplexArray();

    // forward real FFTs
    fft.realTransform(A, xP);
    fft.realTransform(B, yP);
    // complete the spectrum to full complex arrays (negative freqs)
    if (typeof fft.completeSpectrum === 'function') {
        fft.completeSpectrum(A);
        fft.completeSpectrum(B);
    }

    // multiply A * conj(B) -> cross-spectrum
    const C = fft.createComplexArray();
    for (let k = 0; k < n; k++) {
        const ar = A[2 * k], ai = A[2 * k + 1];
        const br = B[2 * k], bi = B[2 * k + 1];
        // A * conj(B) = (ar + i ai)*(br - i bi)
        C[2 * k] = ar * br + ai * bi;
        C[2 * k + 1] = ai * br - ar * bi;
    }

    // inverse FFT of cross-spectrum
    const out = fft.createComplexArray();
    fft.inverseTransform(out, C);

    // real part / n gives linear cross-correlation (no circular wrap because padded)
    const corr = new Float64Array(fullLen);
    for (let i = 0; i < fullLen; i++) {
        corr[i] = out[2 * i] / n;
    }

    // compute normalization factor (energy)
    let sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < lenX; i++) sumX2 += x[i] * x[i];
    for (let i = 0; i < lenY; i++) sumY2 += y[i] * y[i];
    const denom = Math.sqrt(sumX2 * sumY2);

    const normalized = new Float64Array(fullLen);
    if (denom > 0) {
        for (let i = 0; i < fullLen; i++) normalized[i] = corr[i] / denom;
    } else {
        // silence case -> zeros
        for (let i = 0; i < fullLen; i++) normalized[i] = 0;
    }

    // lags: index i corresponds to lag = i - (lenY - 1)
    const lags = new Int32Array(fullLen);
    for (let i = 0; i < fullLen; i++) lags[i] = i - (lenY - 1);

    // find peak
    let peakIdx = 0;
    let peakVal = -Infinity;
    for (let i = 0; i < fullLen; i++) {
        if (normalized[i] > peakVal) {
            peakVal = normalized[i];
            peakIdx = i;
        }
    }
    const estimatedLag = lags[peakIdx];

    return {
        corr: normalized,
        lags,
        estimatedLagSamples: estimatedLag,
        estimatedLagIndex: peakIdx,
        peakCorrelation: peakVal,
        raw: corr,
        nfft: n
    };
}

export function fftConvolve(x: number[] | Float32Array, y: number[] | Float32Array, mode: 'same' | 'full' = 'same'): Array<number> {
    const lenX = x.length;
    const lenY = y.length;
    const fullLen = lenX + lenY - 1;

    // next pow2 >= fullLen
    const n = nextPow2(fullLen);

    // zero-pad inputs to length n
    const xP = new Float32Array(n);
    const yP = new Float32Array(n);
    xP.set(x, 0);
    yP.set(y, 0);

    const fft = new FFT(n);
    const A = fft.createComplexArray();
    const B = fft.createComplexArray();

    // forward real FFTs
    fft.realTransform(A, xP);
    fft.realTransform(B, yP);
        // complete the spectrum to full complex arrays (negative freqs)
    if (typeof fft.completeSpectrum === 'function') {
        fft.completeSpectrum(A);
        fft.completeSpectrum(B);
    }

    // multiply A * B -> convolution spectrum
    const C = fft.createComplexArray();
    for (let k = 0; k < n; k++) {
        const ar = A[2 * k], ai = A[2 * k + 1];
        const br = B[2 * k], bi = B[2 * k + 1];
        C[2 * k] = ar * br - ai * bi;
        C[2 * k + 1] = ai * br + ar * bi;
    }

    // inverse FFT
    const out = fft.createComplexArray();
    fft.inverseTransform(out, C);

    // extract real part and normalize by n
    const result = new Float64Array(fullLen);
    for (let i = 0; i < fullLen; i++) {
        result[i] = out[2 * i];
    }

    // return 'same' mode (centered, matching first input length)
    if (mode === 'same') {
        const start = Math.floor((fullLen - lenX) / 2);
        return Array.from(result).slice(start, start + lenX);
    }

    return Array.from(result);
}

export interface ImpulseResponseResult {
    ir: Array<number>;
    ir_complex: Array<number>;
    t: Array<number>;
    peakAt: number;
    sampleRate: number;
    fftSize: number;
}


function max(arr: Array<number>): number {
    let maxVal = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] > maxVal) {
            maxVal = Math.abs(arr[i]);
        }
    }
    return maxVal;
}

function normalizeToMax(arr: Array<number>): Array<number> {
    const maxVal = max(arr);
    if (maxVal === 0) return arr.slice(); // avoid division by zero
    return arr.map(v => v / maxVal);
}


class Farina {
    /* Farina deconvolution implementation according to the Python implementation: 
    class Farina():
        """Farina method."""

        def __init__(self, stim, f_start=50, f_stop=22800, fs=48000):
            self.stimulus = np.trim_zeros(stim)
            self.f_start = f_start
            self.f_stop = f_stop
            self.fs = fs
            self.last_instant = 0

            self.deconv_signal = []
            self.deconv_hash = 0

        def lag_of_harmonic(self, n: np.ndarray):
            return self.ell*np.log(n)

        def margin_of_harmonic(self, n: np.ndarray):
            return self.ell*np.log(n+1)-self.ell*np.log(n)

        def max_safe_harmonic(self, window_size: float):
            t = [
                self.margin_of_harmonic(n)
                for n in range(1, 1000)
                if self.margin_of_harmonic(n) > window_size
            ]
            return len(t) if len(t) < 999 else None

        def rate(self, length):
            return 1/self.f_start*np.pi*np.round(length*self.f_start/np.log2(
                self.f_stop/self.f_start))

        def deconvolution(self, signal):
            if hash(signal.tostring()) == self.deconv_hash:
            return self.deconv_signal
            bins = scipy.fftpack.helper.next_fast_len(len(signal))
            ratio = self.f_stop/self.f_start
            kend = 10**((-6*np.log2(ratio))/20)
            k = np.log(kend)/self.duration
            t = np.arange(0, 255788)/self.fs
            k = np.exp(-t*k)
            inv_stimulus = self.stimulus[-1::-1]/k/np.max(self.stimulus)

            #signal_fft = scipy.fft(signal, bins)/np.sqrt(len(signal))
            #stimulus_fft = scipy.fft(inv_stimulus, bins)/np.sqrt(len(inv_stimulus))

            #h_fft = signal_fft*stimulus_fft.T

            self.deconv_signal = scipy.signal.fftconvolve(signal, inv_stimulus, 'same')[-1::-1]/np.sqrt(len(signal))/58.5 ##scipy.ifft(h_fft)[::-1]*np.sqrt(len(h_fft))
            self.deconv_hash = hash(signal.tostring())
            return self.deconv_signal

        def impulse_response(self, signal):
            bins = scipy.fftpack.helper.next_fast_len(len(signal))

            signal_fft = scipy.fft(signal, bins)
            stimulus_fft = scipy.fft(self.stimulus, bins)
            h_fft = signal_fft/stimulus_fft.T

            h = scipy.ifft(h_fft)
            return h

        @property
        def duration(self):
            return len(np.trim_zeros(self.stimulus))/self.fs

        def window(self, signal, at, length):
            w = scipy.signal.windows.tukey(int(length * 2 * self.fs), 0.2)
            size = int(length * self.fs)
            sig = self.deconvolution(signal)
            #print(at - size)
            #print(at + size)
            si = sig[at - size:at + size]

            if len(si) == len(w):
            return w*si.T
            else:
            return np.zeros_like(w)

        def frequency_response(self, signal, length, num):
            signal = np.pad(signal, (int(length * self.fs),int(length * self.fs)), 'constant')
            print(self.instant(signal) + int(self.lag_of_harmonic(num) * self.fs))
            signal = self.window(signal, self.instant(signal) + int(self.lag_of_harmonic(num) * self.fs), length)

            bins = scipy.fftpack.helper.next_fast_len(len(signal))
            et = np.abs(np.fft.fft(signal, bins))[0:int(bins/2+1)]
            return et, np.fft.rfftfreq(bins)*self.fs

        def instant(self, signal = None):
            if signal is not None:
            self.last_instant = np.argmax(self.deconvolution(signal))
            if self.instant == 0:
            print('No delay in signal.')
            return self.last_instant

        @property
        def ell(self):
            return 255788/np.log(self.f_stop/self.f_start)/self.fs
    */
    constructor(stimulus: Float32Array, f_start: number = 50, f_stop: number = 22800, fs: number = 48000) {
        this.f_start = f_start;
        this.f_stop = f_stop;
        this.fs = fs;
        this.stimulus = stimulus;
    }

    f_start: number;
    f_stop: number;
    fs: number;
    stimulus: Float32Array;

    lag_of_harmonic(n: number) {
        return this.ell() * Math.log(n);
    }

    margin_of_harmonic(n: number) {
        return this.ell() * Math.log(n + 1) - this.ell() * Math.log(n);
    }

    max_safe_harmonic(window_size: number): number | null {
        const t: number[] = [];
        for (let n = 1; n < 1000; n++) {
            if (this.margin_of_harmonic(n) > window_size) {
                t.push(this.margin_of_harmonic(n));
            }
        }
        return t.length < 999 ? t.length : null;
    }

    ell(): number {
        return 255788 / Math.log(this.f_stop / this.f_start) / this.fs;
    }

    rate(length: number): number {
        return 1 / this.f_start * Math.PI * Math.round(length * this.f_start / Math.log2(this.f_stop / this.f_start));
    }

    duration(): number {
        return this.stimulus.filter(v => v !== 0).length / this.fs;
    }

    window(signal: Float32Array, at: number, length: number): Float32Array {
        const size = Math.floor(length * this.fs);
        const window: Array<number> = getSelectedWindow('hanning', size);
        const sig = this.deconvolution(signal);
        const si = sig.slice(at - size, at + size);
        const w = new Float32Array(size);
        if (si.length === window.length) {
            for (let i = 0; i < window.length; i++) {
                w[i] = window[i] * si[i];
            }
            return w;
        } else {
            return new Float32Array(window.length); // zeros
        }        
    }

    deconvolution(signal: Float32Array): Float32Array {
        const fftSize = nextPow2(signal.length);
        const ratio = this.f_stop / this.f_start;
        const kend = Math.pow(10, (-6 * Math.log2(ratio)) / 20);
        const k = Math.log(kend) / this.duration();
        const t = new Float32Array(255788);
        for (let i = 0; i < t.length; i++) {
            t[i] = i / this.fs;
        }
        const exp_k = new Float32Array(t.length);
        for (let i = 0; i < t.length; i++) {
            exp_k[i] = Math.exp(-t[i] * k);
        }

        const inv_stimulus = new Float32Array(this.stimulus.length);
        const maxStimulus = max(Array.from(this.stimulus));
        for (let i = 0; i < this.stimulus.length; i++) {
            inv_stimulus[i] = this.stimulus[this.stimulus.length - 1 - i] / exp_k[i] / maxStimulus;
        }

        const convolved = fftConvolve(signal, inv_stimulus, 'same');
        const deconv_signal = new Float32Array(convolved.length);
        for (let i = 0; i < convolved.length; i++) {
            deconv_signal[i] = convolved[convolved.length - 1 - i] / Math.sqrt(signal.length) / 58.5;
        }
        return deconv_signal;
    }
    
    
}

export function FarinaImpulseResponse(y: number[] | Float32Array, x: number[] | Float32Array): ImpulseResponseResult {
    const n: number[] = linspace(0, x.length - 1, x.length);
    const ratio: number = Math.log(22800 / 50);
    const duration = x.length / 48000; // assuming 48kHz.
    const k: number[] = n.map(v => Math.exp(v * ratio / x.length)); // simplified for first element
    
    const L = duration / ratio;
    const rate = Math.log(10) * L;

    const x_inv: Float32Array = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
        x_inv[i] = x[x.length - 1 - i] / k[i];
    }

    const measurementResponse = fftConvolve(y, x_inv, 'same');
    const stimulusResponse = fftConvolve(x, x_inv, 'same');
    const norm: number = Array.from(stimulusResponse).reduce((a, b) => Math.max(a, Math.abs(b)), 0);
    
    let sums: number = 0;
    for (let i = 0; i < stimulusResponse.length; i++) {
        sums += stimulusResponse[i];
    }
    // Real part / N gives impulse response. This is shifted by N/2.
    const rmss = sum(x_inv) * 2 * y.length / x_inv.length; // RMS of input signal
    const ir = Array.from(new Float32Array(measurementResponse.length));
    for (let i = 0; i < measurementResponse.length; i++) {
        ir[i] = measurementResponse[i] / norm; // normalize by input length
    }

    const ir_complex = Array.from(new Float32Array(measurementResponse.length * 2));
    for (let i = 0; i < measurementResponse.length; i++) {
        ir_complex[2 * i] = measurementResponse[i] / norm; // normalize by input length
        ir_complex[2 * i + 1] = 0;
    }

    const peakAt = closest(100000000, ir) + (-measurementResponse.length) / 2;
    /* const ir_complex = Array.from(measurementResponse); // copy
    for (let i = 0; i < N; i++) {
        ir_complex[2 * i] = measurementResponse[2 * mod(i + peakAt, N)];
        ir_complex[2 * i + 1] = measurementResponse[2 * mod(i + peakAt, N) + 1];
    }*/

    return {
        ir,
        ir_complex,
        t: Array.from(linspace((-measurementResponse.length - 1) / 2 / 48000, (measurementResponse.length - 1) / 2 / 48000, measurementResponse.length)), // assuming 48kHz
        peakAt,
        sampleRate: 48000,
        fftSize: measurementResponse.length,
    };
}


export function twoChannelImpulseResponse(y: number[] | Float32Array, x: number[] | Float32Array): ImpulseResponseResult {
    // Calculate the impulse response by taking the IFFT of the division of the FFTs of output and input signals.
    const fullLen = y.length + x.length - 1;
    
    const N = nextPow2(fullLen);

    // zero-pad inputs to length n
    const xP = new Float32Array(N);
    const yP = new Float32Array(N);
    xP.set(y, 0);
    yP.set(x, 0);

    const fft = new FFT(N);
    const A = fft.createComplexArray();
    const B = fft.createComplexArray();

    // forward real FFTs
    fft.realTransform(A, xP);
    fft.realTransform(B, yP);

    // Division A / B with regularization to avoid division by zero
    const C = fft.createComplexArray();
    const epsilon = 1e-20;
    for (let k = 0; k < N; k++) {
        const ar = A[2 * k], ai = A[2 * k + 1];
        const br = B[2 * k], bi = B[2 * k + 1];
        const denom = br * br + bi * bi + epsilon;
        C[2 * k] = (ar * br + ai * bi) / denom;
        C[2 * k + 1] = (ai * br - ar * bi) / denom;
    }

    // inverse FFT of cross-spectrum
    const out = fft.createComplexArray();
    fft.inverseTransform(out, C);

    // Real part / N gives impulse response. This is shifted by N/2.
    const ir = Array.from(new Float32Array(N));
    for (let i = 0; i < N; i++) {
        ir[i] = out[2 * (( i + N / 2) % N)]; // normalize by input length
    }

    const peakAt = closest(100000000, ir) + (-N) / 2;
    const ir_complex = out.slice(); // copy
    for (let i = 0; i < N; i++) {
        ir_complex[2 * i] = out[2 * mod(i + peakAt, N)];
        ir_complex[2 * i + 1] = out[2 * mod(i + peakAt, N) + 1];
    }

    // Remove DC offset.
    const mean = average(ir)
    for (let i = 0; i < N; i++) {
        ir[i] = ir[i] - mean;
    }

    return {
        ir,
        ir_complex,
        t: Array.from(linspace((-N - 1) / 2 / 48000, (N - 1) / 2 / 48000, N)), // assuming 48kHz
        peakAt,
        sampleRate: 48000,
        fftSize: N,
    };
}

export function twoChannelFFT(dataArray: number[] | Float32Array, reference: number[] | Float32Array, fftSize: number, offset: number): FFTResult {
    const dataPadded = new Float32Array(fftSize);
    const referencePadded = new Float32Array(fftSize);

    if (offset >= 0) {
        referencePadded.set(reference.slice(0, Math.min(reference.length, fftSize) - offset), offset);
        dataPadded.set(dataArray.slice(0, Math.min(dataArray.length, fftSize)), 0);
    } else {
        referencePadded.set(reference.slice(0, Math.min(reference.length, fftSize)), 0);
        dataPadded.set(dataArray.slice(-offset, Math.min(dataArray.length, fftSize) + offset), -offset);
    }

    //const rmss = rms(referencePadded);
    const reference_ = computeFFT(referencePadded);  // Avoid log(0)
    const signal_ = computeFFT(dataPadded);
    const signalMags = signal_.magnitude.map(v => 20 * Math.log10(v === 0 ? 1e-20 : v));
    const referenceMags = reference_.magnitude.map(v => 20 * Math.log10(v === 0 ? 1e-20 : v));
    const h = referenceMags.map((v, i) => signalMags[i] - v); // dB difference
    const frequency = linspace(0, 48000 / 2, h.length);

    // For phase, align the reference and signal using a fixed offset (26718 samples for 1m @ 340m/s and 48kHz)
    // This is a hack to get a reasonable phase response for the measurement setup
    // In a real application, use cross-correlation to find the delay between signals

    const i_50 = closest(50, frequency); // Example usage of closest function
    const phase_signal = signal_.phase;
    const phase_reference = reference_.phase;
    // phase difference (unwrap phases first)
    const sphase = unwrapPhase(phase_signal.map((v, i) => v - phase_reference[i])); // phase difference in radians
    const correction = (Math.floor(sphase[i_50] / (2 * Math.PI) + 0.5)) * (2 * Math.PI);
    const phase = sphase.map(v => (v - correction)); // relative to 50 Hz

    // simple phase unwrapping (returns Float32Array)
    function unwrapPhase(phases: number[]): Array<number> {
        const N = phases.length;
        const out = Array.from(new Float32Array(N));
        if (N === 0) return out;
        out[0] = phases[0];
        let offset = 0;
        const theta = Math.PI; // unwrapping threshold
        for (let i = 1; i < N; i++) {
            let delta = phases[i] - phases[i - 1];
            if (delta > theta) {
                offset -= 2 * Math.PI;
            } else if (delta < -theta) {
                offset += 2 * Math.PI;
            }
            out[i] = phases[i] + offset;
        }
        return out;
    }

    return {
        frequency,
        magnitude: h,
        phase,
        fftSize
    };
}

export function computeFFTFromIR(ir: ImpulseResponseResult, f_phase_wrap: number = 50): FFTResult {
    const magnitude: number[] = [];
    const phase: number[] = [];

    const N = nextPow2(ir.ir.length);
    console.log(`Computing FFT from IR with size ${N}`);
    
    const fft = new FFT(N);
    const out = fft.createComplexArray();

    if (ir.ir_complex[1] === 0) {
        console.log("IR is in real format, converting to complex");
        // real IR, convert to complex
        const frame = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            frame[i] = (ir.ir_complex[2 * i] || 0) * 1;
        }
        fft.realTransform(out, frame);
    } else {
        fft.transform(out, ir.ir_complex);
    }
    console.log(ir.ir_complex);
    
    for (let i = 0; i < N / 2; i++) {
        const re = out[2 * i];
        const im = out[2 * i + 1];
        magnitude[i] = abs(re, im);
        phase[i] = Math.atan2(im, re); // phase in radians, range [-PI, PI].
    }
    const frequency = linspace(0, 48000 / 2, magnitude.length);

    const i_norm = closest(f_phase_wrap, frequency); // Example usage of closest function
    // phase difference (unwrap phases first)
    const unwraped_phase = unwrapPhase(phase); // phase difference in radians
    const correction = (Math.floor(unwraped_phase[i_norm] / (2 * Math.PI) + 0.5)) * (2 * Math.PI);
    const corrected_unwraped_phase = unwraped_phase.map(v => (v - correction)); // relative to 50 Hz

    // simple phase unwrapping (returns Float32Array)
    function unwrapPhase(phases: number[]): Array<number> {
        const N = phases.length;
        const out = Array.from(new Float32Array(N));
        if (N === 0) return out;
        out[0] = phases[0];
        let offset = 0;
        for (let i = 1; i < N; i++) {
            let delta = phases[i] - phases[i - 1];
            if (delta > Math.PI) {
                offset -= 2 * Math.PI;
            } else if (delta < -Math.PI) {
                offset += 2 * Math.PI;
            }
            out[i] = phases[i] + offset;
        }
        return out;
    }

    return {
        frequency,
        magnitude,
        phase: corrected_unwraped_phase.map(v => v / Math.PI * 180),
        fftSize: N,
    };
}

export const A_WEIGHTING_COEFFICIENTS: [number[], number[]] = [
    [0.234301792299513, -0.468603584599026, -0.234301792299513, 0.937207169198054, -0.234301792299515, -0.468603584599025, 0.234301792299513],
    [1.000000000000000, -4.113043408775871, 6.553121752655047, -4.990849294163381, 1.785737302937573, -0.246190595319487, 0.011224250033231],
];
// Coefficients for K-weighting filter (pre-emphasis and high-frequency shelving)
// From ITU-R BS.1770-4, Table 1
// https://www.itu.int/dms_pubrec/itu-r/rec/bs/r-rec-bs.1770-2-201103-s!!pdf-e.pdf
export const K_WEIGHTING_COEFFICIENTS_PRE: [number[], number[]] = [
    [1.53512485958697, -2.69169618940638, 1.19839281085285],
    [1, -1.69065929318241, 0.73248077421585]
];

export const K_WEIGHTING_COEFFICIENTS_RLB: [number[], number[]] = [
    [1.0, -2.0, 1.0],
    [1, -1.99004745483398, 0.99007225036621]
];

export function applyAWeightingToBuffer(buffer: Float32Array, zi: number[]): Float32Array {
    const b = A_WEIGHTING_COEFFICIENTS[0];
    const a = A_WEIGHTING_COEFFICIENTS[1];
    const output = new Float32Array(buffer.length);
    for (let n = 0; n < buffer.length; n++) {
        output[n] = b[0] * buffer[n] + zi[0];
        for (let i = 1; i < b.length; i++) {
            zi[i - 1] = b[i] * buffer[n] + zi[i] - a[i] * output[n];
        }
    }
    return output;
}

export function gateBuffer(buffer: Float32Array, sampleRate: number, thresholdDb: number = -70, blockMs: number = 400, overlap: number = 0.75): Float32Array {
    const blockSize = Math.floor((blockMs / 1000) * sampleRate);
    const hopSize = Math.floor(blockSize * (1 - overlap));
    const threshold = dbToLinear(thresholdDb);

    const gated = new Float32Array(buffer.length);
    let i = 0;

    while (i < buffer.length) {
        const start = i;
        const end = Math.min(i + blockSize, buffer.length);
        const block = buffer.subarray(start, end);
        const blockRms = rms(block);

        if (blockRms >= threshold) {
            gated.set(block, start);
        }
        // else: leave zeros (gate closed)

        i += hopSize;
    }

    return gated;
}

/**
 * Calculate ITU-R BS.1770-4 loudness (LKFS/LUFS) for a mono or stereo buffer.
 * https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-5-202311-I!!PDF-E.pdf
 * @param input - Mono buffer or array of channel buffers.
 * @param sampleRate - Sample rate in Hz.
 * @returns Integrated loudness in LUFS.
 */
export function bs1770Loudness(input: Float32Array | Float32Array[], sampleRate: number): number {
    // K-weighting filter coefficients (biquad, 2nd order)
    // From ITU-R BS.1770-4, Table 1
    const b = [1.53512485958697, -2.69169618940638, 1.19839281085285];
    const a = [1, -1.69065929318241, 0.73248077421585];

    // Helper: apply biquad filter to a buffer
    function biquadFilter(buffer: Float32Array, b: number[], a: number[]): Float32Array {
        const out = new Float32Array(buffer.length);
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let n = 0; n < buffer.length; n++) {
            const x0 = buffer[n];
            const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
            out[n] = y0;
            x2 = x1; x1 = x0;
            y2 = y1; y1 = y0;
        }
        return out;
    }

    // Accept mono or stereo
    let channels: Float32Array[];
    if (Array.isArray(input)) {
        channels = input;
    } else {
        channels = [input];
    }

    // Apply K-weighting filter to each channel
    const filtered = channels.map(ch => biquadFilter(ch, b, a));

    // Gating parameters
    const windowMs = 400;
    const windowSize = Math.floor(windowMs * sampleRate / 1000);
    const overlapRatio = 0.75;
    const hopSize = Math.floor(windowSize * (1 - overlapRatio));
    const absoluteGate = dbToLinear(-70);
    const relativeGateOffset = -10; // dB

    // Calculate channel weights (ITU: [1, 1] for stereo)
    const weights = channels.length === 2 ? [1, 1] : [1];

    // Calculate block energies
    let energies: number[] = [];
    for (let i = 0; i + windowSize <= filtered[0].length; i += hopSize) {
        let sum = 0;
        for (let ch = 0; ch < filtered.length; ch++) {
            const block = filtered[ch].subarray(i, i + windowSize);
            const blockSum = block.reduce((acc, v) => acc + v * v, 0);
            sum += weights[ch] * blockSum;
        }
        const energy = sum / (windowSize * weights.reduce((a, b) => a + b, 0));
        energies.push(energy);
    }

    // Absolute gating
    const gatedEnergies = energies.filter(e => e >= absoluteGate);

    if (gatedEnergies.length === 0) return -Infinity;

    // Relative gating
    const meanEnergy = gatedEnergies.reduce((a, b) => a + b, 0) / gatedEnergies.length;
    const relativeGate = meanEnergy * dbToLinear(relativeGateOffset);
    const finalEnergies = gatedEnergies.filter(e => e >= relativeGate);

    if (finalEnergies.length === 0) return -Infinity;

    // Integrated loudness (LUFS)
    const integrated = finalEnergies.reduce((a, b) => a + b, 0) / finalEnergies.length;
    return linearToDb(Math.sqrt(integrated));
}
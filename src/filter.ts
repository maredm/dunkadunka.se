/**
 * /c:/Users/edmark/Documents/projekt_dunka_dunka/static/modules/filter.ts
 *
 * Utilities for creating biquad filter coefficients (RBJ cookbook)
 * and for creating a WebAudio BiquadFilterNode from freq, Q and gain.
 *
 * Exports:
 * - createBiquadCoefficients({ type, freq, Q, gain, sampleRate })
 * - createWebAudioBiquad(audioCtx, { type, freq, Q, gain })
 */
 
import { linspace } from './math.js';
import { FFT } from './fft.js';

const DEFAULT_SR = 44100;

function clampFreq(freq: number, sr: number): number {
    const nyq = sr / 2;
    return Math.max(0, Math.min(freq, nyq - 1e-6));
}

interface BiquadCoefficients {
    type: string;
    sampleRate: number;
    freq: number;
    Q: number;
    gain: number;
    b: number[];
    a: number[];
    raw: {
        b0: number;
        b1: number;
        b2: number;
        a0: number;
        a1: number;
        a2: number;
    };
}

interface FrequencyResponse {
    mags: Float32Array;
    frequencies: Float32Array;
}

interface ComplexSpectrum {
    re: Float32Array | number[];
    im?: Float32Array | number[];
}

type BiquadType =
    | 'lowpass'
    | 'highpass'
    | 'bandpass'
    | 'notch'
    | 'allpass'
    | 'peaking'
    | 'lowshelf'
    | 'highshelf'
    | 'gain';

type WindowType = 'hann' | 'rect';

export class IIRFilter {
    z1: number = 0;
    z2: number = 0;
    freq: number;
    Q: number;
    gain: number;
    sampleRate: number;
    type: BiquadType;

    constructor(
        freq: number,
        Q: number,
        gain: number,
        sampleRate: number,
        type: BiquadType
    ) {
        this.z1 = 0;
        this.z2 = 0;
        this.freq = freq;
        this.Q = Q;
        this.gain = gain;
        this.sampleRate = sampleRate || DEFAULT_SR;
        this.type = type;
    }

    get coefficients(): BiquadCoefficients {
        return createBiquadCoefficients(
            this.type,
            this.freq,
            this.Q,
            this.gain,
            this.sampleRate
        );
    }

    getFrequencyResponse(fftSize: number = 8192): [Float32Array, Float32Array] {
        // get coefficients (avoid using possibly-broken getter)
        const coeffs = this.coefficients;
        const nyq = this.sampleRate / 2;
        const sampleRate = this.sampleRate;
        const maxFreq = nyq;
        const minFreq = 0.1;

        // helpers
        const logMin = Math.log10(minFreq);
        const logMax = Math.log10(maxFreq);
        const frequencies = linspace(0, 48000 / 2, fftSize);

        // compute magnitude response (dB);
        const mags = new Float32Array(fftSize);
        for (let i = 0; i < fftSize; i++) {
            const f = frequencies[i];
            const w = 2 * Math.PI * f / sampleRate;
            const cosw = Math.cos(w);
            const sinw = Math.sin(w);
            const cos2w = Math.cos(2 * w);
            const sin2w = Math.sin(2 * w);

            // B(e^-jw) = b0 + b1 e^-jw + b2 e^-j2w
            const Br = coeffs.b[0] + coeffs.b[1] * cosw + coeffs.b[2] * cos2w;
            const Bi = -(coeffs.b[1] * sinw + coeffs.b[2] * sin2w);
            // A(e^-jw) = 1 + a1 e^-jw + a2 e^-j2w
            const Ar = coeffs.a[0] + coeffs.a[1] * cosw + coeffs.a[2] * cos2w;
            const Ai = -(coeffs.a[1] * sinw + coeffs.a[2] * sin2w);

            const numMag = Math.hypot(Br, Bi);
            const denMag = Math.hypot(Ar, Ai) || 1e-20;
            const mag = numMag / denMag;
            let db = 20 * Math.log10(Math.max(1e-20, mag));

            frequencies[i] = f;
            mags[i] = db;
        }
        return [mags, frequencies];
    }
}

/**
 * Create biquad filter coefficients using the RBJ cookbook formulas.
 * Reference: https://www.w3.org/TR/audio-eq-cookbook/
 *
 * Supported filter types:
 * - lowpass
 * - highpass
 * - bandpass
 * - notch
 * - allpass
 * - peaking (peakingEQ)
 * - lowshelf
 * - highshelf
 *
 * @param {Object} options
 * @param {string} type - Filter type (see above)
 * @param {number} freq - Center/cutoff frequency in Hz
 * @param {number} Q - Quality factor (resonance)
 * @param {number} gain - Gain in dB (for peaking and shelving filters)
 * @param {number} sampleRate - Sample rate in Hz (default 44100)
 * @returns {Object} Coefficients and parameters
 */

function createBiquadCoefficients(
    type: BiquadType = 'peaking',
    freq: number = 1000,
    Q: number = 1,
    gain: number = 0, // in dB (used by peaking and shelving)
    sampleRate: number = DEFAULT_SR
): BiquadCoefficients {
    const sr = sampleRate || DEFAULT_SR;
    freq = clampFreq(freq, sr);
    const w0 = 2 * Math.PI * freq / sr;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const A = Math.pow(10, gain / 40); // amplitude for peaking/shelf
    const alpha = sinw0 / (2 * Q);
    const sqrtA = Math.sqrt(A);

    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

    switch (type) {
        case 'lowpass':
            b0 = (1 - cosw0) / 2;
            b1 = 1 - cosw0;
            b2 = (1 - cosw0) / 2;
            a0 = 1 + alpha;
            a1 = -2 * cosw0;
            a2 = 1 - alpha;
            break;

        case 'highpass':
            b0 = (1 + cosw0) / 2;
            b1 = -(1 + cosw0);
            b2 = (1 + cosw0) / 2;
            a0 = 1 + alpha;
            a1 = -2 * cosw0;
            a2 = 1 - alpha;
            break;

        case 'bandpass':
            // constant skirt gain, peak = Q
            b0 = alpha;
            b1 = 0;
            b2 = -alpha;
            a0 = 1 + alpha;
            a1 = -2 * cosw0;
            a2 = 1 - alpha;
            break;

        case 'notch':
            b0 = 1;
            b1 = -2 * cosw0;
            b2 = 1;
            a0 = 1 + alpha;
            a1 = -2 * cosw0;
            a2 = 1 - alpha;
            break;

        case 'allpass':
            b0 = 1 - alpha;
            b1 = -2 * cosw0;
            b2 = 1 + alpha;
            a0 = 1 + alpha;
            a1 = -2 * cosw0;
            a2 = 1 - alpha;
            break;

        case 'peaking':
            b0 = 1 + alpha * A;
            b1 = -2 * cosw0;
            b2 = 1 - alpha * A;
            a0 = 1 + alpha / A;
            a1 = -2 * cosw0;
            a2 = 1 - alpha / A;
            break;

        case 'lowshelf':
            b0 = A * ((A + 1) - (A - 1) * cosw0 + 2 * sqrtA * alpha);
            b1 = 2 * A * ((A - 1) - (A + 1) * cosw0);
            b2 = A * ((A + 1) - (A - 1) * cosw0 - 2 * sqrtA * alpha);
            a0 = (A + 1) + (A - 1) * cosw0 + 2 * sqrtA * alpha;
            a1 = -2 * ((A - 1) + (A + 1) * cosw0);
            a2 = (A + 1) + (A - 1) * cosw0 - 2 * sqrtA * alpha;
            break;

        case 'highshelf':
            b0 = A * ((A + 1) + (A - 1) * cosw0 + 2 * sqrtA * alpha);
            b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
            b2 = A * ((A + 1) + (A - 1) * cosw0 - 2 * sqrtA * alpha);
            a0 = (A + 1) - (A - 1) * cosw0 + 2 * sqrtA * alpha;
            a1 = 2 * ((A - 1) - (A + 1) * cosw0);
            a2 = (A + 1) - (A - 1) * cosw0 - 2 * sqrtA * alpha;
            break;

        case 'gain':
            a0 = 1;
            a1 = 0;
            a2 = 0;
            b0 = gain;
            b1 = 0;
            b2 = 0;
            break;

        default:
            throw new Error('Unsupported biquad type: ' + type);
    }

    // normalize so a0 = 1
    const nb0 = b0 / a0;
    const nb1 = b1 / a0;
    const nb2 = b2 / a0;
    const na1 = a1 / a0;
    const na2 = a2 / a0;

    return {
        type,
        sampleRate: sr,
        freq,
        Q,
        gain,
        b: [nb0, nb1, nb2],
        a: [1, na1, na2], // a[0] is 1
        // also expose raw (unnormalized) if needed:
        raw: { b0, b1, b2, a0, a1, a2 }
    };
}

/**
 * Helper to create a WebAudio BiquadFilterNode configured from params.
 * Use this when working with AudioContext; WebAudio natively supports
 * filter types and parameters, but this helper simplifies creation.
 */
function createWebAudioBiquad(
    audioCtx: AudioContext,
    {
        type = 'peaking',
        freq = 1000,
        Q = 1,
        gain = 0
    }: {
        type?: BiquadType;
        freq?: number;
        Q?: number;
        gain?: number;
    } = {}
): BiquadFilterNode {
    if (!audioCtx || typeof audioCtx.createBiquadFilter !== 'function') {
        throw new Error('Valid AudioContext required');
    }
    const f = audioCtx.createBiquadFilter();
    // map some friendly type names to WebAudio names
    const typeMap: Record<BiquadType, BiquadFilterType> = {
        lowpass: 'lowpass',
        highpass: 'highpass',
        bandpass: 'bandpass',
        notch: 'notch',
        allpass: 'allpass',
        peaking: 'peaking',
        lowshelf: 'lowshelf',
        highshelf: 'highshelf',
        gain: 'lowpass' // fallback for unsupported type
    };
    f.type = typeMap[type] || type;
    f.frequency.value = freq;
    if ('Q' in f) f.Q.value = Q;
    if ('gain' in f) f.gain.value = gain;
    return f;
}

/**
 * Create an FIR impulse response from frequency-domain samples (FFT)
 * Optionally perform Kirkeby-regularized division by a reference spectrum
 * (useful for inverse filtering / equalization).
 *
 * Inputs:
 * - target: { re: Float32Array|Array, im: Float32Array|Array }  -- length N
 *      Complex frequency response you want (D(ω)). If you only have
 *      magnitudes and want linear-phase FIR, set im to zeros and provide
 *      a hermitian-symmetric magnitude/phase pair.
 * - reference (optional): { re, im } -- length N
 *      If provided, output H(ω) = (D * conj(G)) / (|G|^2 + eps)  (Kirkeby)
 * - fftSize (optional): N (will be inferred from target.re.length)
 * - taps (optional): desired FIR length (odd/even allowed)
 * - kirkebyEps (optional): regularization constant (default 1e-6)
 * - window (optional): 'hann' or 'rect' (default 'hann')
 *
 * Returns: Float32Array length = taps containing the real impulse response.
 */
export function createFIRFromFFT({
    target,
    reference = null,
    fftSize = null,
    taps = 513,
    kirkebyEps = 1e-6,
    window = 'hann'
}: {
    target: ComplexSpectrum;
    reference?: ComplexSpectrum | null;
    fftSize?: number | null;
    taps?: number;
    kirkebyEps?: number;
    window?: WindowType;
} = {}): Float32Array {
    if (!target || !target.re || (!Array.isArray(target.re) && !(target.re instanceof Float32Array))) {
        throw new Error('target must be an object { re, im } with array-like re');
    }
    const N = fftSize || target.re.length;
    const tRe = target.re;
    const tIm = target.im || new Float32Array(N).fill(0);

    // normalize arrays to length N (if shorter, pad with zeros)
    const pad = (arr: Float32Array | number[]): Float32Array => {
        if (arr.length === N) return arr instanceof Float32Array ? arr : new Float32Array(arr);
        const out = new Float32Array(N);
        const slice = arr instanceof Float32Array ? arr.subarray(0, Math.min(arr.length, N)) : arr.slice(0, Math.min(arr.length, N));
        out.set(slice);
        return out;
    };
    const Tre = pad(tRe);
    const Tim = pad(tIm);

    let Gre: Float32Array | null = null;
    let Gim: Float32Array | null = null;
    if (reference && reference.re) {
        Gre = pad(reference.re);
        Gim = pad(reference.im || new Float32Array(N));
    }

    // Compute frequency-domain H according to Kirkeby regularization if reference provided:
    // H = (T * conj(G)) / (|G|^2 + eps)
    const Hre = new Float32Array(N);
    const Him = new Float32Array(N);

    if (Gre) {
        for (let k = 0; k < N; k++) {
            const tr = Tre[k],
                ti = Tim[k];
            const gr = Gre[k],
                gi = Gim![k];
            const denom = gr * gr + gi * gi + kirkebyEps;
            // numerator = T * conj(G) = (tr + j ti) * (gr - j gi)
            const nr = tr * gr + ti * gi;
            const ni = ti * gr - tr * gi;
            Hre[k] = nr / denom;
            Him[k] = ni / denom;
        }
    } else {
        // Copy target into H
        Hre.set(Tre);
        Him.set(Tim);
    }

    // Enforce Hermitian symmetry so inverse DFT yields real impulse:
    // H[N-k] = conj(H[k]), for k = 1..N-1
    // Keep H[0] and H[N/2] (if exists) real-valued by zeroing small imag.
    const epsImag = 1e-20;
    for (let k = 1; k < Math.floor((N + 1) / 2); k++) {
        const rk = Hre[k],
            ik = Him[k];
        const mirror = N - k;
        Hre[mirror] = rk;
        Him[mirror] = -ik;
    }
    // Make H[0] purely real
    Him[0] = 0;
    if (N % 2 === 0) Him[N / 2] = 0;

    // Inverse DFT (direct O(N^2) implementation).
    // h[n] = (1/N) * sum_{k=0..N-1} (Re(Hk) * cos(2π k n / N) - Im(Hk) * sin(2π k n / N))
    const hTime = new Float32Array(N);
    const TWO_PI = 2 * Math.PI;
    for (let n = 0; n < N; n++) {
        let sum = 0;
        for (let k = 0; k < N; k++) {
            const angle = (TWO_PI * k * n) / N;
            const c = Math.cos(angle);
            const s = Math.sin(angle);
            sum += Hre[k] * c - Him[k] * s;
        }
        hTime[n] = sum / N;
    }

    // Circularly shift by N/2 to center impulse (linear-phase alignment)
    const shift = Math.floor(N / 2);
    const hShift = new Float32Array(N);
    for (let n = 0; n < N; n++) {
        hShift[n] = hTime[(n + shift) % N];
    }

    // Extract first `taps` samples (centered impulse truncated). If taps > N, zero-pad.
    const out = new Float32Array(taps);
    const take = Math.min(taps, N);
    out.set(hShift.subarray(0, take));

    // Apply window to reduce truncation ripples
    if (window === 'hann') {
        if (taps === 1) return out;
        for (let n = 0; n < taps; n++) {
            const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (taps - 1)));
            out[n] *= w;
        }
    } // 'rect' => do nothing

    return out;
}

export function firToMinPhase(
    input: Float32Array | number[],
    { fftSize = null, eps = 1e-12 }: { fftSize?: number | null; eps?: number } = {}
): Float32Array {
    // Ensure input is Float32Array
    const hIn = input instanceof Float32Array ? input : new Float32Array(input);
    const L = hIn.length;

    // Choose FFT length: provided or next power-of-two >= 2*L
    const minN = Math.max(16, 1 << Math.ceil(Math.log2(Math.max(1, 2 * L))));
    const N = fftSize ? fftSize : minN;

    // Zero-pad input to length N (real time-domain)
    const x = new Float32Array(N);
    x.set(hIn);

    const fft = new FFT(N);

    // Forward real FFT: X(k) stored interleaved [Re0, Im0, Re1, Im1, ...]
    const Xc = new Float32Array(2 * N);
    fft.realTransform(Xc, x);
    // Ensure full spectrum mirrored (some implementations require this)
    if (typeof fft.completeSpectrum === 'function') {
        fft.completeSpectrum(Xc);
    }

    // Compute log-magnitude spectrum
    const logMag = new Float32Array(N);
    for (let k = 0; k < N; k++) {
        const re = Xc[2 * k];
        const im = Xc[2 * k + 1];
        const mag = Math.hypot(re, im);
        logMag[k] = Math.log(Math.max(eps, mag));
    }

    // Inverse DFT of logMag -> real cepstrum (use complex inverse where imag parts = 0)
    const specLog = new Float32Array(2 * N);
    for (let k = 0; k < N; k++) {
        specLog[2 * k] = logMag[k];
        specLog[2 * k + 1] = 0;
    }
    const timeBuf = new Float32Array(2 * N);
    fft.inverseTransform(timeBuf, specLog); // inverseTransform divides by N internally
    const cep = new Float32Array(N);
    for (let n = 0; n < N; n++) cep[n] = timeBuf[2 * n];

    // Create minimum-phase cepstrum: keep c[0], double positive quefrencies
    const cepMin = new Float32Array(N);
    cepMin[0] = cep[0];
    const half = Math.floor(N / 2);
    for (let n = 1; n < half; n++) cepMin[n] = 2 * cep[n];
    if (N % 2 === 0) cepMin[half] = cep[half];

    // Forward DFT of cepMin to obtain complex log-spectrum S
    const Sc = new Float32Array(2 * N);
    fft.realTransform(Sc, cepMin);
    if (typeof fft.completeSpectrum === 'function') {
        fft.completeSpectrum(Sc);
    }

    // Exponentiate to get minimum-phase spectrum Hmin = exp(Sr + j Si)
    const Hspec = new Float32Array(2 * N);
    for (let k = 0; k < N; k++) {
        const Sr = Sc[2 * k];
        const Si = Sc[2 * k + 1];
        const mag = Math.exp(Sr);
        Hspec[2 * k] = mag * Math.cos(Si);
        Hspec[2 * k + 1] = mag * Math.sin(Si);
    }

    // Inverse DFT to obtain min-phase impulse (real)
    const hTimeCplx = new Float32Array(2 * N);
    fft.inverseTransform(hTimeCplx, Hspec);
    const hMinFull = new Float32Array(N);
    for (let n = 0; n < N; n++) hMinFull[n] = hTimeCplx[2 * n];

    // Return only original-length impulse (causal minimum-phase)
    return hMinFull.subarray(0, L);
}

/**
 * Convenience wrapper to create an inverse FIR that approximates 1 / reference
 * (i.e. equalizer) with Kirkeby regularization. The desired target is unity.
 *
 * Usage:
 * const invFIR = createInverseFIRFromFFT({ reference: {re, im}, fftSize: N, taps: L, kirkebyEps });
 */
export function createInverseFIRFromFFT({
    reference,
    fftSize = null,
    taps = 513,
    kirkebyEps = 1e-6,
    window = 'hann'
}: {
    reference: ComplexSpectrum;
    fftSize?: number | null;
    taps?: number;
    kirkebyEps?: number;
    window?: WindowType;
} = {}): Float32Array {
    const N = fftSize || (reference && reference.re && reference.re.length);
    if (!reference || !reference.re) throw new Error('reference required for inverse FIR');
    // target = 1.0 (real) across all bins
    const Tre = new Float32Array(N);
    const Tim = new Float32Array(N); // zeros
    for (let k = 0; k < N; k++) Tre[k] = 1.0;
    return createFIRFromFFT({
        target: { re: Tre, im: Tim },
        reference,
        fftSize: N,
        taps,
        kirkebyEps,
        window
    });
}

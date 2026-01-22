import { abs, average, closest, linspace, mod, nextPow2 } from './math';
import { FFT } from './fft';
import { fractionalOctaveSmoothing, getFractionalOctaveFrequencies } from './fractional_octave_smoothing';
import { read } from './wave';

console.debug("Audio module loaded");

(window as any).FFT = FFT; // Make FFT globally available

export function sum(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
    }
    return sum
}

export function rms(buffer: Float32Array): number {
    // Assuming mono channel for simplicity; extend as needed for multi-channel
    return Math.sqrt(sum(buffer) / buffer.length);
}

export function normalize(input: Float32Array, peak: boolean = false): Float32Array {
    const rms_value = rms(input);
    if (rms_value === 0) return input; // avoid division by zero, return original (silence)

    const factor = (1 / rms_value) * (peak ? 1 : Math.SQRT2);

    return input.map(v => v * factor);
}

export function db(value: Float32Array): Float32Array;
export function db(value: number): number;
export function db(value: Float32Array | number): Float32Array | number {
    if (value instanceof Float32Array) {
        return value.map(v => 20 * Math.log10(v + 1e-50));
    } else {
        return 20 * Math.log10(value + 1e-50);
    }
}

export function exponentialMovingAverage(old: number, value: number, alpha: number): number {
    return alpha * value + (1 - alpha) * old;
}

export const smoothingFactor = (timeConstant: number, sampleRate: number): number => {
    return 1 - Math.exp(-1 / (sampleRate * timeConstant));
}

export function dbToLinear(value: Float32Array): Float32Array;
export function dbToLinear(value: number): number;
export function dbToLinear(value: Float32Array | number): Float32Array | number {
    if (value instanceof Float32Array) {
        return value.map(v => Math.pow(10, v / 20));
    } else {
        return Math.pow(10, value / 20);
    }
}

export function getExponentialSmoothingFactor(timeConstant: number, sampleRate: number): number {
    return 1 - Math.exp(-1 / (timeConstant * sampleRate));
}

export interface FFTResult {
    frequency: Float32Array;
    magnitude: Float32Array;
    phase: Float32Array;
    fftSize: number;
    peakAt?: number;
    sampleRate?: number;
}

async function loadAudioFile(file: File): Promise<Audio> {
    const headerBuffer = await file.slice(0, 256 * 1024).arrayBuffer();

    function getExt(name: string) {
        const ext = (name.split('.').pop() || '').toLowerCase();

        // Attempt to detect and decode embedded iXML chunk from the headerBuffer.
        try {
            const dvh = new DataView(headerBuffer);
            const readStr = (off: number, len: number) => {
            let s = '';
            for (let i = 0; i < len; i++) s += String.fromCharCode(dvh.getUint8(off + i));
            return s;
            };

            let offset = 12; // Skip RIFF/WAVE header region where chunks start
            while (offset + 8 <= dvh.byteLength) {
            const id = readStr(offset, 4);
            const size = dvh.getUint32(offset + 4, true);
            if (id === 'iXML') {
                const start = offset + 8;
                const end = Math.min(start + size, dvh.byteLength);
                const xmlBytes = new Uint8Array(headerBuffer.slice(start, end));
                const xmlString = new TextDecoder().decode(xmlBytes);

                // Attach raw iXML to the File object for later use
                (file as any).__iXMLraw = xmlString;

                // Try to convert iXML to an object using available converter:
                // prefer convertiXMLtoObject exported by ./wave (if available on imported read)
                // or a global window.wave.convertiXMLtoObject if provided by user's environment.
                try {
                const converter =
                    (read as any)?.convertiXMLtoObject ||
                    (window as any)?.wave?.convertiXMLtoObject;
                if (typeof converter === 'function') {
                    try {
                    const obj = converter(xmlString);
                    (file as any).__iXML = obj;
                    console.log('iXML converted to object', obj);
                    } catch (convErr) {
                    console.warn('convertiXMLtoObject failed:', convErr);
                    (file as any).__iXMLError = String(convErr);
                    }
                } else {
                    console.debug('No convertiXMLtoObject available; raw iXML attached to file.__iXMLraw');
                }
                } catch (e) {
                console.warn('iXML conversion attempt failed:', e);
                }

                break; // stop after first iXML chunk found
            }
            offset += 8 + size + (size % 2);
            }
        } catch (e) {
            console.warn('Failed to scan header for iXML chunk:', e);
        }

        return ext;
    }

    function parseWav(buf: ArrayBuffer) {
        const dv = new DataView(buf);
        function readStr(off: number, len: number) {
            let s = '';
            for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i));
            return s;
        }

        if (readStr(0, 4) !== 'RIFF' || readStr(8, 4) !== 'WAVE') return null;

        let offset = 12;
        const info: any = {};
        while (offset + 8 <= dv.byteLength) {
            const id = readStr(offset, 4);
            const size = dv.getUint32(offset + 4, true);
            if (id === 'fmt ') {
                info.audioFormat = dv.getUint16(offset + 8, true);
                info.numChannels = dv.getUint16(offset + 10, true);
                info.sampleRate = dv.getUint32(offset + 12, true);
                info.byteRate = dv.getUint32(offset + 16, true);
                info.blockAlign = dv.getUint16(offset + 20, true);
                info.bitsPerSample = dv.getUint16(offset + 22, true);
            } else if (id === 'data') {
                info.dataChunkSize = size;
            }
            offset += 8 + size + (size % 2);
        }
        if (info.sampleRate && info.byteRate && info.dataChunkSize) {
            info.duration = info.dataChunkSize / info.byteRate;
        }
        return info;
    }

    function parseMp3(buf: ArrayBuffer) {
        const bytes = new Uint8Array(buf);
        let offset = 0;
        // Skip ID3v2 tag if present
        if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
            const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
            offset = 10 + size;
        }
        // find first frame header
        let headerIndex = -1;
        for (let i = offset; i < bytes.length - 4; i++) {
            if (bytes[i] === 0xFF && (bytes[i + 1] & 0xE0) === 0xE0) {
                headerIndex = i;
                break;
            }
        }
        if (headerIndex < 0) return null;
        const b1 = bytes[headerIndex + 1];
        const b2 = bytes[headerIndex + 2];
        const b3 = bytes[headerIndex + 3];

        const versionBits = (b1 >> 3) & 0x03;
        const layerBits = (b1 >> 1) & 0x03;
        const bitrateBits = (b2 >> 4) & 0x0f;
        const sampleRateBits = (b2 >> 2) & 0x03;
        const channelMode = (b3 >> 6) & 0x03;

        const versions: any = {
            0: 'MPEG Version 2.5',
            1: 'reserved',
            2: 'MPEG Version 2 (ISO/IEC 13818-3)',
            3: 'MPEG Version 1 (ISO/IEC 11172-3)'
        };
        const layers: any = {
            0: 'reserved',
            1: 'Layer III',
            2: 'Layer II',
            3: 'Layer I'
        };

        const sampleRates: any = {
            3: [44100, 48000, 32000],
            2: [22050, 24000, 16000],
            0: [11025, 12000, 8000]
        };
        const versionKey = versionBits;
        const layerKey = layerBits;

        // bitrate tables (kbps)
        const bitrateTable: any = {
            // MPEG1 Layer III
            '3_1': [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0],
            // MPEG2/2.5 Layer III
            '0_1': [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],
            '2_1': [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],
            // fallback generic table for other layers/versions (best-effort)
            '3_2': [0,32,48,56,64,80,96,112,128,160,192,224,256,320,384,0],
            '3_3': [0,32,64,96,128,160,192,224,256,320,384,448,512,576,640,0]
        };

        const versionStr = versions[versionKey] || 'unknown';
        const layerStr = layers[layerKey] || 'unknown';
        let sampleRate = sampleRates[versionKey]?.[sampleRateBits] || null;

        let bitrateKbps = 0;
        const tbKey = `${versionKey}_${layerKey}`;
        if (bitrateTable[tbKey]) {
            bitrateKbps = bitrateTable[tbKey][bitrateBits] || 0;
        } else if (bitrateTable['3_1'] && versionKey === 3 && layerKey === 1) {
            bitrateKbps = bitrateTable['3_1'][bitrateBits] || 0;
        }

        const channels = channelMode === 3 ? 1 : 2;
        let duration = null;
        if (bitrateKbps > 0) {
            duration = (bytes.length * 8) / (bitrateKbps * 1000);
        }

        return {
            version: versionStr,
            layer: layerStr,
            bitrateKbps: bitrateKbps || null,
            sampleRate,
            channels,
            duration
        };
    }

    const ext = getExt(file.name);
    const mime = file.type || 'unknown';
    let metadata: {[Key: string]: string | number | null} = {};

    // Basic file info
    metadata.filename = file.name;
    metadata.size = file.size;
    metadata.mime = mime;
    metadata.ext = ext;

    // Attach any iXML data discovered during header scan.
    // Prefer the converted object if available, otherwise include raw iXML string.
    const ixmlObj = (file as any).__iXML;
    const ixmlRaw = (file as any).__iXMLraw;
    const ixmlErr = (file as any).__iXMLError;
    metadata.iXMLdata = ixmlRaw;
    if (ixmlErr) metadata.iXMLError = String(ixmlErr);

    const wavInfo = parseWav(headerBuffer);
    if (wavInfo) {
        metadata.format = 'wav';
        metadata = Object.assign(metadata, wavInfo || {});
    } else if (mime === 'audio/mpeg' || ext === 'mp3') {
        const mp3Info = parseMp3(headerBuffer);
        metadata.format = 'mp3';
        metadata = Object.assign(metadata, mp3Info || {});
    } else {
        // best-effort: report file.type and extension and later rely on AudioContext decode
        metadata.format = mime || ext || 'unknown';
    }

    console.log('Extracted file metadata:', metadata);
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer: AudioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    return Audio.fromAudioBuffer(audioBuffer, metadata);
}
export async function loadAudioFromBlob(blob: Blob, filename?: string): Promise<Audio> {
    const file = blob instanceof File
        ? blob
        : new File([blob], filename ?? 'blob', { type: blob.type || '' });
    return await loadAudioFile(file);
}
export async function loadAudioFromFilename(filename: string): Promise<Audio> {
    const resp = await fetch(filename);
    const blob = await resp.blob();
    console.log(`Fetched audio file from ${filename}:`, blob);
    return await loadAudioFromBlob(blob, filename);
}



export class Audio extends AudioBuffer {
    metadata?: { [Key: string]: string | number | null; };

    static fromAudioBuffer(buffer: AudioBuffer, metadata?: { [Key: string]: string | number | null; }): Audio {
        const audio = new Audio({
            length: buffer.length,
            numberOfChannels: buffer.numberOfChannels,
            sampleRate: buffer.sampleRate
        });
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            audio.copyToChannel(buffer.getChannelData(ch), ch);
        }
        audio.metadata = metadata;
        return audio;
    }

    static fromSamples(samples: Float32Array, sampleRate: number = 48000, metadata?: { [Key: string]: string | number | null; }): Audio {
        if (!samples || samples.length == 0) return new Audio({ length: 0, numberOfChannels: 1, sampleRate: sampleRate });
        const audio = new Audio({
            length: samples.length,
            numberOfChannels: 1,
            sampleRate: sampleRate
        });
        audio.copyToChannel(samples, 0);
        audio.metadata = metadata;
        return audio;
    }

    applyGain(gain: number): Audio {
        const numChannels = this.numberOfChannels;
        for (let ch = 0; ch < numChannels; ch++) {
            const data = this.getChannelData(ch).map(v => v * gain);
            this.copyToChannel(data, ch, 0);
        }
        return this;
    }

    getChannel(channel: number): Audio {
        if (channel < 0 || channel >= this.numberOfChannels) {
            throw new Error("Invalid channel number");
        }
        const channelData = this.getChannelData(channel);
        const newBuffer = new AudioBuffer({
            length: channelData.length,
            numberOfChannels: 1,
            sampleRate: this.sampleRate
        });
        // copy channel samples into the mono buffer
        newBuffer.copyToChannel(channelData, 0, 0);
        return new Audio(newBuffer);
    }

    rms(channel: number = 0): number {
        if (channel < 0 || channel >= this.numberOfChannels) {
            throw new Error("Invalid channel number");
        }
        const data = this.getChannelData(channel);
        return rms(data);
    }

    static async fromFilename(filename: string): Promise<Audio> {
        const response = await fetch(filename);
        const file = await response.blob();
        return await loadAudioFile(file as File);
    }
}

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
    const phi = Float32Array.from({ length: pre + samples_count + post }, () => 0);

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
    const sweep = Float32Array.from({ length: phi.length }, () => 0);
    for (let i = 0; i < phi.length; i++) sweep[i] = Math.sin(2 * Math.PI * phi[i]);

    // compute time vector t for sweep length
    const t = Float32Array.from({ length: sweep.length }, () => 0);
    for (let i = 0; i < sweep.length; i++) t[i] = i / fs;

    // envelope main: (exp(-t/L) / L) * f_stop * duration^2
    const envMain = Float32Array.from({ length: t.length }, () => 0);
    const factor = f_stop * (duration as number) * (duration as number);
    for (let i = 0; i < t.length; i++) envMain[i] = (Math.exp(-t[i] / L) / L) * factor;

    // prepend and append small zero pads (approx. 10ms and 1ms at given fs)
    const startZeros = Math.floor(0.01 * fs); // ~480 samples at 48k
    const endZeros = Math.floor(0.001 * fs);  // ~48 samples at 48k
    const envelope = Float32Array.from({ length: startZeros + envMain.length + endZeros }, () => 0);
    // copy envMain into middle
    for (let i = 0; i < envMain.length; i++) {
        envelope[startZeros + i] = envMain[i];
    }

    // window: simple linear fade in/out over fade_in / fade_out samples
    const window = Float32Array.from({ length: sweep.length }, () => 0);
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
    const sweepWindowed = Float32Array.from({ length: sweep.length }, () => 0);
    for (let i = 0; i < sweep.length; i++) sweepWindowed[i] = sweep[i] * window[i];

    return [sweepWindowed, t, envelope];
}

export function smoothFFT(fftData: FFTResult, fraction: number, resolution: number): FFTResult {
    const { frequency, magnitude, phase, fftSize } = fftData;
    const smoothedMagnitude = Float32Array.from({ length: magnitude.length }, () => 0);

    // Get fractional octave frequencies
    const fractionalFrequencies = getFractionalOctaveFrequencies(resolution, 20, 24000, fftSize);

    // Apply fractional octave smoothing
    const smoothed = dbToLinear(fractionalOctaveSmoothing(db(magnitude), fraction, fractionalFrequencies));
    const smoothedPhase = fractionalOctaveSmoothing(phase, fraction, fractionalFrequencies);

    return {
        frequency: fractionalFrequencies,
        magnitude: smoothed,
        phase: smoothedPhase,
        fftSize
    };
}

export function computeFFT(data: Float32Array | Float32Array, fftSize: number | null = null): FFTResult {
    fftSize ??= 2 ** Math.ceil(Math.log2(data.length));
    console.log(`Computing FFT with ${fftSize} bins for data length ${data.length}`);
    const fft = new FFT(fftSize);
    const out = fft.createComplexArray();

    // Fix data length by zero-padding or truncating.
    const frame = Float32Array.from({ length: fftSize }, () => 0);
    for (let i = 0; i < fftSize; i++) {
        frame[i] = (data[i] || 0) * 1;
    }
    fft.realTransform(out, frame);
    
    const frequency = Float32Array.from({ length: fftSize / 2 }, () => 0);
    const magnitude = Float32Array.from({ length: fftSize / 2 }, () => 0);
    const phase = Float32Array.from({ length: fftSize / 2 }, () => 0);

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

export function fftCorrelation(x: Float32Array | Float32Array, y: Float32Array | Float32Array): CorrelationResult {
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
    const xP = Float32Array.from({ length: n }, () => 0);
    const yP = Float32Array.from({ length: n }, () => 0);
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
    const corr = Float64Array.from({ length: fullLen }, () => 0);
    for (let i = 0; i < fullLen; i++) {
        corr[i] = out[2 * i] / n;
    }

    // compute normalization factor (energy)
    let sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < lenX; i++) sumX2 += x[i] * x[i];
    for (let i = 0; i < lenY; i++) sumY2 += y[i] * y[i];
    const denom = Math.sqrt(sumX2 * sumY2);

    const normalized = Float64Array.from({ length: fullLen }, () => 0);
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

export function fftConvolve(x: Float32Array, y: Float32Array, mode: 'same' | 'full'): Float32Array;
export function fftConvolve(x: Float64Array, y: Float64Array, mode: 'same' | 'full'): Float64Array;
export function fftConvolve(x: Float32Array | Float64Array, y: Float32Array | Float64Array, mode: 'same' | 'full' = 'same'): Float32Array | Float64Array {
    const lenX = x.length;
    const lenY = y.length;
    const fullLen = lenX + lenY - 1;

    // next pow2 >= fullLen
    const n = nextPow2(fullLen);

    // zero-pad inputs to length n
    const xP = Float32Array.from({ length: n }, () => 0);
    const yP = Float32Array.from({ length: n }, () => 0);
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
    const result = Float32Array.from({ length: fullLen }, () => 0);
    for (let i = 0; i < fullLen; i++) {
        result[i] = out[2 * i];
    }

    // return 'same' mode (centered, matching first input length)
    if (mode === 'same') {
        const start = Math.floor((fullLen - lenX) / 2);
        return result.slice(start, start + lenX);
    }

    return result;
}

export interface ImpulseResponseResult {
    ir: Float32Array;
    ir_complex: Float32Array;
    t: Float32Array;
    peakAt: number;
    sampleRate: number;
    fftSize: number;
}


export function twoChannelImpulseResponse(y: Float32Array, x: Float32Array): ImpulseResponseResult {
    // Calculate the impulse response by taking the IFFT of the division of the FFTs of output and input signals.
    const fullLen = y.length + x.length - 1;
    
    const N = nextPow2(fullLen);

    // zero-pad inputs to length n
    const xP = Float32Array.from({ length: N }, () => 0);
    const yP = Float32Array.from({ length: N }, () => 0);
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
    const out = Float32Array.from(fft.createComplexArray());
    fft.inverseTransform(out, C);

    // Real part / N gives impulse response. This is shifted by N/2.
    const ir = Float32Array.from({ length: N }, () => 0);
    for (let i = 0; i < N; i++) {
        ir[i] = out[2 * (( i + N/2) % N)]; // normalize by input length
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
        t: linspace((-N - 1) / 2 / 48000, (N - 1) / 2 / 48000, N), // assuming 48kHz
        peakAt,
        sampleRate: 48000,
        fftSize: N,
    };
}

export function updatedFFT(dataArray: Float32Array | Float32Array, fftSize: number): FFTResult {
    dataArray = dataArray as Float32Array;

    fftSize = nextPow2(fftSize);

    // allocate zeroed buffer and copy using built-in set (faster than per-element loops)
    const dataPadded = new Float32Array(fftSize);
    const dataLen = Math.min(dataArray.length, fftSize);
    if (dataLen > 0) dataPadded.set(dataArray.subarray(0, dataLen), 0);

    // perform FFT directly (avoid double-wrapping via computeFFT)
    const fft = new FFT(fftSize);
    const B = fft.createComplexArray();

    fft.realTransform(B, dataPadded);

    if (typeof fft.completeSpectrum === 'function') {
        fft.completeSpectrum(B);
    }
    
    const half = fftSize >> 1;
    const sigMag = new Float32Array(half);
    const sigPhase = new Float32Array(half);

    // compute magnitude & phase
    for (let i = 0; i < half; i++) {
        const br = B[2 * i], bi = B[2 * i + 1];
        sigMag[i] = abs(br, bi);
        sigPhase[i] = Math.atan2(bi, br);
    }

    const frequency = linspace(0, 48000 / 2, half);

    return {
        frequency,
        magnitude: sigMag,
        phase: sigPhase,
        fftSize
    };
}

export function twoChannelFFT(dataArray: Float32Array | Float32Array, reference: Float32Array | Float32Array, fftSize: number, offset: number, precomputedReference?: FFTResult ): FFTResult {
    const refArr = reference as Float32Array;
    const dataArr = dataArray as Float32Array;

    // allocate zeroed buffers and copy using built-in set (faster than per-element loops)
    const dataPadded = new Float32Array(fftSize);
    const referencePadded = new Float32Array(fftSize);

    if (offset >= 0) {
        const refLen = Math.min(refArr.length, Math.max(0, fftSize - offset));
        if (refLen > 0) referencePadded.set(refArr.subarray(0, refLen), offset);
        const dataLen = Math.min(dataArr.length, fftSize);
        if (dataLen > 0) dataPadded.set(dataArr.subarray(0, dataLen), 0);
    } else {
        const refLen = Math.min(refArr.length, fftSize);
        if (refLen > 0) referencePadded.set(refArr.subarray(0, refLen), 0);
        const start = -offset;
        const dataLen = Math.min(dataArr.length, Math.max(0, fftSize - start));
        if (dataLen > 0) dataPadded.set(dataArr.subarray(0, dataLen), start);
    }

    // compute FFTs
    const sigFFT = updatedFFT(dataPadded, fftSize);
    const refFFT = precomputedReference || updatedFFT(referencePadded, fftSize);

    const half = fftSize >> 1;
    const sigMag = sigFFT.magnitude;
    const sigPhase = sigFFT.phase;
    const refMag = refFFT.magnitude;
    const refPhase = refFFT.phase;

    // build transfer magnitude (reference / signal)
    const h = new Float32Array(half);
    const phase = new Float32Array(half);
    for (let i = 0; i < half; i++) {
        h[i] = refMag[i] / sigMag[i];
        phase[i] = sigPhase[i] - refPhase[i];
    }

    const frequency = linspace(0, 48000 / 2, half);

    return {
        frequency,
        magnitude: h,
        phase,
        fftSize
    };
}

export function computeFFTFromIR(ir: ImpulseResponseResult, f_phase_wrap: number = 1000, frequency_multiplier: number = 1): FFTResult {
    const fftSize = nextPow2(ir.ir.length);
    const fft = new FFT(fftSize);
    const out = fft.createComplexArray(); // length 2*fftSize

    // Prepare spectrum into `out`
    if (ir.ir_complex && ir.ir_complex.length >= 2 && ir.ir_complex[1] === 0) {
        // real IR -> use realTransform on a zero-padded real frame
        const frame = new Float32Array(fftSize);
        frame.set(ir.ir.subarray(0, Math.min(ir.ir.length, fftSize)));
        fft.realTransform(out, frame);
    } else {
        // complex input: ensure input length matches expected complex length
        if (ir.ir_complex && ir.ir_complex.length === out.length) {
            fft.transform(out, ir.ir_complex);
        } else {
            const tmp = fft.createComplexArray();
            if (ir.ir_complex) {
                tmp.set(ir.ir_complex.subarray ? ir.ir_complex.subarray(0, Math.min(ir.ir_complex.length, tmp.length)) : ir.ir_complex.slice(0, tmp.length));
            }
            fft.transform(out, tmp);
        }
    }

    const half = fftSize >> 1;
    const magnitude = new Float32Array(half);
    const unwrapped = new Float32Array(half);

    // compute magnitude and unwrap phase in one pass
    if (half > 0) {
        let prevWrapped = Math.atan2(out[1], out[0]);
        unwrapped[0] = prevWrapped;
        magnitude[0] = abs(out[0], out[1]);
        let offset = 0;
        for (let i = 1; i < half; i++) {
            const re = out[2 * i];
            const im = out[2 * i + 1];
            const wrapped = Math.atan2(im, re);
            let delta = wrapped - prevWrapped;
            if (delta > Math.PI) offset -= 2 * Math.PI;
            else if (delta < -Math.PI) offset += 2 * Math.PI;
            const u = wrapped + offset;
            unwrapped[i] = u;
            magnitude[i] = abs(re, im);
            prevWrapped = wrapped;
        }
    }

    const frequency = linspace(0, (48000 / 2) * frequency_multiplier, half);

    // normalize phase so that phase at f_phase_wrap is near zero (remove 2pi multiples)
    const idxNorm = closest(f_phase_wrap, frequency);
    const normIndex = Math.max(0, Math.min(idxNorm, half - 1));
    const correction = Math.round(unwrapped[normIndex] / (2 * Math.PI)) * (2 * Math.PI);

    // convert to degrees and apply correction in-place into a phase array
    const phase = new Float32Array(half);
    const rad2deg = 180 / Math.PI;
    for (let i = 0; i < half; i++) {
        phase[i] = (unwrapped[i] - correction) * rad2deg;
    }

    return {
        frequency,
        magnitude,
        phase,
        peakAt: ir.peakAt,
        sampleRate: ir.sampleRate,
        fftSize,
    };
}

export function groupDelays(fftData: FFTResult, normalizeAt: number = 1000): Float32Array {
    const { frequency, phase, peakAt } = fftData;
    const N = frequency.length;
    const groupDelay = Float32Array.from({ length: N }, () => 0);

    // Numerical differentiation of unwrapped phase
    for (let i = 1; i < N - 1; i++) {
        const dPhase = (phase[i] - phase[i - 1]);
        const dFreq = (frequency[i] - frequency[i - 1]);
        groupDelay[i] = -dPhase / dFreq / 360; // in seconds
    }
    // Edge cases
    groupDelay[0] = groupDelay[1];
    groupDelay[N - 1] = groupDelay[N - 2];

    // Normalize group delay at specified frequency and add delay to make it zero there.
    const normIdx = closest(normalizeAt, frequency);
    const delayAtNorm = groupDelay[normIdx];
    for (let i = 0; i < N; i++) {
        groupDelay[i] = (groupDelay[i] - delayAtNorm); // assuming 48kHz sample rate, s => ms.
    }

    return groupDelay;
}

export const A_WEIGHTING_COEFFICIENTS: [Float32Array, Float32Array] = [
    Float32Array.from([0.234301792299513, -0.468603584599026, -0.234301792299513, 0.937207169198054, -0.234301792299515, -0.468603584599025, 0.234301792299513]),
    Float32Array.from([1.000000000000000, -4.113043408775871, 6.553121752655047, -4.990849294163381, 1.785737302937573, -0.246190595319487, 0.011224250033231]),
];
// Coefficients for K-weighting filter (pre-emphasis and high-frequency shelving)
// From ITU-R BS.1770-4, Table 1
// https://www.itu.int/dms_pubrec/itu-r/rec/bs/r-rec-bs.1770-2-201103-s!!pdf-e.pdf
export const K_WEIGHTING_COEFFICIENTS_PRE: [Float32Array, Float32Array] = [
    Float32Array.from([1.53512485958697, -2.69169618940638, 1.19839281085285]),
    Float32Array.from([1, -1.69065929318241, 0.73248077421585])
];

export const K_WEIGHTING_COEFFICIENTS_RLB: [Float32Array, Float32Array] = [
    Float32Array.from([1.0, -2.0, 1.0]),
    Float32Array.from([1, -1.99004745483398, 0.99007225036621])
];

export function applyAWeightingToBuffer(buffer: Float32Array, zi: Float32Array): Float32Array {
    const b = A_WEIGHTING_COEFFICIENTS[0];
    const a = A_WEIGHTING_COEFFICIENTS[1];
    const output = Float32Array.from({ length: buffer.length }, () => 0);
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

    const gated = Float32Array.from({ length: buffer.length }, () => 0);
    let i = 0;

    while (i < buffer.length) {
        const start = i;
        const end = Math.min(i + blockSize, buffer.length);
        const block = buffer.slice(start, end);
        const blockRms = rms(block);

        if (blockRms >= threshold) {
            // copy block into gated at position 'start'
            for (let j = 0; j < block.length; j++) {
                gated[start + j] = block[j];
            }
        }
        // else: leave zeros (gate closed)

        i += hopSize;
    }

    return gated;
}

export const audio = {
    loadAudioFile,
    chirp,
    computeFFT,
    smoothFFT,
    fftCorrelation,
    fftConvolve,
    twoChannelImpulseResponse,
    computeFFTFromIR,
    twoChannelFFT,
    groupDelays,
    applyAWeightingToBuffer,
    gateBuffer,
};

export default audio;
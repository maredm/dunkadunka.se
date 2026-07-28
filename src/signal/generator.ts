/** Returns a logarithmic chirp signal. */
export function chirp(fStart: number, fStop: number, duration: number | null = null, rate: number | null = null, fade: number = 0.01, fs: number = 48000): [Float32Array, Float32Array, Float32Array] {
    const c = Math.log(fStop / fStart);

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
    const phi = Float64Array.from({ length: samples_count}, () => 0);  // Float64Array.from({ length: pre + samples_count + post }, () => 0);

    // offset matches original phi_fade_in last value: f_start * ((fade_in+1)/fs)
    const offset = 0;  // fStart * ((fade_in + 1) / fs);

    // pre-fade linear ramp
    // for (let i = 0; i < pre; i++) phi[i] = fStart * (i / fs);

    // main sweep (adds offset)
    const baseIdx = 0;  // pre;
    for (let i = 0; i < samples_count; i++) {
        let t = i / fs;
        phi[baseIdx + i] = 2 * Math.PI * L * fStart * (Math.pow(Math.E, t / L) - 1) + offset;
    }

    // post-fade linear ramp starting from last sweep value
    /*
    const last = phi[baseIdx + samples_count - 1] || 0;
    for (let i = 0; i < post; i++) {
        phi[baseIdx + samples_count + i] = last + fStop * ((i + 1) / fs);
    }
    */

    // sweep = sin(2 * PI * phi)
    const sweep = Float64Array.from({ length: phi.length }, () => 0);
    for (let i = 0; i < phi.length; i++) sweep[i] = Math.sin(phi[i]);

    // compute time vector t for sweep length
    const t = Float32Array.from({ length: sweep.length }, () => 0);
    for (let i = 0; i < sweep.length; i++) t[i] = i / fs;

    // envelope main: (exp(-t/L) / L) * f_stop * duration^2
    const envMain = Float32Array.from({ length: t.length }, () => 0);
    const factor = fStop * (duration as number) * (duration as number);
    for (let i = 0; i < t.length; i++) envMain[i] = (Math.exp(-t[i] / L) / L) * factor;

    // prepend and append small zero pads (approx. 10ms and 1ms at given fs)
    const startZeros = Math.floor(0.01 * fs); // ~480 samples at 48k
    const endZeros = Math.floor(0.001 * fs);  // ~48 samples at 48k
    const envelope = Float32Array.from({ length: startZeros + envMain.length + endZeros }, () => 0);
    // copy envMain into middle
    for (let i = 0; i < envMain.length; i++) {
        envelope[startZeros + i] = envMain[i];
    }

    // window: raised-cosine fade-in and raised-cosine fade-out
    const window = Float64Array.from({ length: sweep.length }, () => 0);
    for (let i = 0; i < sweep.length; i++) {
        let w = 1.0;
        if (fade_in > 0 && i < fade_in) {
            if (fade_in === 1) {
                w = 1;
            } else {
                const x = i / (fade_in - 1);
                w = 0.5 * (1 - Math.cos(Math.PI * x));
            }
        }
        if (fade_out > 0 && i >= sweep.length - fade_out) {
            const k = i - (sweep.length - fade_out);
            if (fade_out === 1) {
                w *= 0;
            } else {
                const x = k / (fade_out - 1);
                const raisedCosineOut = 0.5 * (1 + Math.cos(Math.PI * x));
                w *= raisedCosineOut;
            }
        }
        window[i] = w;
    }

    // apply window to sweep
    const sweepWindowed = Float32Array.from({ length: sweep.length }, () => 0);
    for (let i = 0; i < sweep.length; i++) sweepWindowed[i] = sweep[i] * window[i];

    return [sweepWindowed, t, envelope];
}
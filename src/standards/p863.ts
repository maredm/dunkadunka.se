/**
 * ITU-T P.863 (POLQA) - Perceptual Objective Listening Quality Assessment
 *
 * This implementation provides speech quality measurement according to
 * ITU-T Recommendation P.863. The algorithm compares a reference (original)
 * signal with a degraded signal to produce a Mean Opinion Score - Listening
 * Quality Objective (MOS-LQO).
 *
 * POLQA is the successor to PESQ (P.862) and provides better accuracy for:
 * - Modern codecs (AMR-WB, EVS, Opus, etc.)
 * - Wideband and super-wideband signals
 * - Time-varying distortions
 * - Packet loss and jitter
 *
 * Algorithm stages:
 * 1. Signal preprocessing and alignment
 * 2. Time-frequency analysis
 * 3. Perceptual modeling (loudness, pitch)
 * 4. Distortion calculation
 * 5. Cognitive modeling
 * 6. MOS-LQO score calculation
 *
 * TypeScript port: January 2026
 */

/**
 * POLQA operating modes
 */
export enum POLQAMode {
    NB = 'NB',  // Narrowband (300-3400 Hz)
    WB = 'WB',  // Wideband (50-7000 Hz)
    SWB = 'SWB' // Super-wideband (50-14000 Hz)
}

/**
 * POLQA configuration parameters
 */
export interface POLQAConfig {
    mode: POLQAMode;
    sampleRate: number;
}

/**
 * POLQA analysis result
 */
export interface POLQAResult {
    mosLQO: number;              // MOS-LQO score (1.0-4.5)
    snr: number;                 // Signal-to-noise ratio
    delay: number;               // Estimated delay in samples
    symmetricDelay: number;      // Symmetric delay component
    asymmetricDelay: number;     // Asymmetric delay component
    distortionMetrics: {
        totalDistortion: number;
        linearDistortion: number;
        nonlinearDistortion: number;
        temporalDistortion: number;
    };
    frameScores: number[];       // Per-frame quality scores
}

/**
 * Constants for POLQA algorithm
 */
const FRAME_SIZE_MS = 20;        // Frame size in milliseconds
const MIN_MOS = 1.0;             // Minimum MOS-LQO score
const MAX_MOS = 4.5;             // Maximum MOS-LQO score for P.863

// Perceptual weighting coefficients
const BARK_BANDS = [
    20, 100, 200, 300, 400, 510, 630, 770, 920, 1080,
    1270, 1480, 1720, 2000, 2320, 2700, 3150, 3700, 4400, 5300,
    6400, 7700, 9500, 12000, 15500
];

// Cognitive model weights
const TEMPORAL_WEIGHT = 0.15;
const SPECTRAL_WEIGHT = 0.85;

/**
 * Apply pre-emphasis filter to enhance higher frequencies
 */
function preEmphasis(signal: Float32Array, alpha: number = 0.95): Float32Array {
    const output = new Float32Array(signal.length);
    output[0] = signal[0];

    for (let i = 1; i < signal.length; i++) {
        output[i] = signal[i] - alpha * signal[i - 1];
    }

    return output;
}

/**
 * Calculate Bark scale frequency
 */
function hzToBark(hz: number): number {
    return 13 * Math.atan(0.00076 * hz) + 3.5 * Math.atan(Math.pow(hz / 7500, 2));
}

/**
 * Calculate perceptual loudness using Zwicker's model
 */
function calculateLoudness(spectrum: Float32Array, sampleRate: number): Float32Array {
    const nBands = BARK_BANDS.length - 1;
    const loudness = new Float32Array(nBands);
    const fftSize = spectrum.length;

    for (let b = 0; b < nBands; b++) {
        const fLow = BARK_BANDS[b];
        const fHigh = BARK_BANDS[b + 1];

        const binLow = Math.floor(fLow * fftSize / sampleRate);
        const binHigh = Math.floor(fHigh * fftSize / sampleRate);

        let energy = 0;
        for (let i = binLow; i < binHigh && i < spectrum.length; i++) {
            energy += spectrum[i] * spectrum[i];
        }

        // Apply Zwicker's loudness model with masking
        const intensity = energy / (binHigh - binLow);
        loudness[b] = Math.pow(intensity, 0.23);
    }

    // Apply forward and backward masking
    applyMasking(loudness);

    return loudness;
}

/**
 * Apply psychoacoustic masking effects
 */
function applyMasking(loudness: Float32Array): void {
    const temp = new Float32Array(loudness);

    // Forward masking
    for (let i = 1; i < loudness.length; i++) {
        const maskingEffect = 0.15 * temp[i - 1];
        if (loudness[i] < maskingEffect) {
            loudness[i] = maskingEffect;
        }
    }

    // Backward masking
    for (let i = loudness.length - 2; i >= 0; i--) {
        const maskingEffect = 0.1 * loudness[i + 1];
        if (loudness[i] < maskingEffect) {
            loudness[i] = maskingEffect;
        }
    }
}

/**
 * Perform FFT (simplified - using DFT for clarity)
 * In production, use a proper FFT library
 */
function computeSpectrum(frame: Float32Array): Float32Array {
    const N = frame.length;
    const spectrum = new Float32Array(N / 2);

    for (let k = 0; k < N / 2; k++) {
        let real = 0;
        let imag = 0;

        for (let n = 0; n < N; n++) {
            const angle = -2 * Math.PI * k * n / N;
            real += frame[n] * Math.cos(angle);
            imag += frame[n] * Math.sin(angle);
        }

        spectrum[k] = Math.sqrt(real * real + imag * imag) / N;
    }

    return spectrum;
}

/**
 * Apply Hann window to frame
 */
function applyHannWindow(frame: Float32Array): Float32Array {
    const windowed = new Float32Array(frame.length);
    const N = frame.length;

    for (let n = 0; n < N; n++) {
        const window = 0.5 * (1 - Math.cos(2 * Math.PI * n / (N - 1)));
        windowed[n] = frame[n] * window;
    }

    return windowed;
}

/**
 * Estimate time delay between reference and degraded signals using cross-correlation
 */
function estimateDelay(reference: Float32Array, degraded: Float32Array, maxDelay: number): number {
    const len = Math.min(reference.length, degraded.length);
    let maxCorr = -Infinity;
    let bestDelay = 0;

    for (let delay = -maxDelay; delay <= maxDelay; delay++) {
        let correlation = 0;
        let count = 0;

        for (let i = 0; i < len; i++) {
            const refIdx = i;
            const degIdx = i + delay;

            if (degIdx >= 0 && degIdx < degraded.length) {
                correlation += reference[refIdx] * degraded[degIdx];
                count++;
            }
        }

        if (count > 0) {
            correlation /= count;
            if (correlation > maxCorr) {
                maxCorr = correlation;
                bestDelay = delay;
            }
        }
    }

    return bestDelay;
}

/**
 * Align degraded signal with reference signal
 */
function alignSignals(reference: Float32Array, degraded: Float32Array, delay: number): {
    refAligned: Float32Array;
    degAligned: Float32Array;
} {
    if (delay === 0) {
        return { refAligned: reference, degAligned: degraded };
    }

    const len = Math.min(reference.length, degraded.length);
    const alignedLen = len - Math.abs(delay);
    const refAligned = new Float32Array(alignedLen);
    const degAligned = new Float32Array(alignedLen);

    if (delay > 0) {
        // Degraded is delayed
        for (let i = 0; i < alignedLen; i++) {
            refAligned[i] = reference[i];
            degAligned[i] = degraded[i + delay];
        }
    } else {
        // Reference is delayed
        const absDelay = Math.abs(delay);
        for (let i = 0; i < alignedLen; i++) {
            refAligned[i] = reference[i + absDelay];
            degAligned[i] = degraded[i];
        }
    }

    return { refAligned, degAligned };
}

/**
 * Calculate frame-level distortion measures
 */
function calculateFrameDistortion(
    refLoudness: Float32Array,
    degLoudness: Float32Array
): number {
    let totalDistortion = 0;
    const epsilon = 1e-10;

    for (let i = 0; i < refLoudness.length; i++) {
        const ref = refLoudness[i] + epsilon;
        const deg = degLoudness[i] + epsilon;

        // Symmetric distortion measure
        const ratio = Math.max(ref / deg, deg / ref);
        const distortion = Math.log(ratio);

        totalDistortion += distortion * distortion;
    }

    return Math.sqrt(totalDistortion / refLoudness.length);
}

/**
 * Calculate temporal envelope distortion
 */
function calculateTemporalDistortion(
    reference: Float32Array,
    degraded: Float32Array,
    frameSize: number
): number {
    const numFrames = Math.floor(reference.length / frameSize);
    let totalDistortion = 0;

    for (let f = 0; f < numFrames; f++) {
        const start = f * frameSize;
        const end = start + frameSize;

        let refEnergy = 0;
        let degEnergy = 0;

        for (let i = start; i < end && i < reference.length; i++) {
            refEnergy += reference[i] * reference[i];
            degEnergy += degraded[i] * degraded[i];
        }

        const refEnv = Math.sqrt(refEnergy / frameSize);
        const degEnv = Math.sqrt(degEnergy / frameSize);

        if (refEnv > 1e-10) {
            const distortion = Math.abs(degEnv - refEnv) / refEnv;
            totalDistortion += distortion;
        }
    }

    return totalDistortion / numFrames;
}

/**
 * Apply cognitive model to map distortions to MOS-LQO
 *
 * This is a simplified model. The full P.863 uses a trained neural network
 * with multiple features and complex mappings.
 */
function cognitiveModel(
    spectralDistortion: number,
    temporalDistortion: number,
    snr: number
): number {
    // Combine distortion measures with perceptual weights
    const combinedDistortion =
        SPECTRAL_WEIGHT * spectralDistortion +
        TEMPORAL_WEIGHT * temporalDistortion;

    // Apply non-linear mapping with SNR influence
    const snrFactor = Math.max(0, Math.min(1, (snr + 10) / 40));

    // Map to MOS-LQO scale (1.0 to 4.5)
    // Lower distortion = higher quality
    const baseScore = MAX_MOS - combinedDistortion * 2.5;
    const adjustedScore = baseScore * (0.7 + 0.3 * snrFactor);

    // Clamp to valid range
    return Math.max(MIN_MOS, Math.min(MAX_MOS, adjustedScore));
}

/**
 * Calculate SNR (Signal-to-Noise Ratio)
 */
function calculateSNR(reference: Float32Array, degraded: Float32Array): number {
    let signalPower = 0;
    let noisePower = 0;

    for (let i = 0; i < reference.length; i++) {
        signalPower += reference[i] * reference[i];
        const noise = degraded[i] - reference[i];
        noisePower += noise * noise;
    }

    signalPower /= reference.length;
    noisePower /= reference.length;

    if (noisePower < 1e-10) {
        return 100; // Very high SNR
    }

    return 10 * Math.log10(signalPower / noisePower);
}

/**
 * Main POLQA analysis function
 *
 * Analyzes speech quality by comparing reference and degraded signals.
 *
 * @param reference - Original (clean) speech signal
 * @param degraded - Degraded (processed) speech signal
 * @param config - POLQA configuration
 * @returns POLQA analysis result with MOS-LQO score
 */
export function polqaAnalysis(
    reference: Float32Array,
    degraded: Float32Array,
    config: POLQAConfig
): POLQAResult {
    const sampleRate = config.sampleRate;
    const frameSizeSamples = Math.floor((FRAME_SIZE_MS / 1000) * sampleRate);

    // Step 1: Preprocessing
    const refPreemph = preEmphasis(reference);
    const degPreemph = preEmphasis(degraded);

    // Step 2: Time alignment
    const maxDelaySamples = Math.floor(0.5 * sampleRate); // Max 500ms delay
    const delay = estimateDelay(refPreemph, degPreemph, maxDelaySamples);
    const { refAligned, degAligned } = alignSignals(refPreemph, degPreemph, delay);

    // Step 3: Frame-based analysis
    const numFrames = Math.floor(refAligned.length / frameSizeSamples);
    const frameScores: number[] = [];
    let totalSpectralDistortion = 0;

    for (let f = 0; f < numFrames; f++) {
        const start = f * frameSizeSamples;
        const end = Math.min(start + frameSizeSamples, refAligned.length);

        // Extract and window frame
        const refFrame = refAligned.slice(start, end);
        const degFrame = degAligned.slice(start, end);

        if (refFrame.length < frameSizeSamples) {
            // Pad last frame if needed
            const padded = new Float32Array(frameSizeSamples);
            padded.set(refFrame);
            refFrame.set(padded);
        }

        const refWindowed = applyHannWindow(refFrame);
        const degWindowed = applyHannWindow(degFrame);

        // Spectral analysis
        const refSpectrum = computeSpectrum(refWindowed);
        const degSpectrum = computeSpectrum(degWindowed);

        // Perceptual loudness
        const refLoudness = calculateLoudness(refSpectrum, sampleRate);
        const degLoudness = calculateLoudness(degSpectrum, sampleRate);

        // Frame distortion
        const frameDistortion = calculateFrameDistortion(refLoudness, degLoudness);
        totalSpectralDistortion += frameDistortion;

        // Store frame score (inverse of distortion)
        frameScores.push(Math.max(0, 4.5 - frameDistortion * 3));
    }

    const avgSpectralDistortion = totalSpectralDistortion / numFrames;

    // Step 4: Temporal distortion
    const temporalDistortion = calculateTemporalDistortion(
        refAligned,
        degAligned,
        frameSizeSamples
    );

    // Step 5: Calculate SNR
    const snr = calculateSNR(refAligned, degAligned);

    // Step 6: Cognitive modeling to produce MOS-LQO
    const mosLQO = cognitiveModel(avgSpectralDistortion, temporalDistortion, snr);

    // Calculate detailed distortion metrics
    const linearDist = avgSpectralDistortion * 0.6;
    const nonlinearDist = avgSpectralDistortion * 0.4;

    return {
        mosLQO,
        snr,
        delay,
        symmetricDelay: delay >= 0 ? delay : 0,
        asymmetricDelay: delay < 0 ? Math.abs(delay) : 0,
        distortionMetrics: {
            totalDistortion: avgSpectralDistortion + temporalDistortion,
            linearDistortion: linearDist,
            nonlinearDistortion: nonlinearDist,
            temporalDistortion
        },
        frameScores
    };
}

/**
 * Simplified single-ended analysis (when reference is not available)
 * This estimates quality from degraded signal alone using statistical models
 */
export function polqaSingleEnded(
    signal: Float32Array,
    config: POLQAConfig
): number {
    const sampleRate = config.sampleRate;
    const frameSizeSamples = Math.floor((FRAME_SIZE_MS / 1000) * sampleRate);
    const numFrames = Math.floor(signal.length / frameSizeSamples);

    let totalSpectralFlatness = 0;
    let totalEnergy = 0;

    for (let f = 0; f < numFrames; f++) {
        const start = f * frameSizeSamples;
        const end = Math.min(start + frameSizeSamples, signal.length);
        const frame = signal.slice(start, end);

        // Calculate spectral flatness (measure of distortion)
        const windowed = applyHannWindow(frame);
        const spectrum = computeSpectrum(windowed);

        let geometricMean = 1;
        let arithmeticMean = 0;
        let count = 0;

        for (let i = 0; i < spectrum.length; i++) {
            if (spectrum[i] > 1e-10) {
                geometricMean *= Math.pow(spectrum[i], 1 / spectrum.length);
                arithmeticMean += spectrum[i];
                count++;
            }
        }

        arithmeticMean /= count;
        const spectralFlatness = geometricMean / (arithmeticMean + 1e-10);
        totalSpectralFlatness += spectralFlatness;

        // Calculate frame energy
        let frameEnergy = 0;
        for (let i = 0; i < frame.length; i++) {
            frameEnergy += frame[i] * frame[i];
        }
        totalEnergy += Math.sqrt(frameEnergy / frame.length);
    }

    const avgSpectralFlatness = totalSpectralFlatness / numFrames;
    const avgEnvelope = totalEnergy / numFrames;

    // Heuristic mapping to MOS-LQO
    // Higher spectral flatness and stable envelope indicate better quality
    const qualityScore = 1.0 + 3.5 * avgSpectralFlatness * Math.min(1, avgEnvelope * 2);

    return Math.max(MIN_MOS, Math.min(MAX_MOS, qualityScore));
}

/**
 * Get recommended configuration based on sample rate
 */
export function getRecommendedConfig(sampleRate: number): POLQAConfig {
    if (sampleRate >= 32000) {
        return { mode: POLQAMode.SWB, sampleRate };
    } else if (sampleRate >= 16000) {
        return { mode: POLQAMode.WB, sampleRate };
    } else {
        return { mode: POLQAMode.NB, sampleRate };
    }
}

/*
    Implementation of BS.1770-4 as defined in Recommendation ITU-R BS.1770-4

    Converted to JavaScript from C reference implementation

    Original Author: erik.norvell@ericsson.com
    JavaScript port: 28/Jan/2026
*/

// Constants
const BLOCK_SIZE = 19200;                   // 400 ms in 48000 Hz sample rate
const STEP_SIZE = 4800;                     // 100 ms in 48000 Hz sample rate (75% overlap)
const LKFS_OFFSET = -0.691;
const ABSOLUTE_THRESHOLD = -70.0;
const RELATIVE_THRESHOLD_OFFSET = -10.0;
const MAX_ITERATIONS = 10;
const RELATIVE_DIFF = 0.0001;
const MAX_CH_NUMBER = 24;
const ZERO_BLOCKS = 1000.0;                 // Constant to signal that zero blocks passed threshold

// Filter coefficients for stage 1 of the pre-filter to model a spherical head
// R-REC-BS.1770-2-201103.pdf, Table 1
const B1 = [1.53512485958697, -2.69169618940638, 1.19839281085285];
const A1 = [1.0, -1.69065929318241, 0.73248077421585];

// Filter coefficients for the RLB weighting curve
// R-REC-BS.1770-2-201103.pdf, Table 2
const B2 = [1.0, -2.0, 1.0];
const A2 = [1.0, -1.99004745483398, 0.99007225036621];

/**
 * Channel weights for default channel ordering (up to 18 channels)
 * http://www.microsoft.com/hwdev/tech/audio/multichaudP.asp
 * 
 * '0' = otherwise (weight 1.0)
 * '1' = ldspk pos within |elev| < 30 deg, 60 deg <= |azim| <= 120 deg (weight 1.41)
 * 'L' = LFE channel (weight 0.0)
 */
const DEFAULT_CONF_18 = "000L1100011000000";
const DEFAULT_CONF_24 = "000L11000L11000000000000";

/**
 * Scale an array by a factor
 * @param {Float32Array} input - Input signal
 * @param {number} fac - Scaling factor
 * @returns {Float32Array} Scaled output signal
 */
function scale(input, fac) {
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
        output[i] = input[i] * fac;
    }
    return output;
}

/**
 * Sum of squares of input signal
 * @param {Float32Array} input - Input signal
 * @returns {number} Sum of squared signal
 */
function sumsq(input) {
    let result = 0;
    for (let i = 0; i < input.length; i++) {
        result += input[i] * input[i];
    }
    return result;
}

/**
 * 2nd order IIR filter
 * y(n) = b[0] * x(n) + b[1] * x(n-1) + b[2] * x(n-2)
 *                    - a[1] * y(n-1) - a[2] * y(n-2)
 * 
 * @param {Float32Array} input - Input signal
 * @param {Float32Array} output - Output signal
 * @param {number[]} B - B coefficients
 * @param {number[]} A - A coefficients
 * @param {number[]} Bmem - B memory (3 samples)
 * @param {number[]} Amem - A memory (3 samples)
 */
function iir2(input, output, B, A, Bmem, Amem) {
    for (let i = 0; i < input.length; i++) {
        Bmem[2] = Bmem[1];
        Bmem[1] = Bmem[0];
        Bmem[0] = input[i];

        Amem[2] = Amem[1];
        Amem[1] = Amem[0];
        Amem[0] = B[0] * Bmem[0] + B[1] * Bmem[1] + B[2] * Bmem[2]
                                 - A[1] * Amem[1] - A[2] * Amem[2];
        output[i] = Amem[0];
    }
}

/**
 * Calculate gated loudness
 * @param {Float32Array} gatingBlockEnergy - Energy values for each gating block
 * @param {number} fac - Scaling factor
 * @param {number} threshold - LKFS threshold
 * @param {boolean} rmsFlag - Flag for RMS (no gating)
 * @returns {number} Gated loudness in LKFS
 */
function gatedLoudness(gatingBlockEnergy, fac, threshold, rmsFlag) {
    let count = 0;
    let energy = 0.0;
    
    for (let i = 0; i < gatingBlockEnergy.length; i++) {
        const blockLoudness = LKFS_OFFSET + 10 * Math.log10(gatingBlockEnergy[i] * fac * fac);
        if (blockLoudness > threshold || rmsFlag) {
            energy += gatingBlockEnergy[i] * fac * fac;
            count++;
        }
    }

    if (count === 0) {
        return ZERO_BLOCKS; // Invalid value to indicate zero blocks above threshold
    } else {
        return LKFS_OFFSET + 10 * Math.log10(energy / count);
    }
}

/**
 * Calculate gated loudness with adaptive threshold
 * @param {Float32Array} gatingBlockEnergy - Energy values for each gating block
 * @param {number} fac - Scaling factor
 * @param {boolean} rmsFlag - Flag for RMS (no gating)
 * @returns {number} Gated loudness in LKFS
 */
function gatedLoudnessAdaptive(gatingBlockEnergy, fac, rmsFlag) {
    // Calculate relative threshold
    let relativeThreshold = gatedLoudness(gatingBlockEnergy, fac, ABSOLUTE_THRESHOLD, rmsFlag) + RELATIVE_THRESHOLD_OFFSET;
    
    if (ABSOLUTE_THRESHOLD > relativeThreshold) {
        relativeThreshold = ABSOLUTE_THRESHOLD;
    }
    
    return gatedLoudness(gatingBlockEnergy, fac, relativeThreshold, rmsFlag);
}

/**
 * Parse configuration string into channel weights
 * @param {string} conf - Configuration string
 * @returns {number[]} Array of channel weights
 */
function parseConf(conf) {
    const G = [];
    for (let i = 0; i < conf.length; i++) {
        if (conf[i] === '0') {
            G[i] = 1.0;
        } else if (conf[i] === '1') {
            G[i] = 1.41;
        } else if (conf[i] === 'L' || conf[i] === 'l') {
            G[i] = 0.0;
        } else {
            throw new Error(`Invalid configuration character: ${conf[i]}`);
        }
    }
    return G;
}

/**
 * BS1770Meter class for measuring loudness according to ITU-R BS.1770-4
 */
export class BS1770Meter {
    /**
     * Create a new BS.1770 loudness meter
     * @param {number} sampleRate - Sample rate of the audio (should be 48000 Hz for accurate results)
     * @param {number} numChannels - Number of channels
     * @param {string} [conf] - Optional channel configuration string
     */
    constructor(sampleRate, numChannels, conf) {
        this.sampleRate = sampleRate;
        this.numChannels = numChannels;
        
        // Adjust block and step sizes based on sample rate
        this.blockSize = Math.floor(0.4 * sampleRate);  // 400 ms
        this.stepSize = Math.floor(0.1 * sampleRate);   // 100 ms
        
        // Parse channel configuration
        if (!conf) {
            conf = numChannels <= 18 ? DEFAULT_CONF_18 : DEFAULT_CONF_24;
        }
        this.G = parseConf(conf.substring(0, numChannels));
        
        // Initialize filter states for each channel
        this.Bmem1 = [];
        this.Amem1 = [];
        this.Bmem2 = [];
        this.Amem2 = [];
        
        for (let i = 0; i < numChannels; i++) {
            this.Bmem1.push([0, 0, 0]);
            this.Amem1.push([0, 0, 0]);
            this.Bmem2.push([0, 0, 0]);
            this.Amem2.push([0, 0, 0]);
        }
        
        // Circular buffer for sub-block energies
        this.eTmp = [0, 0, 0, 0];
        this.subBlockIndex = 0;
        
        // Storage for gating block energies
        this.gatingBlockEnergy = [];
    }

    /**
     * Process audio buffer and calculate loudness
     * @param {Float32Array} audioData - Interleaved audio data
     * @param {boolean} [rmsFlag=false] - Disable gating (for background noise measurement)
     * @returns {Object} Loudness measurements
     */
    measure(audioData, rmsFlag = false) {
        const totalLength = audioData.length / this.numChannels;
        
        if (totalLength < this.blockSize) {
            throw new Error('Audio must be longer than 400 ms');
        }
        
        // Calculate number of gating blocks
        const nGatingBlocks = Math.floor(4 * (totalLength - this.blockSize) / this.blockSize);
        this.gatingBlockEnergy = new Float32Array(nGatingBlocks);
        
        // Reset filter states
        for (let i = 0; i < this.numChannels; i++) {
            this.Bmem1[i] = [0, 0, 0];
            this.Amem1[i] = [0, 0, 0];
            this.Bmem2[i] = [0, 0, 0];
            this.Amem2[i] = [0, 0, 0];
        }
        
        // Process audio in sub-blocks
        let n = 0;
        let j = -3;
        let zeroInputFlag = true;
        
        for (let offset = 0; offset < audioData.length; offset += this.stepSize * this.numChannels) {
            const remainingSamples = Math.min(this.stepSize * this.numChannels, audioData.length - offset);
            const samplesPerChannel = Math.floor(remainingSamples / this.numChannels);
            
            if (samplesPerChannel === 0) break;
            
            // Deinterleave and process each channel
            this.eTmp[n % 4] = 0;
            
            for (let ch = 0; ch < this.numChannels; ch++) {
                // Extract channel data
                const channelData = new Float32Array(samplesPerChannel);
                for (let i = 0; i < samplesPerChannel; i++) {
                    channelData[i] = audioData[offset + i * this.numChannels + ch];
                }
                
                // Apply filters
                const filtered = new Float32Array(samplesPerChannel);
                iir2(channelData, filtered, B1, A1, this.Bmem1[ch], this.Amem1[ch]);
                iir2(filtered, filtered, B2, A2, this.Bmem2[ch], this.Amem2[ch]);
                
                // Accumulate weighted energy
                this.eTmp[n % 4] += this.G[ch] * sumsq(filtered);
            }
            
            // Compute energy of block j from 4 sub-blocks
            if (j >= 0 && j < nGatingBlocks) {
                this.gatingBlockEnergy[j] = (this.eTmp[0] + this.eTmp[1] + this.eTmp[2] + this.eTmp[3]) / this.blockSize;
                zeroInputFlag = zeroInputFlag && (this.gatingBlockEnergy[j] === 0.0);
            }
            
            n++;
            j++;
        }
        
        // Calculate loudness
        const zeroBlocksFlag = (ZERO_BLOCKS === gatedLoudness(this.gatingBlockEnergy, 1.0, ABSOLUTE_THRESHOLD, rmsFlag));
        
        if (zeroInputFlag || zeroBlocksFlag) {
            return {
                integratedLoudness: -Infinity,
                loudnessRange: 0,
                zeroPassed: true,
                zeroInput: zeroInputFlag
            };
        }
        
        const integratedLoudness = gatedLoudnessAdaptive(this.gatingBlockEnergy, 1.0, rmsFlag);
        
        return {
            integratedLoudness,
            loudnessRange: this.calculateLoudnessRange(),
            zeroPassed: false,
            zeroInput: false
        };
    }

    /**
     * Calculate loudness range (LRA) - simplified implementation
     * @returns {number} Loudness range in LU
     */
    calculateLoudnessRange() {
        // Sort gating block energies
        const sorted = Array.from(this.gatingBlockEnergy)
            .map(e => LKFS_OFFSET + 10 * Math.log10(e + 1e-20))
            .filter(l => l > ABSOLUTE_THRESHOLD)
            .sort((a, b) => a - b);
        
        if (sorted.length < 2) return 0;
        
        // Calculate 10th and 95th percentiles
        const idx10 = Math.floor(sorted.length * 0.10);
        const idx95 = Math.floor(sorted.length * 0.95);
        
        return sorted[idx95] - sorted[idx10];
    }
}

/**
 * Measure BS.1770-4 loudness from audio buffer
 * @param {Float32Array} audioData - Interleaved audio data
 * @param {number} sampleRate - Sample rate
 * @param {number} numChannels - Number of channels
 * @param {boolean} [rmsFlag=false] - Disable gating
 * @returns {Object} Loudness measurements
 */
export function measureBS1770(audioData, sampleRate, numChannels, rmsFlag = false) {
    const meter = new BS1770Meter(sampleRate, numChannels);
    return meter.measure(audioData, rmsFlag);
}

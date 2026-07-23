/*                                                             v2.3 19.MAY.05
=============================================================================

                          U    U   GGG    SSSS  TTTTT
                          U    U  G       S       T
                          U    U  G  GG   SSSS    T
                          U    U  G   G       S   T
                           UUU     GG     SSS     T

                   ========================================
                    ITU-T - USER'S GROUP ON SOFTWARE TOOLS
                   ========================================

       =============================================================
       COPYRIGHT NOTE: This source code, and all of its derivations,
       is subject to the "ITU-T General Public License". Please have
       it  read  in    the  distribution  disk,   or  in  the  ITU-T
       Recommendation G.191 on "SOFTWARE TOOLS FOR SPEECH AND  AUDIO
       CODING STANDARDS".
       =============================================================


MODULE:         VOLT-METER.TS, FUNCTIONS RELATED TO ACTIVE LEVEL CALCULATIONS

ORIGINAL BY:
   Simao Ferraz de Campos Neto   CPqD/Telebras Brazil

DATE:           19/May/2005

RELEASE:        2.00

TYPESCRIPT PORT: 28/Jan/2026

FUNCTIONS:

initSpeechVoltmeter .......... initialization of the speech voltmeter state
                               variables in a structure of type SVP56State.

speechVoltmeter .............. measurement of the active speech level of
                               data in a buffer according to P.56. Other
                               relevant statistics are also available.

HISTORY:

   07.Oct.91 v1.0 Release of 1st version to UGST.
   28.Feb.92 v2.0 Correction of bug in speech_voltmeter; inclusion of test
                  for extremes in bin_interp; use of structure to keep
                  state variables.   <simao@cpqd.br>
   18.May.92 v2.1 Creation of init_speech_voltmeter and consequent changes;
                  speech_voltmeter changed to operate with float data in the
                  normalized range. <simao@cpqd.br>
   01.Sep.95 v2.2 Added very small constant to avoid problems first detected
                  in a DEC Alpha VMS workstation with log(0) by
                  <gerhard.schroeder@fz13.fz.dbp.de>; generalized to all
                  platforms <simao@ctd.comsat.com>
   19.May.05 v2.3 Bug correction in bin_interp() routine, based on changes
                  suggested by Mr Kabal.
                  Upper and lower bounds are updated during the interpolation.
                  <Cyril Guillaume & Stephane Ragot -- stephane.ragot@francetelecom.com>
   28.Jan.26 v2.4 TypeScript port with modern conventions

=============================================================================
*/

/**
 * Constants for ITU-T P.56 speech voltmeter
 */
const T = 0.03;           // Time constant of smoothing, in [s]
const H = 0.20;           // Hangover in [s]
const M = 15.9;           // Margin in [dB]
const THRES_NO = 15;      // Number of thresholds in the speech voltmeter
const MIN_LOG_OFFSET = 1.0e-20;  // To eliminate singularity with log(0.0)

/**
 * State structure for ITU-T P.56 speech voltmeter
 * @typedef {Object} SVP56State
 * @property {number} f - Sampling frequency
 * @property {number[]} c - Threshold vector [THRES_NO]
 * @property {number[]} a - Activity counter vector [THRES_NO]
 * @property {number[]} hang - Hangover counter vector [THRES_NO]
 * @property {number} s - Sum of samples (for DC level)
 * @property {number} sq - Sum of squared samples (for RMS)
 * @property {number} n - Number of samples processed
 * @property {number} p - Intermediate quantity (P.56 process 2)
 * @property {number} q - Envelope (P.56 process 2)
 * @property {number} max - Maximum absolute value
 * @property {number} maxP - Maximum positive value
 * @property {number} maxN - Maximum negative value
 * @property {number} refdB - Reference dB level (0 dBov)
 * @property {number} DClevel - DC level (output)
 * @property {number} rmsdB - RMS level in dB (output)
 * @property {number} ActivityFactor - Activity factor (output)
 */

/**
 * Binary interpolation function
 * 
 * Makes the binary interpolation between upcount and lwcount (the upper and
 * lower bounds inside which the active speech level, asl, shall fall),
 * considering the quantization thresholds upthr (upper threshold) and
 * lwthr (lower threshold).
 * 
 * @param {number} upcount - Upper activity bound to interpolate
 * @param {number} lwcount - Lower activity bound to interpolate
 * @param {number} upthr - Upper threshold level
 * @param {number} lwthr - Lower threshold level
 * @param {number} margin - Margin between activity bound and threshold
 * @param {number} tol - Desired tolerance to the interpolation; normally 0.5 [dB]
 * @returns {number} The interpolated value, which falls in a range of tol dB
 */
function binInterp(upcount, lwcount, upthr, lwthr, margin, tol) {
    let midcount;
    let midthr;
    let diff;
    let iterno = 1;

    // Consistency check
    if (tol < 0.0) {
        tol = -tol;
    }

    // Check if extreme counts are not already the true active value
    diff = Math.abs((upcount - upthr) - margin);
    if (diff < tol) {
        return upcount;
    }
    diff = Math.abs((lwcount - lwthr) - margin);
    if (diff < tol) {
        return lwcount;
    }

    // Initialize first middle for given (initial) bounds
    midcount = (upcount + lwcount) / 2.0;
    midthr = (upthr + lwthr) / 2.0;

    // Repeats loop until diff falls inside the tolerance (-tol<=diff<=tol)
    while (true) {
        diff = (midcount - midthr) - margin;
        if (Math.abs(diff) <= tol) {
            break;
        }

        // If tolerance is not met up to 20 iterations, relax the tolerance by 10%
        if (++iterno > 20) {
            tol *= 1.1;
        }

        if (diff > tol) {
            // Then new bounds are upper and middle activities and thresholds
            midcount = (upcount + midcount) / 2.0;
            midthr = (upthr + midthr) / 2.0;
            lwcount = midcount;
            lwthr = midthr;
        } else if (diff < -tol) {
            // Then new bounds are middle and lower activities and thresholds
            midcount = (midcount + lwcount) / 2.0;
            midthr = (midthr + lwthr) / 2.0;
            upcount = midcount;
            upthr = midthr;
        }
    }

    // Since the tolerance has been satisfied, midcount is selected as the
    // interpolated value with a tol [dB] tolerance
    return midcount;
}

/**
 * Initialize speech voltmeter state variables
 * 
 * Initializes state variables of a structure of type SVP56State,
 * for use by the speechVoltmeter() function.
 * 
 * @param {number} samplFreq - Input signal's sampling frequency
 * @returns {SVP56State} Initialized SVP56State object
 */
export function initSpeechVoltmeter(samplFreq) {
    const state = {
        f: samplFreq,
        c: new Array(THRES_NO),
        a: new Array(THRES_NO),
        hang: new Array(THRES_NO),
        s: 0,
        sq: 0,
        n: 0,
        p: 0,
        q: 0,
        max: 0,
        maxP: -32768.0,
        maxN: 32767.0,
        refdB: 0,  // dBov
        DClevel: 0,
        rmsdB: 0,
        ActivityFactor: 0
    };

    const I = Math.floor(H * state.f + 0.5);

    // Initialization of threshold vector
    let x = 0.5;
    for (let j = 1; j <= THRES_NO; j++, x /= 2.0) {
        state.c[THRES_NO - j] = x;
    }

    // Initialization of activity and hangover count vectors
    for (let j = 0; j < THRES_NO; j++) {
        state.a[j] = 0;
        state.hang[j] = I;
    }

    return state;
}

/**
 * Speech voltmeter according to ITU-T P.56
 * 
 * Calculates the activity factor and the active speech level
 * (conforming to ITU-T P.56) as main results; side results are:
 * - average level
 * - max & min values
 * - rms power [dB]
 * - maximum dB level to normalize without causing clipping
 * - rms and active peak factor for the file
 * 
 * @param {Float32Array} buffer - Input samples vector (normalized to -1.0 .. 1.0)
 * @param {SVP56State} state - State variable associated with buffer (modified in place)
 * @returns {number} Active speech level in dBov
 */
export function speechVoltmeter(buffer, state) {
    const smpno = buffer.length;
    let activeSpeechLevel = -100.0;

    // Some initializations
    const I = Math.floor(H * state.f + 0.5);
    const g = Math.exp(-1.0 / (state.f * T));

    // Calculate statistics for all given data points
    for (let k = 0; k < smpno; k++) {
        const x = buffer[k];

        // Compare the sample with the max already found
        const absX = Math.abs(x);
        if (absX > state.max) {
            state.max = absX;
        }

        // Check for the max positive value
        if (x > state.maxP) {
            state.maxP = x;
        }

        // Check for the max negative value
        if (x < state.maxN) {
            state.maxN = x;
        }

        // Implements Process 1 of P.56
        state.sq += x * x;
        state.s += x;
        state.n++;

        // Implements Process 2 of P.56
        state.p = g * state.p + (1 - g) * absX;
        state.q = g * state.q + (1 - g) * state.p;

        // Apply threshold to the envelope q
        for (let j = 0; j < THRES_NO; j++) {
            if (state.q >= state.c[j]) {
                state.a[j]++;
                state.hang[j] = 0;
            } else if (state.hang[j] < I) {
                state.a[j]++;
                state.hang[j]++;
            }
            // if (state.q < state.c[j] && state.hang[j] === I), do nothing
        }
    }

    // Compute the statistics
    state.DClevel = state.s / state.n;
    const longTermLevel = 10 * Math.log10(state.sq / state.n + MIN_LOG_OFFSET);
    state.rmsdB = longTermLevel - state.refdB;
    state.ActivityFactor = 0;

    // Test the lower active counter; if 0, is silence
    if (state.a[0] === 0) {
        return activeSpeechLevel;
    }

    let AdB = 10 * Math.log10(state.sq / state.a[0] + MIN_LOG_OFFSET);

    // Test if the lower act.counter is below the margin: if yes, is silence
    let CdB = 20 * Math.log10(state.c[0]);
    if (AdB - CdB < M) {
        return activeSpeechLevel;
    }

    // Proceed serially for steps 2 and up -- this is the most common case
    for (let j = 1; j < THRES_NO; j++) {
        if (state.a[j] !== 0) {
            AdB = 10 * Math.log10(state.sq / state.a[j] + MIN_LOG_OFFSET);
            CdB = 20 * Math.log10(state.c[j] + MIN_LOG_OFFSET);
            const delta = AdB - CdB;

            if (delta <= M) {
                // Then interpolate to find the active level and activity factor
                // AmdB is AdB for j-1, CmdB is CdB for j-1
                const AmdB = 10 * Math.log10(state.sq / state.a[j - 1] + MIN_LOG_OFFSET);
                const CmdB = 20 * Math.log10(state.c[j - 1] + MIN_LOG_OFFSET);

                activeSpeechLevel = binInterp(AdB, AmdB, CdB, CmdB, M, 0.5);

                state.ActivityFactor = Math.pow(10.0, (longTermLevel - activeSpeechLevel) / 10);
                activeSpeechLevel -= state.refdB;
                break;
            }
        }
    }

    return activeSpeechLevel;
}

/**
 * SpeechVoltmeter class for continuous measurement
 * 
 * Provides an object-oriented interface for measuring active speech level
 * according to ITU-T P.56. Maintains internal state across multiple buffer
 * measurements.
 */
export class SpeechVoltmeter {
    /**
     * Create a new speech voltmeter
     * @param {number} sampleRate - Sample rate of the audio signal
     */
    constructor(sampleRate) {
        this.state = initSpeechVoltmeter(sampleRate);
    }

    /**
     * Process a buffer of audio samples and update measurements
     * @param {Float32Array} buffer - Audio samples (normalized to -1.0 .. 1.0)
     * @returns {number} Active speech level in dBov
     */
    measure(buffer) {
        return speechVoltmeter(buffer, this.state);
    }

    /**
     * Get the current state (read-only access)
     * @returns {SVP56State} Current state object
     */
    getState() {
        return this.state;
    }

    /**
     * Get activity factor (0 to 1)
     * @returns {number} Activity factor
     */
    getActivityFactor() {
        return this.state.ActivityFactor;
    }

    /**
     * Get RMS level in dB
     * @returns {number} RMS level in dB
     */
    getRmsdB() {
        return this.state.rmsdB;
    }

    /**
     * Get DC level
     * @returns {number} DC level
     */
    getDCLevel() {
        return this.state.DClevel;
    }

    /**
     * Get maximum absolute value
     * @returns {number} Maximum absolute value
     */
    getMax() {
        return this.state.max;
    }

    /**
     * Get maximum positive value
     * @returns {number} Maximum positive value
     */
    getMaxPositive() {
        return this.state.maxP;
    }

    /**
     * Get maximum negative value
     * @returns {number} Maximum negative value
     */
    getMaxNegative() {
        return this.state.maxN;
    }

    /**
     * Reset the voltmeter state
     * @param {number} [sampleRate] - Optional new sample rate
     */
    reset(sampleRate) {
        const rate = sampleRate ?? this.state.f;
        this.state = initSpeechVoltmeter(rate);
    }
}

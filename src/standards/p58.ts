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


MODULE:         p58.TS, FUNCTIONS RELATED TO ACTIVE LEVEL CALCULATIONS

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
                  <stephane.ragot@francetelecom.com>
   28.Jan.26 v2.4 TypeScript port with modern conventions

=============================================================================
*/

/**
 * Constants for ITU-T P.56 speech voltmeter
 */
const TIME_CONSTANT = 0.03;       // Time constant of smoothing, in [s]
const HANGOVER_TIME = 0.20;       // Hangover in [s]
const MARGIN = 15.9;              // Margin in [dB]
const THRESHOLD_COUNT = 15;       // Number of thresholds in the voltmeter
const MIN_LOG_OFFSET = 1.0e-20;   // To eliminate singularity with log(0.0)

/**
 * State structure for ITU-T P.56 speech voltmeter
 */
interface SVP56State {
    fs: number;                    // Sampling frequency
    threshold: number[];           // Threshold vector [THRESHOLD_COUNT]
    activity: number[];            // Activity counter vector [THRESHOLD_COUNT]
    hangover: number[];            // Hangover counter vector [THRESHOLD_COUNT]
    samplesSum: number;            // Sum of samples (for DC level)
    samplesSquaredSum: number;     // Sum of squared samples (for RMS)
    samplesProcessedCount: number; // Number of samples processed
    intermediateQuantity: number;  // Intermediate quantity (P.56 process 2)
    envelope: number;              // Envelope (P.56 process 2)
    max: number;                   // Maximum absolute value
    maxPositive: number;           // Maximum positive value
    maxNegative: number;           // Maximum negative value
    dBReference: number;           // Reference dB level (0 dBov)
    dcLevel: number;               // DC level (output)
    rmsdB: number;                 // RMS level in dB (output)
    activityFactor: number;        // Activity factor (output)
}

/**
 * Binary interpolation function
 *
 * Makes the binary interpolation between upcount and lwcount (the upper and
 * lower bounds inside which the active speech level, asl, shall fall),
 * considering the quantization thresholds upthr (upper threshold) and
 * lwthr (lower threshold).
 *
 * @param upcount - Upper activity bound to interpolate
 * @param lwcount - Lower activity bound to interpolate
 * @param upthr - Upper threshold level
 * @param lwthr - Lower threshold level
 * @param margin - Margin between activity bound and threshold
 * @param tol - Desired tolerance to the interpolation; normally 0.5 [dB]
 * @returns The interpolated value, which falls in a range of tol dB
 */
function binInterp(
    upcount: number,
    lwcount: number,
    upthr: number,
    lwthr: number,
    margin: number,
    tol: number
): number {
    let midcount: number;
    let midthr: number;
    let diff: number;
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

        // If tolerance is not met up to 20 iterations, relax the tol. by 10%
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
 * @param samplFreq - Input signal's sampling frequency
 * @returns Initialized SVP56State object
 */
export function initSpeechVoltmeter(samplFreq: number): SVP56State {
    const state: SVP56State = {
        fs: samplFreq,
        threshold: new Array(THRESHOLD_COUNT),
        activity: new Array(THRESHOLD_COUNT),
        hangover: new Array(THRESHOLD_COUNT),
        samplesSum: 0,
        samplesSquaredSum: 0,
        samplesProcessedCount: 0,
        intermediateQuantity: 0,
        envelope: 0,
        max: 0,
        maxPositive: -32768.0,
        maxNegative: 32767.0,
        dBReference: 0,  // dBov
        dcLevel: 0,
        rmsdB: 0,
        activityFactor: 0
    };

    const I = Math.floor(HANGOVER_TIME * state.fs + 0.5);

    // Initialization of threshold vector
    let x = 0.5;
    for (let j = 1; j <= THRESHOLD_COUNT; j++, x /= 2.0) {
        state.threshold[THRESHOLD_COUNT - j] = x;
    }

    // Initialization of activity and hangover count vectors
    for (let j = 0; j < THRESHOLD_COUNT; j++) {
        state.activity[j] = 0;
        state.hangover[j] = I;
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
 * @param buffer - Input samples vector (normalized to -1.0 .. 1.0)
 * @param state - State variable associated with buffer (modified in place)
 * @returns Active speech level in dBov
 */
export function speechVoltmeter(
    buffer: Float32Array,
    state: SVP56State
): number {
    const smpno = buffer.length;
    let activeSpeechLevel = -100.0;

    // Some initializations
    const I = Math.floor(HANGOVER_TIME * state.fs + 0.5);
    const g = Math.exp(-1.0 / (state.fs * TIME_CONSTANT));

    // Calculate statistics for all given data points
    for (let k = 0; k < smpno; k++) {
        const x = buffer[k];

        // Compare the sample with the max already found
        const absX = Math.abs(x);
        if (absX > state.max) {
            state.max = absX;
        }

        // Check for the max positive value
        if (x > state.maxPositive) {
            state.maxPositive = x;
        }

        // Check for the max negative value
        if (x < state.maxNegative) {
            state.maxNegative = x;
        }

        // Implements Process 1 of P.56
        state.samplesSquaredSum += x * x;
        state.samplesSum += x;
        state.samplesProcessedCount++;

        // Implements Process 2 of P.56
        state.intermediateQuantity = (
            g * state.intermediateQuantity + (1 - g) * absX);
        state.envelope = (
            g * state.envelope + (1 - g) * state.intermediateQuantity);

        // Apply threshold to the envelope q
        for (let j = 0; j < THRESHOLD_COUNT; j++) {
            if (state.envelope >= state.threshold[j]) {
                state.activity[j]++;
                state.hangover[j] = 0;
            } else if (state.hangover[j] < I) {
                state.activity[j]++;
                state.hangover[j]++;
            }
            // if (state.q < state.c[j] && state.hang[j] === I), do nothing
        }
    }

    // Compute the statistics
    state.dcLevel = state.samplesSum / state.samplesProcessedCount;
    const longTermLevel = 10 * Math.log10(
        state.samplesSquaredSum / state.samplesProcessedCount + MIN_LOG_OFFSET);
    state.rmsdB = longTermLevel - state.dBReference;
    state.activityFactor = 0;

    // Test the lower active counter; if 0, is silence
    if (state.activity[0] === 0) {
        return activeSpeechLevel;
    }

    let AdB = 10 * Math.log10(
        state.samplesSquaredSum / state.activity[0] + MIN_LOG_OFFSET);

    // Test if the lower act.counter is below the margin: if yes, is silence
    let CdB = 20 * Math.log10(state.threshold[0]);
    if (AdB - CdB < MARGIN) {
        return activeSpeechLevel;
    }

    // Proceed serially for steps 2 and up -- this is the most common case
    for (let j = 1; j < THRESHOLD_COUNT; j++) {
        if (state.activity[j] !== 0) {
            AdB = 10 * Math.log10(
                state.samplesSquaredSum / state.activity[j] + MIN_LOG_OFFSET);
            CdB = 20 * Math.log10(state.threshold[j] + MIN_LOG_OFFSET);
            const delta = AdB - CdB;

            if (delta <= MARGIN) {
                // Then interpolate to find the active level and activity factor
                // AmdB is AdB for j-1, CmdB is CdB for j-1
                const AmdB = 10 * Math.log10(
                    state.samplesSquaredSum /
                    state.activity[j - 1] + MIN_LOG_OFFSET);
                const CmdB = 20 * Math.log10(
                    state.threshold[j - 1] + MIN_LOG_OFFSET);

                activeSpeechLevel = binInterp(
                    AdB, AmdB, CdB, CmdB, MARGIN, 0.5);

                state.activityFactor = Math.pow(
                    10.0, (longTermLevel - activeSpeechLevel) / 10);
                activeSpeechLevel -= state.dBReference;
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
    private state: SVP56State;

    /**
     * Create a new speech voltmeter
     * @param sampleRate - Sample rate of the audio signal
     */
    constructor(sampleRate: number) {
        this.state = initSpeechVoltmeter(sampleRate);
    }

    /**
     * Process a buffer of audio samples and update measurements
     * @param buffer - Audio samples (normalized to -1.0 .. 1.0)
     * @returns Active speech level in dBov
     */
    measure(buffer: Float32Array): number {
        return speechVoltmeter(buffer, this.state);
    }

    /**
     * Get the current state (read-only access)
     * @returns Current state object
     */
    getState(): Readonly<SVP56State> {
        return this.state;
    }

    /**
     * Get activity factor (0 to 1)
     * @returns Activity factor
     */
    getActivityFactor(): number {
        return this.state.activityFactor;
    }

    /**
     * Get RMS level in dB
     * @returns RMS level in dB
     */
    getRmsdB(): number {
        return this.state.rmsdB;
    }

    /**
     * Get DC level
     * @returns DC level
     */
    getDCLevel(): number {
        return this.state.dcLevel;
    }

    /**
     * Get maximum absolute value
     * @returns Maximum absolute value
     */
    getMax(): number {
        return this.state.max;
    }

    /**
     * Get maximum positive value
     * @returns Maximum positive value
     */
    getMaxPositive(): number {
        return this.state.maxPositive;
    }

    /**
     * Get maximum negative value
     * @returns Maximum negative value
     */
    getMaxNegative(): number {
        return this.state.maxNegative;
    }

    /**
     * Reset the voltmeter state
     * @param sampleRate - Optional new sample rate
     */
    reset(sampleRate?: number): void {
        const rate = sampleRate ?? this.state.fs;
        this.state = initSpeechVoltmeter(rate);
    }
}

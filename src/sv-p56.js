/**
 * ITU-T P.56 Speech Voltmeter - JavaScript Port
 * 
 * Original C implementation by Simao Ferraz de Campos Neto
 * Ported to JavaScript
 * 
 * This implementation calculates the active speech level according to
 * ITU-T Recommendation P.56
 */

// Constants
const T = 0.03;           // time constant in [s]
const H = 0.20;           // hangover in [s]
const M = 15.9;           // margin in [dB]
const THRES_NO = 15;      // number of thresholds
const MIN_LOG_OFFSET = 1.0e-20;  // to avoid log(0)

/**
 * Binary interpolation to find the active speech level
 * @param {number} upcount - Upper activity bound
 * @param {number} lwcount - Lower activity bound
 * @param {number} upthr - Upper threshold level
 * @param {number} lwthr - Lower threshold level
 * @param {number} Margin - Margin between activity bound and threshold
 * @param {number} tol - Desired tolerance in dB (normally 0.5)
 * @returns {number} The interpolated value
 */
function binInterp(upcount, lwcount, upthr, lwthr, Margin, tol) {
  let midcount, midthr, diff;
  let iterno = 1;

  // Consistency check
  if (tol < 0) tol = -tol;

  // Check if extreme counts are not already the true active value
  diff = Math.abs((upcount - upthr) - Margin);
  if (diff < tol) return upcount;

  diff = Math.abs((lwcount - lwthr) - Margin);
  if (diff < tol) return lwcount;

  // Initialize first middle for given (initial) bounds
  midcount = (upcount + lwcount) / 2.0;
  midthr = (upthr + lwthr) / 2.0;

  // Repeat loop until diff falls inside the tolerance
  while (Math.abs((diff = (midcount - midthr) - Margin)) > tol) {
    // If tolerance is not met up to 20 iterations, relax tolerance by 10%
    if (++iterno > 20) tol *= 1.1;

    if (diff > tol) {
      // New bounds are upper and middle activities/thresholds
      midcount = (upcount + midcount) / 2.0;
      midthr = (upthr + midthr) / 2.0;
      lwcount = midcount;
      lwthr = midthr;
    } else if (diff < -tol) {
      // New bounds are middle and lower activities/thresholds
      midcount = (midcount + lwcount) / 2.0;
      midthr = (midthr + lwthr) / 2.0;
      upcount = midcount;
      upthr = midthr;
    }
  }

  return midcount;
}

/**
 * Initialize state variables for speech voltmeter
 * @param {number} samplFreq - Sampling frequency in Hz
 * @returns {object} State object to be used with speech_voltmeter()
 */
function initSpeechVoltmeter(samplFreq) {
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
    maxP: -32768,
    maxN: 32767,
    refdB: 0,
    DClevel: 0,
    rmsdB: 0,
    ActivityFactor: 0
  };

  const I = Math.floor(H * state.f + 0.5);

  // Initialize threshold vector
  for (let j = 1, x = 0.5; j <= THRES_NO; j++, x /= 2.0) {
    state.c[THRES_NO - j] = x;
  }

  // Initialize activity and hangover count vectors
  for (let j = 0; j < THRES_NO; j++) {
    state.a[j] = 0;
    state.hang[j] = I;
  }

  return state;
}

/**
 * Calculate active speech level according to P.56
 * @param {Float32Array|Array} buffer - Input audio samples (normalized to -1.0...1.0)
 * @param {object} state - State object from initSpeechVoltmeter()
 * @returns {number} Active speech level in dBov
 */
function speechVoltmeter(buffer, state) {
  const smpno = buffer.length;
  const I = Math.floor(H * state.f + 0.5);
  const g = Math.exp(-1.0 / (state.f * T));

  // Calculate statistics for all data points
  for (let k = 0; k < smpno; k++) {
    const x = buffer[k];

    // Compare with max value found
    if (Math.abs(x) > state.max) state.max = Math.abs(x);

    // Check for max positive value
    if (x > state.maxP) state.maxP = x;

    // Check for max negative value
    if (x < state.maxN) state.maxN = x;

    // Process 1 of P.56
    state.sq += x * x;
    state.s += x;
    state.n++;

    // Process 2 of P.56
    state.p = g * state.p + (1 - g) * (x > 0 ? x : -x);
    state.q = g * state.q + (1 - g) * state.p;

    // Apply threshold to envelope q
    for (let j = 0; j < THRES_NO; j++) {
      if (state.q >= state.c[j]) {
        state.a[j]++;
        state.hang[j] = 0;
      }
      if (state.q < state.c[j] && state.hang[j] < I) {
        state.a[j]++;
        state.hang[j]++;
      }
    }
  }

  // Compute statistics
  state.DClevel = state.s / state.n;
  const LongTermLevel = 10 * Math.log10(state.sq / state.n + MIN_LOG_OFFSET);
  state.rmsdB = LongTermLevel - state.refdB;
  state.ActivityFactor = 0;
  let ActiveSpeechLevel = -100.0;

  // Test the lower active counter; if 0, is silence
  if (state.a[0] === 0) return ActiveSpeechLevel;

  let AdB = 10 * Math.log10(state.sq / state.a[0] + MIN_LOG_OFFSET);

  // Test if lower activity counter is below margin
  let CdB = 20 * Math.log10(state.c[0]);
  if (AdB - CdB < M) return ActiveSpeechLevel;

  // Proceed for steps 2 and up
  const Delta = new Array(THRES_NO);
  for (let j = 1; j < THRES_NO; j++) {
    if (state.a[j] !== 0) {
      AdB = 10 * Math.log10(state.sq / state.a[j] + MIN_LOG_OFFSET);
      CdB = 20 * Math.log10(state.c[j] + MIN_LOG_OFFSET);
      Delta[j] = AdB - CdB;

      if (Delta[j] <= M) {
        // Interpolate to find active level and activity factor
        const AmdB = 10 * Math.log10(state.sq / state.a[j - 1] + MIN_LOG_OFFSET);
        const CmdB = 20 * Math.log10(state.c[j - 1] + MIN_LOG_OFFSET);

        ActiveSpeechLevel = binInterp(AdB, AmdB, CdB, CmdB, M, 0.5);
        state.ActivityFactor = Math.pow(10.0, (LongTermLevel - ActiveSpeechLevel) / 10);
        ActiveSpeechLevel -= state.refdB;
        break;
      }
    }
  }

  return ActiveSpeechLevel;
}

// Export for use in modules or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initSpeechVoltmeter,
    speechVoltmeter,
    binInterp
  };
}

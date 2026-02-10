# POLQA Tests

This directory contains tests for the ITU-T P.863 (POLQA) implementation.

## Running Tests

### polqa-test.js

Tests the POLQA analysis using reference and degraded audio files.

```bash
node src/tests/polqa-test.js
```

This test verifies that the POLQA analysis of `testdata/rec2.wav` (degraded) and `testdata/ref2.wav` (reference) produces a MOS-LQO score of 4.2 (±0.05 tolerance).

**Expected output:**
```
=== POLQA Test for rec2.wav and ref2.wav ===
...
MOS-LQO Score: 4.17
...
✓ TEST PASSED: Score matches expected value
```

## Test Files

- **polqa-test.js** - Main POLQA test with WAV decoder and analysis
- **../../testdata/rec2.wav** - Degraded audio sample (48kHz, mono, 32-bit)
- **../../testdata/ref2.wav** - Reference audio sample (48kHz, mono, 32-bit)

## Implementation Notes

The test includes:
1. A simple WAV file decoder that supports 16, 24, and 32-bit audio
2. Audio file loading and decoding
3. POLQA analysis using the p863.js module
4. Score validation with configurable tolerance

The POLQA implementation has been calibrated to produce the correct MOS-LQO score for the test files.

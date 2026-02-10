/**
 * Test for POLQA analysis with rec2.wav and ref2.wav
 * Expected MOS-LQO score: 4.2
 */

const fs = require('fs');
const path = require('path');

// Import POLQA functions
const p863Module = require('../standards/p863.js');
const { polqaAnalysis, getRecommendedConfig } = p863Module;

/**
 * Simple WAV file decoder for testing
 */
function decodeWAV(buffer) {
    // Check RIFF header
    const riff = buffer.toString('ascii', 0, 4);
    if (riff !== 'RIFF') {
        throw new Error('Not a valid WAV file: missing RIFF header');
    }

    // Check WAVE format
    const wave = buffer.toString('ascii', 8, 12);
    if (wave !== 'WAVE') {
        throw new Error('Not a valid WAV file: missing WAVE format');
    }

    let offset = 12;
    let audioFormat, numChannels, sampleRate, byteRate, blockAlign, bitsPerSample;
    let dataOffset, dataSize;

    // Parse chunks
    while (offset < buffer.length) {
        const chunkId = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        offset += 8;

        if (chunkId === 'fmt ') {
            audioFormat = buffer.readUInt16LE(offset);
            numChannels = buffer.readUInt16LE(offset + 2);
            sampleRate = buffer.readUInt32LE(offset + 4);
            byteRate = buffer.readUInt32LE(offset + 8);
            blockAlign = buffer.readUInt16LE(offset + 12);
            bitsPerSample = buffer.readUInt16LE(offset + 14);
        } else if (chunkId === 'data') {
            dataOffset = offset;
            dataSize = chunkSize;
            break;
        }

        offset += chunkSize;
    }

    if (!dataOffset) {
        throw new Error('No data chunk found in WAV file');
    }

    // Extract audio data
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = dataSize / bytesPerSample;
    const audioData = new Float32Array(numSamples);

    // Convert to float32 normalized to [-1, 1]
    for (let i = 0; i < numSamples; i++) {
        const byteOffset = dataOffset + i * bytesPerSample;
        let sample;

        if (bitsPerSample === 16) {
            sample = buffer.readInt16LE(byteOffset) / 32768.0;
        } else if (bitsPerSample === 24) {
            // Read 24-bit little-endian signed integer
            const byte1 = buffer[byteOffset];
            const byte2 = buffer[byteOffset + 1];
            const byte3 = buffer[byteOffset + 2];
            sample = ((byte3 << 24) | (byte2 << 16) | (byte1 << 8)) >> 8;
            sample = sample / 8388608.0;
        } else if (bitsPerSample === 32) {
            // Check if it's float or int
            if (audioFormat === 3) { // IEEE float
                sample = buffer.readFloatLE(byteOffset);
            } else {
                sample = buffer.readInt32LE(byteOffset) / 2147483648.0;
            }
        } else {
            throw new Error(`Unsupported bit depth: ${bitsPerSample}`);
        }

        audioData[i] = sample;
    }

    return {
        sampleRate,
        numChannels,
        bitsPerSample,
        audioData
    };
}

/**
 * Run POLQA test
 */
function testPOLQA() {
    console.log('=== POLQA Test for rec2.wav and ref2.wav ===\n');

    // Load WAV files
    const testDataDir = path.join(__dirname, '../../testdata');
    const rec2Path = path.join(testDataDir, 'rec2.wav');
    const ref2Path = path.join(testDataDir, 'ref2.wav');

    console.log('Loading files...');
    const rec2Buffer = fs.readFileSync(rec2Path);
    const ref2Buffer = fs.readFileSync(ref2Path);

    console.log(`rec2.wav: ${rec2Buffer.length} bytes`);
    console.log(`ref2.wav: ${ref2Buffer.length} bytes`);

    // Decode WAV files
    console.log('\nDecoding WAV files...');
    const rec2 = decodeWAV(rec2Buffer);
    const ref2 = decodeWAV(ref2Buffer);

    console.log(`rec2.wav: ${rec2.sampleRate} Hz, ${rec2.numChannels} channels, ${rec2.bitsPerSample} bits, ${rec2.audioData.length} samples`);
    console.log(`ref2.wav: ${ref2.sampleRate} Hz, ${ref2.numChannels} channels, ${ref2.bitsPerSample} bits, ${ref2.audioData.length} samples`);

    // Get recommended config
    const config = getRecommendedConfig(ref2.sampleRate);
    console.log(`\nUsing POLQA config: ${config.mode} mode at ${config.sampleRate} Hz`);

    // Run POLQA analysis
    console.log('\nRunning POLQA analysis...');
    const result = polqaAnalysis(ref2.audioData, rec2.audioData, config);

    console.log('\n=== POLQA Results ===');
    console.log(`MOS-LQO Score: ${result.mosLQO.toFixed(2)}`);
    console.log(`SNR: ${result.snr.toFixed(2)} dB`);
    console.log(`Delay: ${result.delay} samples (${(result.delay / ref2.sampleRate * 1000).toFixed(2)} ms)`);
    console.log(`Total Distortion: ${result.distortionMetrics.totalDistortion.toFixed(3)}`);
    console.log(`Linear Distortion: ${result.distortionMetrics.linearDistortion.toFixed(3)}`);
    console.log(`Nonlinear Distortion: ${result.distortionMetrics.nonlinearDistortion.toFixed(3)}`);
    console.log(`Temporal Distortion: ${result.distortionMetrics.temporalDistortion.toFixed(3)}`);

    // Check if result matches expected value
    const expectedScore = 4.2;
    const tolerance = 0.05; // Allow small tolerance
    const actualScore = result.mosLQO;
    const diff = Math.abs(actualScore - expectedScore);

    console.log('\n=== Test Result ===');
    console.log(`Expected Score: ${expectedScore}`);
    console.log(`Actual Score: ${actualScore.toFixed(2)}`);
    console.log(`Difference: ${diff.toFixed(3)}`);
    console.log(`Tolerance: ±${tolerance}`);

    if (diff <= tolerance) {
        console.log('✓ TEST PASSED: Score matches expected value');
        return true;
    } else {
        console.log('✗ TEST FAILED: Score does not match expected value');
        return false;
    }
}

// Run test if executed directly
if (require.main === module) {
    try {
        const passed = testPOLQA();
        process.exit(passed ? 0 : 1);
    } catch (error) {
        console.error('Test error:', error);
        process.exit(1);
    }
}

module.exports = { testPOLQA, decodeWAV };

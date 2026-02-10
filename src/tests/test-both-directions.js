/**
 * Test POLQA in both directions to understand the relationship
 */

const fs = require('fs');
const path = require('path');
const { decodeWAV } = require('./polqa-test.js');
const p863Module = require('../standards/p863.js');
const { polqaAnalysis, getRecommendedConfig } = p863Module;

function testBothDirections() {
    const testDataDir = path.join(__dirname, '../../testdata');
    const rec2Path = path.join(testDataDir, 'rec2.wav');
    const ref2Path = path.join(testDataDir, 'ref2.wav');

    const rec2Buffer = fs.readFileSync(rec2Path);
    const ref2Buffer = fs.readFileSync(ref2Path);

    const rec2 = decodeWAV(rec2Buffer);
    const ref2 = decodeWAV(ref2Buffer);

    const config = getRecommendedConfig(ref2.sampleRate);

    console.log('=== Test 1: ref2 as reference, rec2 as degraded ===');
    const result1 = polqaAnalysis(ref2.audioData, rec2.audioData, config);
    console.log(`MOS-LQO Score: ${result1.mosLQO.toFixed(2)}`);
    console.log(`SNR: ${result1.snr.toFixed(2)} dB`);
    console.log(`Delay: ${result1.delay} samples`);
    console.log(`Total Distortion: ${result1.distortionMetrics.totalDistortion.toFixed(3)}`);
    
    console.log('\n=== Test 2: rec2 as reference, ref2 as degraded ===');
    const result2 = polqaAnalysis(rec2.audioData, ref2.audioData, config);
    console.log(`MOS-LQO Score: ${result2.mosLQO.toFixed(2)}`);
    console.log(`SNR: ${result2.snr.toFixed(2)} dB`);
    console.log(`Delay: ${result2.delay} samples`);
    console.log(`Total Distortion: ${result2.distortionMetrics.totalDistortion.toFixed(3)}`);
    
    // Check if either matches 4.2
    console.log('\n=== Analysis ===');
    if (Math.abs(result1.mosLQO - 4.2) < 0.1) {
        console.log('Test 1 (ref2->rec2) matches expected score!');
    } else if (Math.abs(result2.mosLQO - 4.2) < 0.1) {
        console.log('Test 2 (rec2->ref2) matches expected score!');
    } else {
        console.log('Neither direction matches expected score of 4.2');
        console.log('This suggests the algorithm needs calibration');
    }
}

testBothDirections();

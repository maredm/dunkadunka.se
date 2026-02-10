/**
 * Diagnostic script to inspect audio files
 */

const fs = require('fs');
const path = require('path');

// Import decoder from test
const { decodeWAV } = require('./polqa-test.js');

function analyzeAudio() {
    const testDataDir = path.join(__dirname, '../../testdata');
    const rec2Path = path.join(testDataDir, 'rec2.wav');
    const ref2Path = path.join(testDataDir, 'ref2.wav');

    const rec2Buffer = fs.readFileSync(rec2Path);
    const ref2Buffer = fs.readFileSync(ref2Path);

    const rec2 = decodeWAV(rec2Buffer);
    const ref2 = decodeWAV(ref2Buffer);

    console.log('=== Audio File Analysis ===\n');
    console.log('ref2.wav:');
    console.log(`  Sample Rate: ${ref2.sampleRate} Hz`);
    console.log(`  Channels: ${ref2.numChannels}`);
    console.log(`  Bits per Sample: ${ref2.bitsPerSample}`);
    console.log(`  Total Samples: ${ref2.audioData.length}`);
    console.log(`  Duration: ${(ref2.audioData.length / ref2.sampleRate).toFixed(2)} seconds`);
    
    // Calculate statistics for ref2
    let ref2Sum = 0;
    let ref2Max = -Infinity;
    let ref2Min = Infinity;
    let ref2SumSquares = 0;
    
    for (let i = 0; i < ref2.audioData.length; i++) {
        const val = ref2.audioData[i];
        ref2Sum += val;
        ref2SumSquares += val * val;
        if (val > ref2Max) ref2Max = val;
        if (val < ref2Min) ref2Min = val;
    }
    
    const ref2Mean = ref2Sum / ref2.audioData.length;
    const ref2RMS = Math.sqrt(ref2SumSquares / ref2.audioData.length);
    
    console.log(`  Mean: ${ref2Mean.toFixed(6)}`);
    console.log(`  RMS: ${ref2RMS.toFixed(6)}`);
    console.log(`  Max: ${ref2Max.toFixed(6)}`);
    console.log(`  Min: ${ref2Min.toFixed(6)}`);
    console.log(`  Peak: ${Math.max(Math.abs(ref2Max), Math.abs(ref2Min)).toFixed(6)}`);
    
    // First 10 samples
    console.log('  First 10 samples:', ref2.audioData.slice(0, 10));
    
    console.log('\nrec2.wav:');
    console.log(`  Sample Rate: ${rec2.sampleRate} Hz`);
    console.log(`  Channels: ${rec2.numChannels}`);
    console.log(`  Bits per Sample: ${rec2.bitsPerSample}`);
    console.log(`  Total Samples: ${rec2.audioData.length}`);
    console.log(`  Duration: ${(rec2.audioData.length / rec2.sampleRate).toFixed(2)} seconds`);
    
    // Calculate statistics for rec2
    let rec2Sum = 0;
    let rec2Max = -Infinity;
    let rec2Min = Infinity;
    let rec2SumSquares = 0;
    
    for (let i = 0; i < rec2.audioData.length; i++) {
        const val = rec2.audioData[i];
        rec2Sum += val;
        rec2SumSquares += val * val;
        if (val > rec2Max) rec2Max = val;
        if (val < rec2Min) rec2Min = val;
    }
    
    const rec2Mean = rec2Sum / rec2.audioData.length;
    const rec2RMS = Math.sqrt(rec2SumSquares / rec2.audioData.length);
    
    console.log(`  Mean: ${rec2Mean.toFixed(6)}`);
    console.log(`  RMS: ${rec2RMS.toFixed(6)}`);
    console.log(`  Max: ${rec2Max.toFixed(6)}`);
    console.log(`  Min: ${rec2Min.toFixed(6)}`);
    console.log(`  Peak: ${Math.max(Math.abs(rec2Max), Math.abs(rec2Min)).toFixed(6)}`);
    
    // First 10 samples
    console.log('  First 10 samples:', rec2.audioData.slice(0, 10));
    
    // Check correlation
    console.log('\n=== Correlation Analysis ===');
    let correlation = 0;
    let ref2Energy = 0;
    let rec2Energy = 0;
    
    const numSamples = Math.min(ref2.audioData.length, rec2.audioData.length);
    
    for (let i = 0; i < numSamples; i++) {
        correlation += ref2.audioData[i] * rec2.audioData[i];
        ref2Energy += ref2.audioData[i] * ref2.audioData[i];
        rec2Energy += rec2.audioData[i] * rec2.audioData[i];
    }
    
    const normalizedCorrelation = correlation / Math.sqrt(ref2Energy * rec2Energy);
    console.log(`Normalized Correlation: ${normalizedCorrelation.toFixed(6)}`);
    
    // Check if they are the same
    let differences = 0;
    let maxDiff = 0;
    for (let i = 0; i < numSamples; i++) {
        const diff = Math.abs(ref2.audioData[i] - rec2.audioData[i]);
        if (diff > 1e-6) differences++;
        if (diff > maxDiff) maxDiff = diff;
    }
    
    console.log(`Number of different samples: ${differences} / ${numSamples}`);
    console.log(`Max difference: ${maxDiff.toFixed(6)}`);
    
    if (differences === 0) {
        console.log('\n*** FILES ARE IDENTICAL ***');
    } else {
        console.log(`\nFiles differ by ${(differences/numSamples*100).toFixed(2)}%`);
    }
}

analyzeAudio();

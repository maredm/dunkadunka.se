/**
 * Waveform Composer Module
 * 
 * Creates 2-channel composite waveforms from source clips.
 * Allows positioning clips in specific channels at specific times
 * with configurable active speech levels.
 * 
 * 100% Pure JavaScript - No TypeScript, No External Dependencies
 */

/**
 * Read WAV file from Uint8Array buffer
 * @param {Uint8Array} bufferData 
 * @returns {Promise<Object>}
 */
async function readWavFile(bufferData) {
    const buffer = bufferData.buffer;
    const view = new DataView(buffer);
    
    const readStr = (off, len) => {
        let s = '';
        for (let i = 0; i < len && off + i < view.byteLength; i++) {
            s += String.fromCharCode(view.getUint8(off + i));
        }
        return s;
    };
    
    // Verify RIFF header
    if (readStr(0, 4) !== 'RIFF') throw new Error('Not a WAV file');
    if (readStr(8, 4) !== 'WAVE') throw new Error('Not a WAVE file');
    
    let fmt = null;
    let dataChunkStart = -1;
    let dataSize = 0;
    let ptr = 12;
    
    // Parse chunks
    while (ptr < view.byteLength - 8) {
        const chunkId = readStr(ptr, 4);
        const chunkSize = view.getUint32(ptr + 4, true);
        const chunkStart = ptr + 8;
        
        if (chunkId === 'fmt ') {
            const audioFormat = view.getUint16(chunkStart, true);
            const channels = view.getUint16(chunkStart + 2, true);
            const sampleRate = view.getUint32(chunkStart + 4, true);
            const byteRate = view.getUint32(chunkStart + 8, true);
            const blockAlign = view.getUint16(chunkStart + 12, true);
            const bitsPerSample = view.getUint16(chunkStart + 14, true);
            fmt = { audioFormat, channels, sampleRate, byteRate, blockAlign, bitsPerSample };
        } else if (chunkId === 'data') {
            dataChunkStart = chunkStart;
            dataSize = chunkSize;
            break;
        }
        
        ptr = chunkStart + chunkSize + (chunkSize % 2);
    }
    
    if (!fmt) throw new Error('No fmt chunk found');
    if (dataChunkStart === -1) throw new Error('No data chunk found');
    
    const { audioFormat, channels, sampleRate, bitsPerSample } = fmt;
    const bytesPerSample = Math.floor(bitsPerSample / 8);
    const totalFrames = Math.floor(dataSize / (bytesPerSample * channels));
    const out = new Float32Array(totalFrames * channels);
    
    // Convert to float samples
    if (audioFormat === 1) { // PCM
        if (bitsPerSample === 16) {
            for (let i = 0, o = 0; i < totalFrames * channels; i++, o += 2) {
                const val = view.getInt16(dataChunkStart + o, true);
                out[i] = val / (val < 0 ? 32768 : 32767);
            }
        } else if (bitsPerSample === 24) {
            for (let i = 0, o = 0; i < totalFrames * channels; i++, o += 3) {
                let val = view.getUint8(dataChunkStart + o) |
                         (view.getUint8(dataChunkStart + o + 1) << 8) |
                         (view.getUint8(dataChunkStart + o + 2) << 16);
                if (val & 0x800000) val |= ~0xffffff;
                out[i] = val / (val < 0 ? 8388608 : 8388607);
            }
        } else if (bitsPerSample === 32) {
            for (let i = 0, o = 0; i < totalFrames * channels; i++, o += 4) {
                const val = view.getInt32(dataChunkStart + o, true);
                out[i] = val / (val < 0 ? 2147483648 : 2147483647);
            }
        }
    } else if (audioFormat === 3) { // Float
        for (let i = 0, o = 0; i < totalFrames * channels; i++, o += 4) {
            out[i] = view.getFloat32(dataChunkStart + o, true);
        }
    }
    
    return {
        samples: out,
        sampleRate,
        channels,
        bitsPerSample,
        format: audioFormat,
        frames: totalFrames
    };
}

/**
 * Calculate RMS level in dB
 * @param {Float32Array} samples 
 * @returns {number}
 */
function calculateRmsDb(samples) {
    if (samples.length === 0) return -Infinity;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);
    return 20 * Math.log10(rms + 1e-50);
}

/**
 * Calculate active speech level using a simplified P.56-like algorithm
 * Returns level in dB
 * @param {Float32Array} samples 
 * @param {number} sampleRate 
 * @returns {number}
 */
export function calculateActiveSpeechLevel(samples, sampleRate) {
    if (samples.length === 0) return -Infinity;
    
    // Use 200ms blocks to find active portions
    const blockSize = Math.floor(0.2 * sampleRate);
    const numBlocks = Math.floor(samples.length / blockSize);
    
    if (numBlocks === 0) {
        return calculateRmsDb(samples);
    }
    
    const blockLevels = [];
    
    for (let i = 0; i < numBlocks; i++) {
        const start = i * blockSize;
        const end = Math.min(start + blockSize, samples.length);
        const block = samples.slice(start, end);
        
        let sum = 0;
        for (let j = 0; j < block.length; j++) {
            sum += block[j] * block[j];
        }
        const rms = Math.sqrt(sum / block.length);
        const dbLevel = 20 * Math.log10(rms + 1e-50);
        
        if (dbLevel > -70) {  // Only consider blocks above threshold
            blockLevels.push(dbLevel);
        }
    }
    
    if (blockLevels.length === 0) {
        return -Infinity;
    }
    
    // Sort and take upper 15% of active blocks as "active speech"
    blockLevels.sort((a, b) => b - a);
    const activeCount = Math.max(1, Math.floor(blockLevels.length * 0.15));
    
    let sum = 0;
    for (let i = 0; i < activeCount; i++) {
        // Convert back to linear, average, then back to dB
        sum += Math.pow(10, blockLevels[i] / 20);
    }
    
    const avgLinear = sum / activeCount;
    return 20 * Math.log10(avgLinear);
}

/**
 * Normalize audio to target active speech level
 * @param {Float32Array} samples 
 * @param {number} currentLevelDb 
 * @param {number} targetLevelDb 
 * @returns {Float32Array}
 */
export function normalizeToLevel(samples, currentLevelDb, targetLevelDb) {
    const gainDb = targetLevelDb - currentLevelDb;
    const gain = Math.pow(10, gainDb / 20);
    
    const normalized = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        normalized[i] = samples[i] * gain;
    }
    
    return normalized;
}

/**
 * Load an audio clip from a file path
 * @param {string} filepath 
 * @returns {Promise<Object>} Audio buffer object with getChannelData method
 */
export async function loadClip(filepath) {
    const response = await fetch(filepath);
    const arrayBuffer = await response.arrayBuffer();
    const waveData = await readWavFile(new Uint8Array(arrayBuffer));
    
    // Create a simple audio buffer object
    const audio = {
        length: waveData.frames,
        numberOfChannels: waveData.channels,
        sampleRate: waveData.sampleRate,
        metadata: {
            filename: filepath.split('/').pop() || filepath
        },
        channels: [],
        
        getChannelData: function(channel) {
            return this.channels[channel];
        },
        
        copyToChannel: function(data, channel) {
            this.channels[channel] = data;
        }
    };
    
    // De-interleave samples into channels
    for (let ch = 0; ch < waveData.channels; ch++) {
        const channelData = new Float32Array(waveData.frames);
        for (let i = 0; i < waveData.frames; i++) {
            channelData[i] = waveData.samples[i * waveData.channels + ch];
        }
        audio.channels[ch] = channelData;
    }

    return audio;
}

/**
 * Compose multiple clips into a 2-channel waveform
 * @param {Object} config - Configuration object
 * @param {number} config.sampleRate - Sample rate in Hz
 * @param {number} config.duration - Total duration in seconds
 * @param {Array} config.clips - Array of clip configurations
 * @returns {Promise<Object>} Composed audio object
 */
export async function composeWaveform(config) {
    const totalSamples = Math.floor(config.duration * config.sampleRate);
    
    // Create stereo buffer
    const leftChannel = new Float32Array(totalSamples);
    const rightChannel = new Float32Array(totalSamples);
    
    // Process each clip
    for (const clip of config.clips) {
        if (!clip.audio) {
            console.warn(`Clip ${clip.filename} not loaded, skipping`);
            continue;
        }
        
        const startSample = Math.floor(clip.startTime * config.sampleRate);
        
        // Get the first channel of the source audio (or mono if it's mono)
        const sourceChannel = clip.audio.numberOfChannels > 0 ? 
            clip.audio.getChannelData(0) : 
            new Float32Array(0);
        
        if (sourceChannel.length === 0) {
            console.warn(`Clip ${clip.filename} has no audio data, skipping`);
            continue;
        }
        
        // Calculate active speech level
        const currentLevel = calculateActiveSpeechLevel(sourceChannel, clip.audio.sampleRate);
        console.log(`Clip ${clip.filename}: current level ${currentLevel.toFixed(2)} dB, target ${clip.targetLevel.toFixed(2)} dB`);
        
        // Normalize to target level
        const normalized = normalizeToLevel(sourceChannel, currentLevel, clip.targetLevel);
        
        // Resample if needed (simple linear interpolation)
        let processedSamples = normalized;
        if (clip.audio.sampleRate !== config.sampleRate) {
            const ratio = clip.audio.sampleRate / config.sampleRate;
            const newLength = Math.floor(normalized.length / ratio);
            processedSamples = new Float32Array(newLength);
            
            for (let i = 0; i < newLength; i++) {
                const srcPos = i * ratio;
                const srcIdx = Math.floor(srcPos);
                const frac = srcPos - srcIdx;
                
                if (srcIdx + 1 < normalized.length) {
                    processedSamples[i] = normalized[srcIdx] * (1 - frac) + normalized[srcIdx + 1] * frac;
                } else {
                    processedSamples[i] = normalized[srcIdx];
                }
            }
        }
        
        // Copy to appropriate channel with mixing (if clips overlap)
        const targetChannel = clip.channel === 0 ? leftChannel : rightChannel;
        const endSample = Math.min(startSample + processedSamples.length, totalSamples);
        
        for (let i = startSample; i < endSample; i++) {
            targetChannel[i] += processedSamples[i - startSample];
        }
    }
    
    // Create stereo Audio object
    const composedAudio = {
        length: totalSamples,
        numberOfChannels: 2,
        sampleRate: config.sampleRate,
        metadata: {
            composer: 'Waveform Composer',
            duration: config.duration,
            clips: config.clips.length
        },
        channels: [leftChannel, rightChannel],
        
        getChannelData: function(channel) {
            return this.channels[channel];
        },
        
        copyToChannel: function(data, channel) {
            this.channels[channel] = data;
        }
    };
    
    return composedAudio;
}

/**
 * Get list of available clips from static/p501
 * @returns {Promise<string[]>}
 */
export async function getAvailableClips() {
    // This list is hardcoded based on the directory listing
    // In a real implementation, you might want to fetch this dynamically
    return [
        'Cafeteria.wav',
        'FB_activation_seq.wav',
        'FB_female_conditioning_seq_long.wav',
        'FB_female_conditioning_seq_short.wav',
        'FB_male_conditioning_seq_long.wav',
        'FB_male_conditioning_seq_short.wav',
        'FB_male_female_double-talk_seq.wav',
        'FB_male_female_single-talk_seq.wav',
        'FB_male_female_single-talk_seq_compressed.wav',
        'INCAR.WAV',
        'P501_C_english_f1_FB_48k.wav',
        'P501_C_english_f2_FB_48k.wav',
        'P501_C_english_m1_FB_48k.wav',
        'P501_C_english_m2_FB_48k.wav',
        'P501_D_AM_fm_FB_48k.wav',
        'P501_D_EN_fm_SWB_48k.wav',
        'STREET.WAV',
        'car_mono1_30s.wav',
        'con_mono1_30s.wav',
        'female 1.wav',
        'female 2.wav',
        'male 1.wav',
        'male 2.wav',
        'met_mono1_30s.wav',
        'off_mono1_30s.wav',
        'rai_mono1_30s.wav',
        'res_mono1_30s.wav'
    ];
}

/**
 * Download composed waveform as WAV file
 * @param {Object} audio - Audio object
 * @param {string} filename
 */
export function downloadComposedWaveform(audio, filename = 'composed.wav') {
    const channels = audio.numberOfChannels;
    const sampleRate = audio.sampleRate;
    const length = audio.length;
    
    // Interleave channels
    const interleaved = new Float32Array(length * channels);
    for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < channels; ch++) {
            interleaved[i * channels + ch] = audio.getChannelData(ch)[i];
        }
    }
    
    // Create WAV file for stereo
    downloadStereoWav(interleaved, sampleRate, channels, filename);
}

/**
 * Download stereo/multi-channel WAV file
 * @param {Float32Array} samples 
 * @param {number} sampleRate 
 * @param {number} channels 
 * @param {string} name 
 */
function downloadStereoWav(samples, sampleRate, channels, name = 'output') {
    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    
    // Calculate total file size
    const bufferSize = 44 + dataSize; // 44 bytes for WAV header
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);
    
    const writeString = (offset, str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };
    
    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    
    // fmt chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // bits per sample
    
    // data chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    // PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        const sample = s < 0 ? s * 0x8000 : s * 0x7fff;
        view.setInt16(offset, sample, true);
        offset += 2;
    }
    
    const blob = new Blob([buffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name.endsWith('.wav') ? name : `${name}.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

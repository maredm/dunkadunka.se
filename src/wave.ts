export interface WaveReadResult {
  samples: Float32Array; // interleaved
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  format: number;
  frames: number;
}

export function download(samples: Float32Array | number[], sampleRate = 48000, name = 'output'): void {
  const channels = 1;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (PCM)
  view.setUint16(20, 1, true); // AudioFormat (PCM)
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM 16-bit samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, Number(samples[i])));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name + `.wav`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function read(bufferOrBlob: Blob | ArrayBuffer | Uint8Array): Promise<WaveReadResult> {
  let buffer: ArrayBuffer;
  if (bufferOrBlob instanceof Blob) buffer = await bufferOrBlob.arrayBuffer();
  else if (bufferOrBlob instanceof ArrayBuffer) buffer = bufferOrBlob;
  else if (bufferOrBlob instanceof Uint8Array) {
    // Copy the Uint8Array into a new ArrayBuffer to ensure we have a plain ArrayBuffer
    const tmp = new ArrayBuffer(bufferOrBlob.byteLength);
    new Uint8Array(tmp).set(bufferOrBlob);
    buffer = tmp;
  } else throw new TypeError('Expected Blob, ArrayBuffer or Uint8Array');

  const view = new DataView(buffer);
  const readStr = (off: number, len: number): string => {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(off + i));
    return s;
  };

  if (readStr(0, 4) !== 'RIFF' || readStr(8, 4) !== 'WAVE') throw new Error('Not a valid WAVE file');

  let offset = 12;
  let fmt: { audioFormat: number; channels: number; sampleRate: number; byteRate: number; blockAlign: number; bitsPerSample: number } | null = null;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const id = readStr(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;

    if (id === 'fmt ') {
      const audioFormat = view.getUint16(chunkStart, true);
      const channels = view.getUint16(chunkStart + 2, true);
      const sampleRate = view.getUint32(chunkStart + 4, true);
      const byteRate = view.getUint32(chunkStart + 8, true);
      const blockAlign = view.getUint16(chunkStart + 12, true);
      const bitsPerSample = view.getUint16(chunkStart + 14, true);
      fmt = { audioFormat, channels, sampleRate, byteRate, blockAlign, bitsPerSample };
    } else if (id === 'data') {
      dataOffset = chunkStart;
      dataSize = size;
    }

    offset = chunkStart + size;
    if (size % 2 === 1) offset++; // pad byte
  }

  if (!fmt) throw new Error('Missing "fmt " chunk');
  if (dataOffset < 0) throw new Error('Missing "data" chunk');

  const { audioFormat, channels, sampleRate, bitsPerSample } = fmt;
  const bytesPerSample = bitsPerSample / 8;
  const totalFrames = Math.floor(dataSize / (bytesPerSample * channels));
  const out = new Float32Array(totalFrames * channels);

  let p = dataOffset;
  if (audioFormat === 1) {
    // PCM integer
    if (bitsPerSample === 8) {
      for (let i = 0, o = 0; i < totalFrames * channels; i++, o++) {
        const v = view.getUint8(p++);
        out[o] = (v - 128) / 128;
      }
    } else if (bitsPerSample === 16) {
      for (let i = 0, o = 0; i < totalFrames * channels; i++, o++) {
        const v = view.getInt16(p, true);
        p += 2;
        out[o] = v < 0 ? v / 0x8000 : v / 0x7fff;
      }
    } else if (bitsPerSample === 24) {
      for (let i = 0, o = 0; i < totalFrames * channels; i++, o++) {
        const b0 = view.getUint8(p++);
        const b1 = view.getUint8(p++);
        const b2 = view.getUint8(p++);
        let val = (b2 << 16) | (b1 << 8) | b0;
        if (val & 0x800000) val |= ~0xffffff;
        out[o] = val / 8388608; // 2^23
      }
    } else if (bitsPerSample === 32) {
      for (let i = 0, o = 0; i < totalFrames * channels; i++, o++) {
        const v = view.getInt32(p, true);
        p += 4;
        out[o] = v < 0 ? v / 0x80000000 : v / 0x7fffffff;
      }
    } else {
      throw new Error('Unsupported PCM bitsPerSample: ' + bitsPerSample);
    }
  } else if (audioFormat === 3) {
    // IEEE float
    if (bitsPerSample !== 32 && bitsPerSample !== 64) throw new Error('Unsupported float bit depth: ' + bitsPerSample);
    if (bitsPerSample === 32) {
      for (let i = 0, o = 0; i < totalFrames * channels; i++, o++) {
        out[o] = view.getFloat32(p, true);
        p += 4;
      }
    } else {
      for (let i = 0, o = 0; i < totalFrames * channels; i++, o++) {
        out[o] = view.getFloat64(p, true);
        p += 8;
      }
    }
  } else {
    throw new Error('Unsupported audio format: ' + audioFormat);
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

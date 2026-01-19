export interface BextChunk {
  description?: string;
  originator?: string;
  originatorReference?: string;
  originationDate?: string;
  originationTime?: string;
  timeReference?: string; // 64-bit time reference as decimal string
  version?: number;
  umid?: Uint8Array | null;
  codingHistory?: string;
}

export interface WaveReadResult {
  samples: Float32Array; // interleaved
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  format: number;
  frames: number;
  bext?: BextChunk | null;
  ixml?: string | null;
}

export function download(
  samples: Float32Array | number[],
  sampleRate = 48000,
  name = 'output',
  bext?: BextChunk | null,
  ixml?: string | null
): void {
  const channels = 1;
  const bytesPerSample = 4;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;

  // build bext payload if requested
  let bextDataSize = 0;
  let bextPayload: Uint8Array | null = null;
  if (bext) {
    const description = bext.description || '';
    const originator = bext.originator || '';
    const originatorReference = bext.originatorReference || '';
    const originationDate = bext.originationDate || '';
    const originationTime = bext.originationTime || '';
    const codingHistory = bext.codingHistory || '';
    const version = typeof bext.version === 'number' ? bext.version : 1;
    const umidBytes = bext.umid && bext.umid.length ? bext.umid : null;

    // base BEXT fields per spec: 256 + 32 + 32 + 10 + 8 + 8 + 2 + 64 + 190 = 602 bytes
    const baseLen = 602;
    const codingLen = codingHistory ? codingHistory.length + 1 : 0; // include null terminator if present
    bextDataSize = baseLen + codingLen;

    // ensure even length (chunk payload is padded to even)
    if (bextDataSize % 2 === 1) bextDataSize++;

    bextPayload = new Uint8Array(bextDataSize);
    let p = 0;
    const writeFixed = (str: string, len: number) => {
      for (let i = 0; i < len; i++) {
        const code = i < str.length ? str.charCodeAt(i) & 0xff : 0;
        bextPayload![p++] = code;
      }
    };

    writeFixed(description, 256);
    writeFixed(originator, 32);
    writeFixed(originatorReference, 32);
    writeFixed(originationDate, 10);
    writeFixed(originationTime, 8);

    // time reference 64-bit little-endian: low then high (as in read())
    let timeRefLow = 0;
    let timeRefHigh = 0;
    try {
      const tr = bext.timeReference || '0';
      const BigIntFn = (globalThis as any).BigInt;
      if (typeof BigIntFn === 'function') {
        const t = BigIntFn(tr);
        const mask = BigIntFn(0xffffffff);
        timeRefLow = Number(t & mask);
        timeRefHigh = Number((t >> BigIntFn(32)) & mask);
      } else {
        const n = Number(tr || 0);
        timeRefLow = Math.floor(n % 4294967296);
        timeRefHigh = Math.floor(n / 4294967296);
      }
    } catch {
      timeRefLow = 0;
      timeRefHigh = 0;
    }
    // write low then high (little endian)
    bextPayload[p++] = timeRefLow & 0xff;
    bextPayload[p++] = (timeRefLow >>> 8) & 0xff;
    bextPayload[p++] = (timeRefLow >>> 16) & 0xff;
    bextPayload[p++] = (timeRefLow >>> 24) & 0xff;
    bextPayload[p++] = timeRefHigh & 0xff;
    bextPayload[p++] = (timeRefHigh >>> 8) & 0xff;
    bextPayload[p++] = (timeRefHigh >>> 16) & 0xff;
    bextPayload[p++] = (timeRefHigh >>> 24) & 0xff;

    // version (2 bytes LE)
    bextPayload[p++] = version & 0xff;
    bextPayload[p++] = (version >>> 8) & 0xff;

    // UMID (64 bytes) if version>0, otherwise zeros
    if (version > 0) {
      if (umidBytes) {
        for (let i = 0; i < 64; i++) bextPayload[p++] = i < umidBytes.length ? umidBytes[i] : 0;
      } else {
        for (let i = 0; i < 64; i++) bextPayload[p++] = 0;
      }
    } else {
      for (let i = 0; i < 64; i++) bextPayload[p++] = 0;
    }

    // reserved 190 bytes
    for (let i = 0; i < 190; i++) bextPayload[p++] = 0;

    // coding history (ASCII) + null terminator if provided
    if (codingHistory) {
      for (let i = 0; i < codingHistory.length; i++) bextPayload[p++] = codingHistory.charCodeAt(i) & 0xff;
      bextPayload[p++] = 0;
    }

    // pad if needed
    while (p < bextDataSize) bextPayload[p++] = 0;
  }

  // build iXML payload if requested
  let ixmlDataSize = 0;
  let ixmlPayload: Uint8Array | null = null;
  if (ixml) {
    const enc = (globalThis as any).TextEncoder ? new TextEncoder() : null;
    if (enc) ixmlPayload = enc.encode(ixml);
    else {
      const arr = new Uint8Array(ixml.length);
      for (let i = 0; i < ixml.length; i++) arr[i] = ixml.charCodeAt(i) & 0xff;
      ixmlPayload = arr;
    }
    ixmlDataSize = ixmlPayload.length;
    if (ixmlDataSize % 2 === 1) ixmlDataSize++;
  }

  // compute total buffer size with chunks and padding
  const fmtChunkSize = 8 + 16;
  const bextChunkSize = bextPayload ? 8 + bextDataSize : 0;
  const ixmlChunkSize = ixmlPayload ? 8 + ixmlDataSize : 0;
  const dataChunkSize = 8 + dataSize + (dataSize % 2 === 1 ? 1 : 0);
  const riffBodySize = 4 + fmtChunkSize + bextChunkSize + ixmlChunkSize + dataChunkSize; // 'WAVE' + chunks
  const totalSize = 8 + riffBodySize; // RIFF header (8) + body

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, riffBodySize, true);
  writeString(8, 'WAVE');

  // fmt chunk
  let ptr = 12;
  writeString(ptr, 'fmt ');
  view.setUint32(ptr + 4, 16, true);
  view.setUint16(ptr + 8, 1, true); // PCM
  view.setUint16(ptr + 10, channels, true);
  view.setUint32(ptr + 12, sampleRate, true);
  view.setUint32(ptr + 16, byteRate, true);
  view.setUint16(ptr + 20, blockAlign, true);
  view.setUint16(ptr + 22, 16, true); // bits per sample
  ptr += 8 + 16;

  // bext chunk (optional)
  if (bextPayload) {
    writeString(ptr, 'bext');
    view.setUint32(ptr + 4, bextDataSize, true);
    ptr += 8;
    // copy payload
    new Uint8Array(buffer, ptr, bextDataSize).set(bextPayload);
    ptr += bextDataSize;
    if (bextDataSize % 2 === 1) {
      view.setUint8(ptr, 0);
      ptr++;
    }
  }

  // iXML chunk (optional)
  if (ixmlPayload) {
    writeString(ptr, 'iXML');
    view.setUint32(ptr + 4, ixmlDataSize, true);
    ptr += 8;
    const dest = new Uint8Array(buffer, ptr, ixmlDataSize);
    dest.set(ixmlPayload);
    // zero pad remainder if odd sized
    if (ixmlDataSize > ixmlPayload.length) {
      for (let i = ixmlPayload.length; i < ixmlDataSize; i++) dest[i] = 0;
    }
    ptr += ixmlDataSize;
    if (ixmlDataSize % 2 === 1) {
      view.setUint8(ptr, 0);
      ptr++;
    }
  }

  // data chunk
  writeString(ptr, 'data');
  view.setUint32(ptr + 4, dataSize, true);
  ptr += 8;

  // PCM 16-bit samples
  let off = ptr;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, Number(samples[i])));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  if (dataSize % 2 === 1) {
    view.setUint8(off, 0);
    off++;
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
    const tmp = new ArrayBuffer(bufferOrBlob.byteLength);
    new Uint8Array(tmp).set(bufferOrBlob);
    buffer = tmp;
  } else throw new TypeError('Expected Blob, ArrayBuffer or Uint8Array');

  const view = new DataView(buffer);
  const readStr = (off: number, len: number): string => {
    let s = '';
    for (let i = 0; i < len && off + i < view.byteLength; i++) {
      const c = view.getUint8(off + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };

  if (readStr(0, 4) !== 'RIFF' || readStr(8, 4) !== 'WAVE') throw new Error('Not a valid WAVE file');

  let offset = 12;
  let fmt: { audioFormat: number; channels: number; sampleRate: number; byteRate: number; blockAlign: number; bitsPerSample: number } | null = null;
  let dataOffset = -1;
  let dataSize = 0;
  let bextChunk: BextChunk | null = null;
  let ixmlChunk: string | null = null;

  const readFixedString = (off: number, len: number) => {
    const bytes: number[] = [];
    for (let i = 0; i < len && off + i < view.byteLength; i++) {
      bytes.push(view.getUint8(off + i));
    }
    // trim trailing nulls
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) end--;
    return String.fromCharCode(...bytes.slice(0, end));
  };

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
    } else if (id === 'bext') {
      // parse BWF bext chunk per available fields
      let p = chunkStart;
      const remaining = (chunkStart + size) - p;
      const readLen = (n: number) => Math.max(0, Math.min(n, (chunkStart + size) - p));
      const safeRead = (n: number) => {
        const r = readLen(n);
        const s = readFixedString(p, r);
        p += n;
        return s;
      };

      const description = readFixedString(p, Math.min(256, chunkStart + size - p));
      p += 256;
      const originator = readFixedString(p, Math.min(32, chunkStart + size - p));
      p += 32;
      const originatorReference = readFixedString(p, Math.min(32, chunkStart + size - p));
      p += 32;
      const originationDate = readFixedString(p, Math.min(10, chunkStart + size - p));
      p += 10;
      const originationTime = readFixedString(p, Math.min(8, chunkStart + size - p));
      p += 8;

      let timeRefLow = 0;
      let timeRefHigh = 0;
      if (p + 8 <= chunkStart + size) {
        timeRefLow = view.getUint32(p, true);
        timeRefHigh = view.getUint32(p + 4, true);
      } else {
        // read what's available
        if (p + 4 <= chunkStart + size) timeRefLow = view.getUint32(p, true);
      }
      p += 8;

      let version = 0;
      if (p + 2 <= chunkStart + size) {
        version = view.getUint16(p, true);
      }
      p += 2;

      let umid: Uint8Array | null = null;
      if (version > 0 && p + 64 <= chunkStart + size) {
        umid = new Uint8Array(buffer.slice(p, p + 64));
        p += 64;
      } else if (version > 0) {
        // if not enough space, read what's there
        const avail = Math.max(0, (chunkStart + size) - p);
        if (avail > 0) {
          umid = new Uint8Array(buffer.slice(p, p + avail));
          p += avail;
        }
      }

      // After UMID there may be reserved fields (190 bytes per spec), skip what's present
      const reservedLen = 190;
      const skipReserved = Math.min(reservedLen, Math.max(0, (chunkStart + size) - p));
      p += skipReserved;

      // The rest (if any) is coding history (ASCII)
      let codingHistory = '';
      if (p < chunkStart + size) {
        // Read remaining bytes as string (may contain nulls)
        const bytes = new Uint8Array(buffer, p, chunkStart + size - p);
        let s = '';
        for (let i = 0; i < bytes.length; i++) {
          const c = bytes[i];
          if (c === 0) break;
          s += String.fromCharCode(c);
        }
        codingHistory = s;
      }

      // Combine timeRefHigh/Low into 64-bit decimal string
      let timeReferenceStr = '0';
      try {
        // Use BigInt at runtime if available without referencing the global BigInt symbol
        // directly (avoids TypeScript lib requirement); otherwise fall back to numeric math.
        const BigIntFn = (globalThis as any).BigInt;
        if (typeof BigIntFn === 'function') {
          const hi = BigIntFn(timeRefHigh);
          const lo = BigIntFn(timeRefLow);
          const combined = (hi << BigIntFn(32)) | lo;
          timeReferenceStr = combined.toString();
        } else {
          timeReferenceStr = (timeRefHigh * 4294967296 + timeRefLow).toString();
        }
      } catch {
        timeReferenceStr = (timeRefHigh * 4294967296 + timeRefLow).toString();
      }

      bextChunk = {
        description: description || undefined,
        originator: originator || undefined,
        originatorReference: originatorReference || undefined,
        originationDate: originationDate || undefined,
        originationTime: originationTime || undefined,
        timeReference: timeReferenceStr,
        version,
        umid,
        codingHistory: codingHistory || undefined
      };
    } else if (id === 'iXML' || id === 'iXML') {
      // iXML chunk: typically an XML string
      const bytes = new Uint8Array(buffer, chunkStart, size);
      let s = '';
      for (let i = 0; i < bytes.length; i++) {
        const c = bytes[i];
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      ixmlChunk = s;
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
        out[o] = val / 8388608;
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
    frames: totalFrames,
    bext: bextChunk,
    ixml: ixmlChunk
  };
}


export function convertToIXML(xmlContent: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<BWFXML>
    <IXML_VERSION>3.01</IXML_VERSION>
    <PROJECT>Converted Audio File</PROJECT>
    <NOTE>Converted to iXML format.</NOTE>
    <HISTORY></HISTORY>
    <USER>${xmlContent}</USER>
</BWFXML>`;
}

export function convertIXMLtoObject(xmlString: string): any {
    return xmlString
}
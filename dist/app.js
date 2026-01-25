"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __pow = Math.pow;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/math.ts
console.debug("Math module loaded");
function logspace(start, end, num) {
  const logStart = Math.log10(start);
  const logEnd = Math.log10(end);
  const logStep = (logEnd - logStart) / (num - 1);
  return Float32Array.from({ length: num }, (_, i) => Math.pow(10, logStart + i * logStep));
}
function linspace(start, end, num) {
  if (num === 1) return Float32Array.from([start]);
  const step = (end - start) / (num - 1);
  return Float32Array.from({ length: num }, (_, i) => start + i * step);
}
function closest(num, arr) {
  let curr = arr[0];
  let diff = Math.abs(num - curr);
  let index = 0;
  for (let val = 0; val < arr.length; val++) {
    const newDiff = Math.abs(num - arr[val]);
    if (newDiff < diff) {
      diff = newDiff;
      curr = arr[val];
      index = val;
    }
  }
  return index;
}
var average = (array) => array.reduce((a, b) => a + b) / array.length;
var abs = (re, im = 0) => Math.sqrt(re * re + im * im);
var mod = (n, m) => (n % m + m) % m;
var nextPow2 = (v) => {
  let p = 1;
  while (p < v) p <<= 1;
  return p;
};
function max(arr) {
  let maxVal = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > maxVal) maxVal = Math.abs(arr[i]);
  }
  return maxVal;
}

// src/fft.ts
console.debug("FFT module loaded");
var FFT = class {
  constructor(size) {
    this.size = size | 0;
    if (this.size <= 1 || (this.size & this.size - 1) !== 0)
      throw new Error("FFT size must be a power of two and bigger than 1");
    this._csize = size << 1;
    const table = new Array(this.size * 2);
    for (let i = 0; i < table.length; i += 2) {
      const angle = Math.PI * i / this.size;
      table[i] = Math.cos(angle);
      table[i + 1] = -Math.sin(angle);
    }
    this.table = table;
    let power = 0;
    for (let t = 1; this.size > t; t <<= 1)
      power++;
    this._width = power % 2 === 0 ? power - 1 : power;
    this._bitrev = new Array(1 << this._width);
    for (let j = 0; j < this._bitrev.length; j++) {
      this._bitrev[j] = 0;
      for (let shift = 0; shift < this._width; shift += 2) {
        const revShift = this._width - shift - 2;
        this._bitrev[j] |= (j >>> shift & 3) << revShift;
      }
    }
    this._out = null;
    this._data = null;
    this._inv = 0;
  }
  fromComplexArray(complex, storage2) {
    const res = storage2 || new Array(complex.length >>> 1);
    for (let i = 0; i < complex.length; i += 2)
      res[i >>> 1] = complex[i];
    return res;
  }
  createComplexArray() {
    const res = new Array(this._csize);
    for (let i = 0; i < res.length; i++)
      res[i] = 0;
    return res;
  }
  toComplexArray(input, storage2) {
    const res = storage2 || this.createComplexArray();
    for (let i = 0; i < res.length; i += 2) {
      res[i] = input[i >>> 1];
      res[i + 1] = 0;
    }
    return res;
  }
  completeSpectrum(spectrum) {
    const size = this._csize;
    const half = size >>> 1;
    for (let i = 2; i < half; i += 2) {
      spectrum[size - i] = spectrum[i];
      spectrum[size - i + 1] = -spectrum[i + 1];
    }
  }
  transform(out, data) {
    if (out === data)
      throw new Error("Input and output buffers must be different");
    this._out = out;
    this._data = data;
    this._inv = 0;
    this._transform4();
    this._out = null;
    this._data = null;
  }
  realTransform(out, data) {
    if (out === data)
      throw new Error("Input and output buffers must be different");
    this._out = out;
    this._data = data;
    this._inv = 0;
    this._realTransform4();
    this._out = null;
    this._data = null;
  }
  inverseTransform(out, data) {
    if (out === data)
      throw new Error("Input and output buffers must be different");
    this._out = out;
    this._data = data;
    this._inv = 1;
    this._transform4();
    for (let i = 0; i < out.length; i++)
      out[i] /= this.size;
    this._out = null;
    this._data = null;
  }
  // radix-4 implementation
  //
  // NOTE: Uses of `var` are intentional for older V8 version that do not
  // support both `let compound assignments` and `const phi`
  _transform4() {
    const out = this._out;
    const size = this._csize;
    const width = this._width;
    let step = 1 << width;
    let len = size / step << 1;
    let outOff;
    let t;
    const bitrev = this._bitrev;
    if (len === 4) {
      for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
        const off = bitrev[t];
        this._singleTransform2(outOff, off, step);
      }
    } else {
      for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
        const off = bitrev[t];
        this._singleTransform4(outOff, off, step);
      }
    }
    const inv = this._inv ? -1 : 1;
    const table = this.table;
    for (step >>= 2; step >= 2; step >>= 2) {
      len = size / step << 1;
      const quarterLen = len >>> 2;
      for (outOff = 0; outOff < size; outOff += len) {
        const limit = outOff + quarterLen;
        for (let i = outOff, k = 0; i < limit; i += 2, k += step) {
          const A = i;
          const B = A + quarterLen;
          const C = B + quarterLen;
          const D = C + quarterLen;
          const Ar = out[A];
          const Ai = out[A + 1];
          const Br = out[B];
          const Bi = out[B + 1];
          const Cr = out[C];
          const Ci = out[C + 1];
          const Dr = out[D];
          const Di = out[D + 1];
          const MAr = Ar;
          const MAi = Ai;
          const tableBr = table[k];
          const tableBi = inv * table[k + 1];
          const MBr = Br * tableBr - Bi * tableBi;
          const MBi = Br * tableBi + Bi * tableBr;
          const tableCr = table[2 * k];
          const tableCi = inv * table[2 * k + 1];
          const MCr = Cr * tableCr - Ci * tableCi;
          const MCi = Cr * tableCi + Ci * tableCr;
          const tableDr = table[3 * k];
          const tableDi = inv * table[3 * k + 1];
          const MDr = Dr * tableDr - Di * tableDi;
          const MDi = Dr * tableDi + Di * tableDr;
          const T0r = MAr + MCr;
          const T0i = MAi + MCi;
          const T1r = MAr - MCr;
          const T1i = MAi - MCi;
          const T2r = MBr + MDr;
          const T2i = MBi + MDi;
          const T3r = inv * (MBr - MDr);
          const T3i = inv * (MBi - MDi);
          const FAr = T0r + T2r;
          const FAi = T0i + T2i;
          const FCr = T0r - T2r;
          const FCi = T0i - T2i;
          const FBr = T1r + T3i;
          const FBi = T1i - T3r;
          const FDr = T1r - T3i;
          const FDi = T1i + T3r;
          out[A] = FAr;
          out[A + 1] = FAi;
          out[B] = FBr;
          out[B + 1] = FBi;
          out[C] = FCr;
          out[C + 1] = FCi;
          out[D] = FDr;
          out[D + 1] = FDi;
        }
      }
    }
  }
  // radix-2 implementation
  //
  // NOTE: Only called for len=4
  _singleTransform2(outOff, off, step) {
    const out = this._out;
    const data = this._data;
    const evenR = data[off];
    const evenI = data[off + 1];
    const oddR = data[off + step];
    const oddI = data[off + step + 1];
    const leftR = evenR + oddR;
    const leftI = evenI + oddI;
    const rightR = evenR - oddR;
    const rightI = evenI - oddI;
    out[outOff] = leftR;
    out[outOff + 1] = leftI;
    out[outOff + 2] = rightR;
    out[outOff + 3] = rightI;
  }
  // radix-4
  //
  // NOTE: Only called for len=8
  _singleTransform4(outOff, off, step) {
    const out = this._out;
    const data = this._data;
    const inv = this._inv ? -1 : 1;
    const step2 = step * 2;
    const step3 = step * 3;
    const Ar = data[off];
    const Ai = data[off + 1];
    const Br = data[off + step];
    const Bi = data[off + step + 1];
    const Cr = data[off + step2];
    const Ci = data[off + step2 + 1];
    const Dr = data[off + step3];
    const Di = data[off + step3 + 1];
    const T0r = Ar + Cr;
    const T0i = Ai + Ci;
    const T1r = Ar - Cr;
    const T1i = Ai - Ci;
    const T2r = Br + Dr;
    const T2i = Bi + Di;
    const T3r = inv * (Br - Dr);
    const T3i = inv * (Bi - Di);
    const FAr = T0r + T2r;
    const FAi = T0i + T2i;
    const FBr = T1r + T3i;
    const FBi = T1i - T3r;
    const FCr = T0r - T2r;
    const FCi = T0i - T2i;
    const FDr = T1r - T3i;
    const FDi = T1i + T3r;
    out[outOff] = FAr;
    out[outOff + 1] = FAi;
    out[outOff + 2] = FBr;
    out[outOff + 3] = FBi;
    out[outOff + 4] = FCr;
    out[outOff + 5] = FCi;
    out[outOff + 6] = FDr;
    out[outOff + 7] = FDi;
  }
  // Real input radix-4 implementation
  _realTransform4() {
    const out = this._out;
    const size = this._csize;
    const width = this._width;
    let step = 1 << width;
    let len = size / step << 1;
    let outOff;
    let t;
    const bitrev = this._bitrev;
    if (len === 4) {
      for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
        const off = bitrev[t];
        this._singleRealTransform2(outOff, off >>> 1, step >>> 1);
      }
    } else {
      for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
        const off = bitrev[t];
        this._singleRealTransform4(outOff, off >>> 1, step >>> 1);
      }
    }
    const inv = this._inv ? -1 : 1;
    const table = this.table;
    for (step >>= 2; step >= 2; step >>= 2) {
      len = size / step << 1;
      const halfLen = len >>> 1;
      const quarterLen = halfLen >>> 1;
      const hquarterLen = quarterLen >>> 1;
      for (outOff = 0; outOff < size; outOff += len) {
        for (let i = 0, k = 0; i <= hquarterLen; i += 2, k += step) {
          const A = outOff + i;
          const B = A + quarterLen;
          const C = B + quarterLen;
          const D = C + quarterLen;
          const Ar = out[A];
          const Ai = out[A + 1];
          const Br = out[B];
          const Bi = out[B + 1];
          const Cr = out[C];
          const Ci = out[C + 1];
          const Dr = out[D];
          const Di = out[D + 1];
          const MAr = Ar;
          const MAi = Ai;
          const tableBr = table[k];
          const tableBi = inv * table[k + 1];
          const MBr = Br * tableBr - Bi * tableBi;
          const MBi = Br * tableBi + Bi * tableBr;
          const tableCr = table[2 * k];
          const tableCi = inv * table[2 * k + 1];
          const MCr = Cr * tableCr - Ci * tableCi;
          const MCi = Cr * tableCi + Ci * tableCr;
          const tableDr = table[3 * k];
          const tableDi = inv * table[3 * k + 1];
          const MDr = Dr * tableDr - Di * tableDi;
          const MDi = Dr * tableDi + Di * tableDr;
          const T0r = MAr + MCr;
          const T0i = MAi + MCi;
          const T1r = MAr - MCr;
          const T1i = MAi - MCi;
          const T2r = MBr + MDr;
          const T2i = MBi + MDi;
          const T3r = inv * (MBr - MDr);
          const T3i = inv * (MBi - MDi);
          const FAr = T0r + T2r;
          const FAi = T0i + T2i;
          const FBr = T1r + T3i;
          const FBi = T1i - T3r;
          out[A] = FAr;
          out[A + 1] = FAi;
          out[B] = FBr;
          out[B + 1] = FBi;
          if (i === 0) {
            const FCr = T0r - T2r;
            const FCi = T0i - T2i;
            out[C] = FCr;
            out[C + 1] = FCi;
            continue;
          }
          if (i === hquarterLen)
            continue;
          const ST0r = T1r;
          const ST0i = -T1i;
          const ST1r = T0r;
          const ST1i = -T0i;
          const ST2r = -inv * T3i;
          const ST2i = -inv * T3r;
          const ST3r = -inv * T2i;
          const ST3i = -inv * T2r;
          const SFAr = ST0r + ST2r;
          const SFAi = ST0i + ST2i;
          const SFBr = ST1r + ST3i;
          const SFBi = ST1i - ST3r;
          const SA = outOff + quarterLen - i;
          const SB = outOff + halfLen - i;
          out[SA] = SFAr;
          out[SA + 1] = SFAi;
          out[SB] = SFBr;
          out[SB + 1] = SFBi;
        }
      }
    }
  }
  // radix-2 implementation
  //
  // NOTE: Only called for len=4
  _singleRealTransform2(outOff, off, step) {
    const out = this._out;
    const data = this._data;
    const evenR = data[off];
    const oddR = data[off + step];
    const leftR = evenR + oddR;
    const rightR = evenR - oddR;
    out[outOff] = leftR;
    out[outOff + 1] = 0;
    out[outOff + 2] = rightR;
    out[outOff + 3] = 0;
  }
  // radix-4
  //
  // NOTE: Only called for len=8
  _singleRealTransform4(outOff, off, step) {
    const out = this._out;
    const data = this._data;
    const inv = this._inv ? -1 : 1;
    const step2 = step * 2;
    const step3 = step * 3;
    const Ar = data[off];
    const Br = data[off + step];
    const Cr = data[off + step2];
    const Dr = data[off + step3];
    const T0r = Ar + Cr;
    const T1r = Ar - Cr;
    const T2r = Br + Dr;
    const T3r = inv * (Br - Dr);
    const FAr = T0r + T2r;
    const FBr = T1r;
    const FBi = -T3r;
    const FCr = T0r - T2r;
    const FDr = T1r;
    const FDi = T3r;
    out[outOff] = FAr;
    out[outOff + 1] = 0;
    out[outOff + 2] = FBr;
    out[outOff + 3] = FBi;
    out[outOff + 4] = FCr;
    out[outOff + 5] = 0;
    out[outOff + 6] = FDr;
    out[outOff + 7] = FDi;
  }
};

// src/fractional_octave_smoothing.ts
console.debug("Fractional Octave Smoothing module loaded");
function getFractionalOctaveFrequencies(fraction, f_low = 20, f_high = 24e3, fftSize) {
  if (fraction <= 0) {
    throw new Error("Fraction must be greater than 0");
  }
  if (f_low <= 0 || f_high <= 0) {
    throw new Error("Frequencies must be greater than 0");
  }
  if (f_low >= f_high) {
    throw new Error("f_low must be less than f_high");
  }
  const num_points = Math.round((Math.log10(f_high) - Math.log10(f_low)) / fraction) + 1;
  let frequencies = logspace(f_low, f_high, num_points);
  const frequency_resolution = 48e3 / fftSize;
  for (let i = 0; i < frequencies.length; i++) {
    frequencies[i] = Math.round(frequencies[i] / frequency_resolution) * frequency_resolution;
  }
  frequencies = Float32Array.from(new Set(frequencies));
  return frequencies;
}
function fractionalOctaveSmoothing(frequencyData, fraction, frequencies) {
  const FD = frequencyData;
  const F = frequencies;
  const n = FD.length | 0;
  const out = new Float32Array(F.length);
  if (n === 0 || F.length === 0) return out;
  const nMinus1 = n - 1;
  const half = n * 0.5;
  const fac = Math.pow(2, 0.5 * fraction) - Math.pow(2, -0.5 * fraction);
  const invBin = n > 1 ? nMinus1 / 24e3 : 0;
  const pref = new Float64Array(n + 1);
  for (let k = 0; k < n; ++k) pref[k + 1] = pref[k] + FD[k];
  for (let p = 0, P = F.length; p < P; ++p) {
    const fp = F[p];
    let i = invBin ? fp * invBin + 0.5 | 0 : 0;
    if (i < 0) i = 0;
    else if (i > nMinus1) i = nMinus1;
    const dist = Math.abs(half - i);
    let w = 0.5 * fac * (half - dist) + 0.5 | 0;
    if (w <= 0) {
      out[p] = FD[i];
      continue;
    }
    let s = i - w + 1;
    if (s < 0) s = 0;
    let e = i + w;
    if (e > nMinus1) e = nMinus1;
    const len = e - s + 1;
    if (len <= 0) {
      out[p] = FD[i];
    } else {
      const sum2 = pref[e + 1] - pref[s];
      out[p] = sum2 / len;
    }
  }
  return out;
}

// src/audio.ts
console.debug("Audio module loaded");
window.FFT = FFT;
function sum(buffer) {
  let sum2 = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum2 += buffer[i] * buffer[i];
  }
  return sum2;
}
function rms(buffer) {
  return Math.sqrt(sum(buffer) / buffer.length);
}
function db(value) {
  if (value instanceof Float32Array) {
    return value.map((v) => 20 * Math.log10(v + 1e-50));
  } else {
    return 20 * Math.log10(value + 1e-50);
  }
}
function dbToLinear(value) {
  if (value instanceof Float32Array) {
    return value.map((v) => Math.pow(10, v / 20));
  } else {
    return Math.pow(10, value / 20);
  }
}
function loadAudioFile(file) {
  return __async(this, null, function* () {
    const headerBuffer = yield file.slice(0, 256 * 1024).arrayBuffer();
    function getExt(name) {
      const ext2 = (name.split(".").pop() || "").toLowerCase();
      return ext2;
    }
    function getMimeType(ext2) {
      const mimeTypes = {
        "wav": "audio/wav",
        "mp3": "audio/mpeg",
        "flac": "audio/flac",
        "ogg": "audio/ogg",
        "m4a": "audio/mp4"
      };
      return mimeTypes[ext2] || "application/octet-stream";
    }
    function getNameWithoutExt(name) {
      const parts = name.split(".");
      if (parts.length > 1) {
        parts.pop();
        return parts.join(".");
      }
      return name;
    }
    function parseWav(buf) {
      const dv = new DataView(buf);
      function readStr(off, len) {
        let s = "";
        for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i));
        return s;
      }
      if (readStr(0, 4) !== "RIFF" || readStr(8, 4) !== "WAVE") return null;
      let offset = 12;
      const info = {};
      while (offset + 8 <= dv.byteLength) {
        const id = readStr(offset, 4);
        const size = dv.getUint32(offset + 4, true);
        if (id === "fmt ") {
          info.audioFormat = dv.getUint16(offset + 8, true);
          info.numChannels = dv.getUint16(offset + 10, true);
          info.sampleRate = dv.getUint32(offset + 12, true);
          info.byteRate = dv.getUint32(offset + 16, true);
          info.blockAlign = dv.getUint16(offset + 20, true);
          info.bitsPerSample = dv.getUint16(offset + 22, true);
        } else if (id === "data") {
          info.dataChunkSize = size;
        }
        offset += 8 + size + size % 2;
      }
      if (info.sampleRate && info.byteRate && info.dataChunkSize) {
        info.duration = info.dataChunkSize / info.byteRate;
      }
      try {
        const dvh = new DataView(headerBuffer);
        const readStr2 = (off, len) => {
          let s = "";
          for (let i = 0; i < len; i++) s += String.fromCharCode(dvh.getUint8(off + i));
          return s;
        };
        let offset2 = 12;
        while (offset2 + 8 <= dvh.byteLength) {
          const id = readStr2(offset2, 4);
          const size = dvh.getUint32(offset2 + 4, true);
          if (id === "iXML") {
            const start = offset2 + 8;
            const end = Math.min(start + size, dvh.byteLength);
            const xmlBytes = new Uint8Array(headerBuffer.slice(start, end));
            const xmlString = new TextDecoder().decode(xmlBytes);
            file.__iXMLraw = xmlString;
            try {
              const parser = new DOMParser();
              file.__iXML = parser.parseFromString(file.__iXMLraw, "application/xml");
              const userNode = file.__iXML.querySelector("USER");
              if (userNode) {
                const meta = {};
                Array.from(userNode.children).forEach((el) => {
                  const key = el.tagName.toLowerCase();
                  const txt = (el.textContent || "").trim();
                  const num = Number(txt);
                  meta[key] = txt === "" ? null : Number.isFinite(num) ? num : txt;
                });
                file.metadata = Object.assign(file.metadata || {}, meta);
              }
            } catch (e) {
              console.warn("iXML conversion attempt failed:", e);
            }
            break;
          }
          offset2 += 8 + size + size % 2;
        }
      } catch (e) {
        console.warn("Failed to scan header for iXML chunk:", e);
      }
      return info;
    }
    function parseMp3(buf) {
      var _a;
      const bytes = new Uint8Array(buf);
      let offset = 0;
      if (bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) {
        const size = (bytes[6] & 127) << 21 | (bytes[7] & 127) << 14 | (bytes[8] & 127) << 7 | bytes[9] & 127;
        offset = 10 + size;
      }
      let headerIndex = -1;
      for (let i = offset; i < bytes.length - 4; i++) {
        if (bytes[i] === 255 && (bytes[i + 1] & 224) === 224) {
          headerIndex = i;
          break;
        }
      }
      if (headerIndex < 0) return null;
      const b1 = bytes[headerIndex + 1];
      const b2 = bytes[headerIndex + 2];
      const b3 = bytes[headerIndex + 3];
      const versionBits = b1 >> 3 & 3;
      const layerBits = b1 >> 1 & 3;
      const bitrateBits = b2 >> 4 & 15;
      const sampleRateBits = b2 >> 2 & 3;
      const channelMode = b3 >> 6 & 3;
      const versions = {
        0: "MPEG Version 2.5",
        1: "reserved",
        2: "MPEG Version 2 (ISO/IEC 13818-3)",
        3: "MPEG Version 1 (ISO/IEC 11172-3)"
      };
      const layers = {
        0: "reserved",
        1: "Layer III",
        2: "Layer II",
        3: "Layer I"
      };
      const sampleRates = {
        3: [44100, 48e3, 32e3],
        2: [22050, 24e3, 16e3],
        0: [11025, 12e3, 8e3]
      };
      const versionKey = versionBits;
      const layerKey = layerBits;
      const bitrateTable = {
        // MPEG1 Layer III
        "3_1": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
        // MPEG2/2.5 Layer III
        "0_1": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
        "2_1": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
        // fallback generic table for other layers/versions (best-effort)
        "3_2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
        "3_3": [0, 32, 64, 96, 128, 160, 192, 224, 256, 320, 384, 448, 512, 576, 640, 0]
      };
      const versionStr = versions[versionKey] || "unknown";
      const layerStr = layers[layerKey] || "unknown";
      let sampleRate = ((_a = sampleRates[versionKey]) == null ? void 0 : _a[sampleRateBits]) || null;
      let bitrateKbps = 0;
      const tbKey = `${versionKey}_${layerKey}`;
      if (bitrateTable[tbKey]) {
        bitrateKbps = bitrateTable[tbKey][bitrateBits] || 0;
      } else if (bitrateTable["3_1"] && versionKey === 3 && layerKey === 1) {
        bitrateKbps = bitrateTable["3_1"][bitrateBits] || 0;
      }
      const channels = channelMode === 3 ? 1 : 2;
      let duration = null;
      if (bitrateKbps > 0) {
        duration = bytes.length * 8 / (bitrateKbps * 1e3);
      }
      return {
        version: versionStr,
        layer: layerStr,
        bitrateKbps: bitrateKbps || null,
        sampleRate,
        channels,
        duration
      };
    }
    const ext = getExt(file.name);
    const mime = file.type || "unknown";
    let metadata = __spreadValues({}, file.__iXML);
    metadata.filename = file.name;
    metadata.name = getNameWithoutExt(file.name);
    metadata.size = file.size;
    metadata.mime = mime;
    metadata.ext = ext;
    metadata.iXML = file.metadata || null;
    const wavInfo = parseWav(headerBuffer);
    if (wavInfo) {
      metadata.format = "wav";
      metadata = Object.assign(metadata, wavInfo || {});
    } else if (mime === "audio/mpeg" || ext === "mp3") {
      const mp3Info = parseMp3(headerBuffer);
      metadata.format = "mp3";
      metadata = Object.assign(metadata, mp3Info || {});
    } else {
      metadata.format = mime || ext || "unknown";
    }
    console.log("Extracted file metadata:", metadata);
    const arrayBuffer = yield file.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = yield audioContext.decodeAudioData(arrayBuffer);
    return Audio.fromAudioBuffer(audioBuffer, metadata);
  });
}
var Audio = class _Audio extends AudioBuffer {
  constructor() {
    super(...arguments);
    this.metadata = {};
  }
  static fromAudioBuffer(buffer, metadata) {
    const audio2 = new _Audio({
      length: buffer.length,
      numberOfChannels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate
    });
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      audio2.copyToChannel(buffer.getChannelData(ch), ch);
    }
    audio2.metadata = metadata;
    console.log("Created Audio from AudioBuffer with metadata:", audio2.metadata);
    return audio2;
  }
  static fromSamples(samples, sampleRate = 48e3, metadata) {
    if (!samples || samples.length == 0) return new _Audio({ length: 0, numberOfChannels: 1, sampleRate });
    const audio2 = new _Audio({
      length: samples.length,
      numberOfChannels: 1,
      sampleRate
    });
    audio2.copyToChannel(samples, 0);
    audio2.metadata = metadata;
    return audio2;
  }
  static fromObject(obj) {
    const sampleRate = obj.sampleRate || 48e3;
    const numberOfChannels = obj.numberOfChannels || 1;
    const length = obj.length || (obj.data ? obj.data.length / numberOfChannels : 1);
    const audio2 = new _Audio({
      length,
      numberOfChannels,
      sampleRate
    });
    if (obj.data) {
      for (let i = 0; i < obj.data.length; i++) {
        const channel = Math.floor(i / length);
        const index = i % length;
        audio2.copyToChannel(new Float32Array([obj.data[i]]), channel, index);
      }
    }
    console.log("METADATA", obj.metadata);
    audio2.metadata = obj.metadata;
    return audio2;
  }
  toObject() {
    console.log("this.metadata", this.metadata);
    return {
      sampleRate: this.sampleRate,
      numberOfChannels: this.numberOfChannels,
      length: this.length,
      metadata: this.metadata,
      data: Float32Array.from({ length: this.length * this.numberOfChannels }, (_, i) => {
        const channel = Math.floor(i / this.length);
        const index = i % this.length;
        return this.getChannelData(channel)[index];
      })
    };
  }
  applyGain(gain) {
    const numChannels = this.numberOfChannels;
    for (let ch = 0; ch < numChannels; ch++) {
      const data = this.getChannelData(ch).map((v) => v * gain);
      this.copyToChannel(data, ch, 0);
    }
    return this;
  }
  getChannel(channel) {
    if (channel < 0 || channel >= this.numberOfChannels) {
      throw new Error("Invalid channel number");
    }
    const channelData = this.getChannelData(channel);
    const newBuffer = new AudioBuffer({
      length: channelData.length,
      numberOfChannels: 1,
      sampleRate: this.sampleRate
    });
    newBuffer.copyToChannel(channelData, 0, 0);
    return new _Audio(newBuffer);
  }
  rms(channel = 0) {
    if (channel < 0 || channel >= this.numberOfChannels) {
      throw new Error("Invalid channel number");
    }
    const data = this.getChannelData(channel);
    return rms(data);
  }
  static fromFilename(filename) {
    return __async(this, null, function* () {
      const response = yield fetch(filename);
      const file = yield response.blob();
      return yield loadAudioFile(file);
    });
  }
};
function chirp(f_start, f_stop, duration = null, rate = null, fade = 0.01, fs = 48e3) {
  const c = Math.log(f_stop / f_start);
  let L;
  let samples_count;
  if (duration == null && rate == null) {
    rate = 1;
  }
  if (duration == null) {
    L = rate / Math.log(10);
    samples_count = Math.round(L * c * fs);
    duration = samples_count / fs;
  } else {
    L = duration / c;
    rate = Math.log(10) * L;
    samples_count = Math.round(L * c * fs);
  }
  samples_count = Math.max(1, samples_count);
  const fade_in = Math.max(0, Math.floor(fade * fs));
  const fade_out = Math.max(0, Math.floor(fade / 10 * fs));
  const pre = Math.max(0, fade_in);
  const post = Math.max(0, fade_out);
  const phi = Float32Array.from({ length: pre + samples_count + post }, () => 0);
  const offset = f_start * ((fade_in + 1) / fs);
  for (let i = 0; i < pre; i++) phi[i] = f_start * (i / fs);
  const baseIdx = pre;
  for (let i = 0; i < samples_count; i++) {
    let t2 = i / fs;
    phi[baseIdx + i] = L * f_start * (Math.exp(t2 / L) - 1) + offset;
  }
  const last = phi[baseIdx + samples_count - 1] || 0;
  for (let i = 0; i < post; i++) {
    phi[baseIdx + samples_count + i] = last + f_stop * ((i + 1) / fs);
  }
  const sweep = Float32Array.from({ length: phi.length }, () => 0);
  for (let i = 0; i < phi.length; i++) sweep[i] = Math.sin(2 * Math.PI * phi[i]);
  const t = Float32Array.from({ length: sweep.length }, () => 0);
  for (let i = 0; i < sweep.length; i++) t[i] = i / fs;
  const envMain = Float32Array.from({ length: t.length }, () => 0);
  const factor = f_stop * duration * duration;
  for (let i = 0; i < t.length; i++) envMain[i] = Math.exp(-t[i] / L) / L * factor;
  const startZeros = Math.floor(0.01 * fs);
  const endZeros = Math.floor(1e-3 * fs);
  const envelope = Float32Array.from({ length: startZeros + envMain.length + endZeros }, () => 0);
  for (let i = 0; i < envMain.length; i++) {
    envelope[startZeros + i] = envMain[i];
  }
  const window2 = Float32Array.from({ length: sweep.length }, () => 0);
  for (let i = 0; i < sweep.length; i++) {
    let w = 1;
    if (fade_in > 0 && i < fade_in) {
      w = i / Math.max(1, fade_in);
    }
    if (fade_out > 0 && i >= sweep.length - fade_out) {
      const k = i - (sweep.length - fade_out);
      w *= 1 - k / Math.max(1, fade_out);
    }
    window2[i] = w;
  }
  const sweepWindowed = Float32Array.from({ length: sweep.length }, () => 0);
  for (let i = 0; i < sweep.length; i++) sweepWindowed[i] = sweep[i] * window2[i];
  return [sweepWindowed, t, envelope];
}
function smoothFFT(fftData, fraction, resolution) {
  const { frequency, magnitude, phase, fftSize } = fftData;
  const smoothedMagnitude = Float32Array.from({ length: magnitude.length }, () => 0);
  const fractionalFrequencies = getFractionalOctaveFrequencies(resolution, 20, 24e3, fftSize);
  const smoothed = dbToLinear(fractionalOctaveSmoothing(db(magnitude), fraction, fractionalFrequencies));
  const smoothedPhase = fractionalOctaveSmoothing(phase, fraction, fractionalFrequencies);
  return {
    frequency: fractionalFrequencies,
    magnitude: smoothed,
    phase: smoothedPhase,
    fftSize
  };
}
function computeFFT(data, fftSize = null) {
  fftSize != null ? fftSize : fftSize = __pow(2, Math.ceil(Math.log2(data.length)));
  console.log(`Computing FFT with ${fftSize} bins for data length ${data.length}`);
  const fft = new FFT(fftSize);
  const out = fft.createComplexArray();
  const frame = Float32Array.from({ length: fftSize }, () => 0);
  for (let i = 0; i < fftSize; i++) {
    frame[i] = (data[i] || 0) * 1;
  }
  fft.realTransform(out, frame);
  const frequency = Float32Array.from({ length: fftSize / 2 }, () => 0);
  const magnitude = Float32Array.from({ length: fftSize / 2 }, () => 0);
  const phase = Float32Array.from({ length: fftSize / 2 }, () => 0);
  for (let i = 0; i < fftSize / 2; i++) {
    const re = out[2 * i];
    const im = out[2 * i + 1];
    magnitude[i] = abs(re, im) * Math.SQRT2;
    phase[i] = Math.atan2(im, re);
  }
  const frequencyResolution = 48e3 / fftSize;
  for (let i = 0; i < fftSize / 2; i++) {
    frequency[i] = i * frequencyResolution;
  }
  return {
    frequency,
    magnitude,
    phase,
    fftSize
  };
}
function fftCorrelation(x, y) {
  const lenX = x.length;
  const lenY = y.length;
  const fullLen = lenX + lenY - 1;
  const nextPow22 = (v) => {
    let p = 1;
    while (p < v) p <<= 1;
    return p;
  };
  const n = nextPow22(fullLen);
  const xP = Float32Array.from({ length: n }, () => 0);
  const yP = Float32Array.from({ length: n }, () => 0);
  xP.set(x, 0);
  yP.set(y, 0);
  const fft = new FFT(n);
  const A = fft.createComplexArray();
  const B = fft.createComplexArray();
  fft.realTransform(A, xP);
  fft.realTransform(B, yP);
  if (typeof fft.completeSpectrum === "function") {
    fft.completeSpectrum(A);
    fft.completeSpectrum(B);
  }
  const C = fft.createComplexArray();
  for (let k = 0; k < n; k++) {
    const ar = A[2 * k], ai = A[2 * k + 1];
    const br = B[2 * k], bi = B[2 * k + 1];
    C[2 * k] = ar * br + ai * bi;
    C[2 * k + 1] = ai * br - ar * bi;
  }
  const out = fft.createComplexArray();
  fft.inverseTransform(out, C);
  const corr = Float64Array.from({ length: fullLen }, () => 0);
  for (let i = 0; i < fullLen; i++) {
    corr[i] = out[2 * i] / n;
  }
  let sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < lenX; i++) sumX2 += x[i] * x[i];
  for (let i = 0; i < lenY; i++) sumY2 += y[i] * y[i];
  const denom = Math.sqrt(sumX2 * sumY2);
  const normalized = Float64Array.from({ length: fullLen }, () => 0);
  if (denom > 0) {
    for (let i = 0; i < fullLen; i++) normalized[i] = corr[i] / denom;
  } else {
    for (let i = 0; i < fullLen; i++) normalized[i] = 0;
  }
  const lags = new Int32Array(fullLen);
  for (let i = 0; i < fullLen; i++) lags[i] = i - (lenY - 1);
  let peakIdx = 0;
  let peakVal = -Infinity;
  for (let i = 0; i < fullLen; i++) {
    if (normalized[i] > peakVal) {
      peakVal = normalized[i];
      peakIdx = i;
    }
  }
  const estimatedLag = lags[peakIdx];
  return {
    corr: normalized,
    lags,
    estimatedLagSamples: estimatedLag,
    estimatedLagIndex: peakIdx,
    peakCorrelation: peakVal,
    raw: corr,
    nfft: n
  };
}
function fftConvolve(x, y, mode = "same") {
  const lenX = x.length;
  const lenY = y.length;
  const fullLen = lenX + lenY - 1;
  const n = nextPow2(fullLen);
  const xP = Float32Array.from({ length: n }, () => 0);
  const yP = Float32Array.from({ length: n }, () => 0);
  xP.set(x, 0);
  yP.set(y, 0);
  const fft = new FFT(n);
  const A = fft.createComplexArray();
  const B = fft.createComplexArray();
  fft.realTransform(A, xP);
  fft.realTransform(B, yP);
  if (typeof fft.completeSpectrum === "function") {
    fft.completeSpectrum(A);
    fft.completeSpectrum(B);
  }
  const C = fft.createComplexArray();
  for (let k = 0; k < n; k++) {
    const ar = A[2 * k], ai = A[2 * k + 1];
    const br = B[2 * k], bi = B[2 * k + 1];
    C[2 * k] = ar * br - ai * bi;
    C[2 * k + 1] = ai * br + ar * bi;
  }
  const out = fft.createComplexArray();
  fft.inverseTransform(out, C);
  const result = Float32Array.from({ length: fullLen }, () => 0);
  for (let i = 0; i < fullLen; i++) {
    result[i] = out[2 * i];
  }
  if (mode === "same") {
    const start = Math.floor((fullLen - lenX) / 2);
    return result.slice(start, start + lenX);
  }
  return result;
}
function twoChannelImpulseResponse(y, x) {
  const fullLen = y.length + x.length - 1;
  const N = nextPow2(fullLen);
  const xP = Float32Array.from({ length: N }, () => 0);
  const yP = Float32Array.from({ length: N }, () => 0);
  xP.set(y, 0);
  yP.set(x, 0);
  const fft = new FFT(N);
  const A = fft.createComplexArray();
  const B = fft.createComplexArray();
  fft.realTransform(A, xP);
  fft.realTransform(B, yP);
  const C = fft.createComplexArray();
  const epsilon = 1e-20;
  for (let k = 0; k < N; k++) {
    const ar = A[2 * k], ai = A[2 * k + 1];
    const br = B[2 * k], bi = B[2 * k + 1];
    const denom = br * br + bi * bi + epsilon;
    C[2 * k] = (ar * br + ai * bi) / denom;
    C[2 * k + 1] = (ai * br - ar * bi) / denom;
  }
  const out = Float32Array.from(fft.createComplexArray());
  fft.inverseTransform(out, C);
  const ir = Float32Array.from({ length: N }, () => 0);
  for (let i = 0; i < N; i++) {
    ir[i] = out[2 * ((i + N / 2) % N)];
  }
  const peakAt = closest(1e8, ir) + -N / 2;
  const ir_complex = out.slice();
  for (let i = 0; i < N; i++) {
    ir_complex[2 * i] = out[2 * mod(i + peakAt, N)];
    ir_complex[2 * i + 1] = out[2 * mod(i + peakAt, N) + 1];
  }
  const mean = average(ir);
  for (let i = 0; i < N; i++) {
    ir[i] = ir[i] - mean;
  }
  return {
    ir,
    ir_complex,
    t: linspace((-N - 1) / 2 / 48e3, (N - 1) / 2 / 48e3, N),
    // assuming 48kHz
    peakAt,
    sampleRate: 48e3,
    fftSize: N
  };
}
function updatedFFT(dataArray, fftSize) {
  dataArray = dataArray;
  fftSize = nextPow2(fftSize);
  const dataPadded = new Float32Array(fftSize);
  const dataLen = Math.min(dataArray.length, fftSize);
  if (dataLen > 0) dataPadded.set(dataArray.subarray(0, dataLen), 0);
  const fft = new FFT(fftSize);
  const B = fft.createComplexArray();
  fft.realTransform(B, dataPadded);
  if (typeof fft.completeSpectrum === "function") {
    fft.completeSpectrum(B);
  }
  const half = fftSize >> 1;
  const sigMag = new Float32Array(half);
  const sigPhase = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    const br = B[2 * i], bi = B[2 * i + 1];
    sigMag[i] = abs(br, bi);
    sigPhase[i] = Math.atan2(bi, br);
  }
  const frequency = linspace(0, 48e3 / 2, half);
  return {
    frequency,
    magnitude: sigMag,
    phase: sigPhase,
    fftSize
  };
}
function twoChannelFFT(dataArray, reference, fftSize, offset, precomputedReference) {
  const refArr = reference;
  const dataArr = dataArray;
  const dataPadded = new Float32Array(fftSize);
  const referencePadded = new Float32Array(fftSize);
  if (offset >= 0) {
    const refLen = Math.min(refArr.length, Math.max(0, fftSize - offset));
    if (refLen > 0) referencePadded.set(refArr.subarray(0, refLen), offset);
    const dataLen = Math.min(dataArr.length, fftSize);
    if (dataLen > 0) dataPadded.set(dataArr.subarray(0, dataLen), 0);
  } else {
    const refLen = Math.min(refArr.length, fftSize);
    if (refLen > 0) referencePadded.set(refArr.subarray(0, refLen), 0);
    const start = -offset;
    const dataLen = Math.min(dataArr.length, Math.max(0, fftSize - start));
    if (dataLen > 0) dataPadded.set(dataArr.subarray(0, dataLen), start);
  }
  const sigFFT = updatedFFT(dataPadded, fftSize);
  const refFFT = precomputedReference || updatedFFT(referencePadded, fftSize);
  const half = fftSize >> 1;
  const sigMag = sigFFT.magnitude;
  const sigPhase = sigFFT.phase;
  const refMag = refFFT.magnitude;
  const refPhase = refFFT.phase;
  const h = new Float32Array(half);
  const phase = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    h[i] = sigMag[i] / (refMag[i] || 1e-20);
    phase[i] = sigPhase[i] - refPhase[i];
  }
  const frequency = linspace(0, 48e3 / 2, half);
  return {
    frequency,
    magnitude: h,
    phase,
    fftSize
  };
}
function computeFFTFromIR(ir, f_phase_wrap = 1e3, frequency_multiplier = 1) {
  const fftSize = nextPow2(ir.ir.length);
  const fft = new FFT(fftSize);
  const out = fft.createComplexArray();
  if (ir.ir_complex && ir.ir_complex.length >= 2 && ir.ir_complex[1] === 0) {
    const frame = new Float32Array(fftSize);
    frame.set(ir.ir.subarray(0, Math.min(ir.ir.length, fftSize)));
    fft.realTransform(out, frame);
  } else {
    if (ir.ir_complex && ir.ir_complex.length === out.length) {
      fft.transform(out, ir.ir_complex);
    } else {
      const tmp = fft.createComplexArray();
      if (ir.ir_complex) {
        if (typeof tmp.set === "function" && ir.ir_complex.subarray) {
          tmp.set(ir.ir_complex.subarray(0, Math.min(ir.ir_complex.length, tmp.length)));
        } else {
          const len = Math.min(ir.ir_complex.length, tmp.length);
          for (let i = 0; i < len; i++) {
            tmp[i] = ir.ir_complex[i];
          }
        }
      }
      fft.transform(out, tmp);
    }
  }
  const half = fftSize >> 1;
  const magnitude = new Float32Array(half);
  const unwrapped = new Float32Array(half);
  if (half > 0) {
    let prevWrapped = Math.atan2(out[1], out[0]);
    unwrapped[0] = prevWrapped;
    magnitude[0] = abs(out[0], out[1]);
    let offset = 0;
    for (let i = 1; i < half; i++) {
      const re = out[2 * i];
      const im = out[2 * i + 1];
      const wrapped = Math.atan2(im, re);
      let delta = wrapped - prevWrapped;
      if (delta > Math.PI) offset -= 2 * Math.PI;
      else if (delta < -Math.PI) offset += 2 * Math.PI;
      const u = wrapped + offset;
      unwrapped[i] = u;
      magnitude[i] = abs(re, im);
      prevWrapped = wrapped;
    }
  }
  const frequency = linspace(0, 48e3 / 2 * frequency_multiplier, half);
  const idxNorm = closest(f_phase_wrap, frequency);
  const normIndex = Math.max(0, Math.min(idxNorm, half - 1));
  const correction = Math.round(unwrapped[normIndex] / (2 * Math.PI)) * (2 * Math.PI);
  const phase = new Float32Array(half);
  const rad2deg = 180 / Math.PI;
  for (let i = 0; i < half; i++) {
    phase[i] = (unwrapped[i] - correction) * rad2deg;
  }
  return {
    frequency,
    magnitude,
    phase,
    peakAt: ir.peakAt,
    sampleRate: ir.sampleRate,
    fftSize
  };
}
function groupDelays(fftData, normalizeAt = 1e3) {
  const { frequency, phase, peakAt } = fftData;
  const N = frequency.length;
  const groupDelay = Float32Array.from({ length: N }, () => 0);
  for (let i = 1; i < N - 1; i++) {
    const dPhase = phase[i] - phase[i - 1];
    const dFreq = frequency[i] - frequency[i - 1];
    groupDelay[i] = -dPhase / dFreq / 360;
  }
  groupDelay[0] = groupDelay[1];
  groupDelay[N - 1] = groupDelay[N - 2];
  const normIdx = closest(normalizeAt, frequency);
  const delayAtNorm = groupDelay[normIdx];
  for (let i = 0; i < N; i++) {
    groupDelay[i] = groupDelay[i] - delayAtNorm;
  }
  return groupDelay;
}
var A_WEIGHTING_COEFFICIENTS = [
  Float32Array.from([0.234301792299513, -0.468603584599026, -0.234301792299513, 0.937207169198054, -0.234301792299515, -0.468603584599025, 0.234301792299513]),
  Float32Array.from([1, -4.113043408775871, 6.553121752655047, -4.990849294163381, 1.785737302937573, -0.246190595319487, 0.011224250033231])
];
var K_WEIGHTING_COEFFICIENTS_PRE = [
  Float32Array.from([1.53512485958697, -2.69169618940638, 1.19839281085285]),
  Float32Array.from([1, -1.69065929318241, 0.73248077421585])
];
var K_WEIGHTING_COEFFICIENTS_RLB = [
  Float32Array.from([1, -2, 1]),
  Float32Array.from([1, -1.99004745483398, 0.99007225036621])
];
function applyAWeightingToBuffer(buffer, zi) {
  const b = A_WEIGHTING_COEFFICIENTS[0];
  const a = A_WEIGHTING_COEFFICIENTS[1];
  const output = Float32Array.from({ length: buffer.length }, () => 0);
  for (let n = 0; n < buffer.length; n++) {
    output[n] = b[0] * buffer[n] + zi[0];
    for (let i = 1; i < b.length; i++) {
      zi[i - 1] = b[i] * buffer[n] + zi[i] - a[i] * output[n];
    }
  }
  return output;
}
function gateBuffer(buffer, sampleRate, thresholdDb = -70, blockMs = 400, overlap = 0.75) {
  const blockSize = Math.floor(blockMs / 1e3 * sampleRate);
  const hopSize = Math.floor(blockSize * (1 - overlap));
  const threshold = dbToLinear(thresholdDb);
  const gated = Float32Array.from({ length: buffer.length }, () => 0);
  let i = 0;
  while (i < buffer.length) {
    const start = i;
    const end = Math.min(i + blockSize, buffer.length);
    const block = buffer.slice(start, end);
    const blockRms = rms(block);
    if (blockRms >= threshold) {
      for (let j = 0; j < block.length; j++) {
        gated[start + j] = block[j];
      }
    }
    i += hopSize;
  }
  return gated;
}
var audio = {
  loadAudioFile,
  chirp,
  computeFFT,
  smoothFFT,
  fftCorrelation,
  fftConvolve,
  twoChannelImpulseResponse,
  computeFFTFromIR,
  twoChannelFFT,
  groupDelays,
  applyAWeightingToBuffer,
  gateBuffer
};

// src/windows.ts
function hanningWindow(length) {
  const window2 = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    window2[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)));
  }
  return window2;
}
function hammingWindow(length) {
  const window2 = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    window2[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (length - 1));
  }
  return window2;
}
function blackmanWindow(length) {
  const window2 = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    window2[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (length - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (length - 1));
  }
  return window2;
}
function rectangularWindow(length) {
  const window2 = new Float32Array(length);
  window2.fill(1);
  return window2;
}
function getSelectedWindow(windowType, length, correct = true) {
  const type = windowType;
  let window2 = new Float32Array(length);
  let wcf = 1;
  if (type === "hanning") {
    window2 = hanningWindow(length);
    wcf = 2;
  }
  if (type === "hamming") {
    window2 = hammingWindow(length);
    wcf = 1.852;
  }
  if (type === "blackman") {
    window2 = blackmanWindow(length);
    wcf = 2.381;
  }
  if (type === "rectangular") {
    window2 = rectangularWindow(length);
    wcf = 1;
  }
  if (correct) {
    window2 = window2.map((v) => v / wcf);
  }
  return window2;
}

// src/plotting.ts
var COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"];
function addPlotToList(tabId, plotId, plotName, hidden = false) {
  const plotList = document.getElementById(`plot-list-${tabId}`);
  const listItem = document.createElement("li");
  listItem.innerHTML = `<input type="checkbox" id="checkbox-${plotId}" alt="show/hide" ${hidden ? "" : "checked"}><label for="checkbox-${plotId}">${plotName}</label>`;
  plotList.appendChild(listItem);
}
function addPlotElement(tabId, plotId, hidden = false) {
  var _a;
  const tabContent = document.querySelector(`[data-content="${tabId}"]`);
  const plotBox = document.createElement("div");
  plotBox.className = "plot-box";
  plotBox.innerHTML = `
        <div id="${plotId}" class="plot-medium"></div>
        <div class="button-bar">
            <button>Customize...</button>
            <button>Export as...</button>   
            <label for="checkbox-${plotId}">Hide</label>
        </div>
    `;
  (_a = tabContent.querySelector(".plot-outer")) == null ? void 0 : _a.appendChild(plotBox);
  if (hidden) {
    plotBox.style.display = "none";
  }
  return plotBox.querySelector(`#${plotId}`);
}
function plot(traces, tabId, title, xTitle, yTitle, xAxisExtras = {}, yAxisExtras = {}, layoutExtras = {}, hidden = false) {
  var _a;
  const plotSettings = {
    plotGlPixelRatio: 2,
    // For better clarity on high-DPI screens
    legend: { "orientation": "h", "y": -0.2, "yanchor": "top" },
    plot_bgcolor: "#fafbfc",
    paper_bgcolor: "#fff",
    staticPlot: false,
    // Enable interactivity
    dragmode: "pan",
    showAxisDragHandles: true,
    showAxisRangeEntryBoxes: true,
    axisDragOnHover: true,
    tightenLats: true,
    font: {
      family: "'Newsreader', Georgia, 'Times New Roman', Times, serif"
    },
    margin: { t: 80, r: 65, b: 70, l: 65 }
  };
  const layout = __spreadValues(__spreadValues({
    title,
    xaxis: __spreadValues({
      title: xTitle,
      gridcolor: "#e1e4e8"
    }, xAxisExtras),
    yaxis: __spreadValues({
      title: yTitle,
      gridcolor: "#e1e4e8",
      automargin: true
    }, yAxisExtras)
  }, layoutExtras), plotSettings);
  const plotId = `plot-${tabId}-${title.toLowerCase().replace(/\s+/g, "-")}`;
  const element = addPlotElement(tabId, plotId, hidden);
  window.Plotly.newPlot(element, traces, layout, { responsive: true });
  addPlotToList(tabId, plotId, title, hidden);
  (_a = document.getElementById(`checkbox-${plotId}`)) == null ? void 0 : _a.addEventListener("change", (e) => {
    const box = document.getElementById(`${plotId}`).parentElement;
    box.setAttribute("style", e.target.checked ? "display: block;" : "display: none;");
    window.dispatchEvent(new Event("resize"));
  });
  console.log(`Plotted ${title} in tab ${tabId}`);
}

// src/farina.ts
var Farina = class {
  /* Farina deconvolution implementation according to the Python implementation. */
  constructor(stimulus, f_start = 50, f_stop = 22800, fs = 48e3) {
    this.deconvolved = Float32Array.from([]);
    this.f_start = f_start;
    this.f_stop = f_stop;
    this.fs = fs;
    this.stimulus = stimulus;
    this.duration = (this.stimulus.length - 528) / this.fs;
  }
  lag_of_harmonic(n) {
    return this.ell() * Math.log(n);
  }
  margin_of_harmonic(n) {
    return this.ell() * Math.log(n + 1) - this.ell() * Math.log(n);
  }
  max_safe_harmonic(window_size) {
    const t = [];
    for (let n = 1; n < 1e3; n++) {
      if (this.margin_of_harmonic(n) > window_size) {
        t.push(this.margin_of_harmonic(n));
      }
    }
    return t.length < 999 ? t.length : 0;
  }
  ell() {
    return this.duration / Math.log(this.f_stop / this.f_start);
  }
  rate(length) {
    return 1 / this.f_start * Math.PI * Math.round(length * this.f_start / Math.log2(this.f_stop / this.f_start));
  }
  instant() {
    return closest(1e8, this.deconvolved);
  }
  window(signal, at, length) {
    const size = Math.floor(length * this.fs);
    const window2 = getSelectedWindow("hanning", size, false);
    const si = signal.ir.slice(at - size / 2, at + size / 2);
    const w = Float32Array.from({ length: size }, () => 0);
    if (si.length === window2.length) {
      for (let i = 0; i < window2.length; i++) {
        w[i] = window2[i] * si[i];
      }
    }
    const ir_complex = Float32Array.from({ length: w.length * 2 }, () => 0);
    for (let i = 0; i < w.length; i++) {
      ir_complex[2 * i] = w[i];
      ir_complex[2 * i + 1] = 0;
    }
    return {
      ir: w,
      ir_complex,
      t: linspace((-size - 1) / 2 / this.fs, (size - 1) / 2 / this.fs, size),
      peakAt: at,
      sampleRate: this.fs,
      fftSize: w.length
    };
  }
  deconvolution(signal) {
    const n = linspace(0, this.stimulus.length - 1, this.stimulus.length);
    const ell = this.ell();
    const k = n.map((v) => Math.exp(v / ell / this.fs));
    const inv_stimulus = this.stimulus.slice().reverse().map((v, i) => v / k[i]);
    const deconvolved = fftConvolve(signal, inv_stimulus, "same").slice();
    const norm = max(fftConvolve(this.stimulus, inv_stimulus, "same").map((v) => Math.abs(v)));
    this.deconvolved = deconvolved.map((v) => v / norm);
    return this.deconvolved;
  }
  deconvolvedResponse(signal) {
    const ir = this.deconvolution(signal);
    const peakAt = this.instant();
    const ir_complex = Float32Array.from({ length: ir.length * 2 }, () => 0);
    for (let i = 0; i < ir.length; i++) {
      ir_complex[2 * i] = ir[i];
      ir_complex[2 * i + 1] = 0;
    }
    return {
      ir,
      ir_complex,
      t: linspace(-peakAt / this.fs, (-peakAt + ir.length - 1) / this.fs, ir.length),
      peakAt,
      sampleRate: this.fs,
      fftSize: ir.length
    };
  }
  harmonics(windowSize, harmonicsCount) {
    const results = [];
    for (let n = 0; n <= harmonicsCount; n++) {
      const at = Math.round(this.instant() - this.lag_of_harmonic(n + 1) * this.fs);
      const w = this.window({
        ir: this.deconvolved,
        ir_complex: Float32Array.from([]),
        t: Float32Array.from([]),
        peakAt: at,
        sampleRate: this.fs,
        fftSize: this.deconvolved.length
      }, at, windowSize);
      results.push(w);
    }
    return results;
  }
};
function plotDistortion(farina, windowSize, maxHarmonics, tabId) {
  const harmonics = farina.harmonics(windowSize, maxHarmonics);
  const harmonicsFFT = harmonics.map((h, n) => computeFFTFromIR(h, 1e3, 1 / (n + 1)));
  const smoothedHarmonicsFFT = harmonicsFFT.map((hf) => smoothFFT(hf, 1 / 6, 1 / 96));
  const traces = [];
  for (let n = 0; n < smoothedHarmonicsFFT.length; n++) {
    const color = COLORS[n % COLORS.length];
    const response = harmonicsFFT[n];
    const smoothedResponse = smoothedHarmonicsFFT[n];
    if (n === 0) {
      traces.push({
        x: response.frequency.map((f) => f / (n + 1)),
        y: db(response.magnitude),
        type: "scatter",
        mode: "lines",
        name: n === 0 ? "Fundamental" : `Harmonic ${n + 1}`,
        line: {
          width: 0.75,
          color: color + "33"
          // Lighter color for raw
        },
        showlegend: n === 0
      });
    }
    traces.push({
      x: smoothedResponse.frequency.map((f) => f / (n + 1)),
      y: db(smoothedResponse.magnitude),
      type: "scatter",
      mode: "lines",
      name: (n === 0 ? "Fundamental" : `Harmonic ${n + 1}`) + " (Smoothed)",
      line: {
        width: 1.5,
        color
      }
    });
  }
  plot(
    traces,
    tabId,
    "Fundamental and Harmonic Distortion",
    "Frequency (Hz)",
    "Amplitude (dBFS)",
    { type: "log", range: [Math.log10(20), Math.log10(2e4)] },
    { range: [-85, 5] },
    {},
    false
  );
}
function plotTHD(farina, windowSize, maxHarmonics, tabId) {
  const harmonics = farina.harmonics(windowSize, maxHarmonics);
  const harmonicsFFT = harmonics.map((h, n) => computeFFTFromIR(h, 1e3, 1 / (n + 1)));
  const smoothedHarmonicsFFT = harmonicsFFT.map((hf) => smoothFFT(hf, 1 / 6, 1 / 96));
  const fundamental = smoothedHarmonicsFFT[0];
  const traces = [];
  const thd = Float32Array.from({ length: fundamental.magnitude.length }, () => 0);
  for (let i = 0; i < fundamental.magnitude.length; i++) {
    let sumSquares = 0;
    for (let n = 1; n < smoothedHarmonicsFFT.length; n++) {
      sumSquares += Math.pow(smoothedHarmonicsFFT[n].magnitude[i], 2);
    }
    thd[i] = Math.sqrt(sumSquares) / fundamental.magnitude[i];
  }
  traces.push({
    x: fundamental.frequency,
    y: thd.map((v) => v * 100),
    // Convert to percentage
    type: "scatter",
    mode: "lines",
    name: "Total Harmonic Distortion (THD)",
    line: {
      width: 1.5,
      color: COLORS[0]
    }
  });
  plot(
    traces,
    tabId,
    "Total Harmonic Distortion",
    "Frequency (Hz)",
    "THD (%)",
    { type: "log", range: [Math.log10(20), Math.log10(2e4)] },
    { range: [0, 5] },
    {},
    false
  );
}

// src/storage.ts
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("dunkadunka-storage", 1);
    req.onupgradeneeded = () => {
      const db2 = req.result;
      if (!db2.objectStoreNames.contains("kv")) {
        db2.createObjectStore("kv", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function setItem(key, value) {
  return __async(this, null, function* () {
    try {
      const db2 = yield openIDB();
      const tx = db2.transaction("kv", "readwrite");
      const store = tx.objectStore("kv");
      store.put({ key, value });
      yield new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      try {
        setItem(key, value);
      } catch (e) {
      }
    } catch (e) {
      console.error("setItem(idb) failed", e);
    }
  });
}
function getItem(key) {
  return __async(this, null, function* () {
    var _a;
    try {
      const db2 = yield openIDB();
      const tx = db2.transaction("kv", "readonly");
      const store = tx.objectStore("kv");
      const req = store.get(key);
      const res = yield new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return (_a = res == null ? void 0 : res.value) != null ? _a : null;
    } catch (e) {
      console.error("getItem(idb) failed", e);
      return null;
    }
  });
}
function removeItem(key) {
  return __async(this, null, function* () {
    try {
      const db2 = yield openIDB();
      const tx = db2.transaction("kv", "readwrite");
      const store = tx.objectStore("kv");
      store.delete(key);
      yield new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (e) {
      console.error("removeItem(idb) failed", e);
    }
  });
}
function clearStorage() {
  return __async(this, null, function* () {
    try {
      const db2 = yield openIDB();
      const tx = db2.transaction("kv", "readwrite");
      const store = tx.objectStore("kv");
      store.clear();
      yield new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      try {
        sessionStorage.clear();
      } catch (e) {
      }
    } catch (e) {
      console.error("clearStorage(idb) failed", e);
    }
  });
}
function dumpStorage() {
  return __async(this, null, function* () {
    try {
      const db2 = yield openIDB();
      const tx = db2.transaction("kv", "readonly");
      const store = tx.objectStore("kv");
      const req = store.openCursor();
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          console.log(`Key: ${cursor.key}, Value: ${cursor.value.value}`);
          cursor.continue();
        }
      };
      req.onerror = () => {
        console.error("dumpStorage(idb) failed", req.error);
      };
    } catch (e) {
      console.error("dumpStorage(idb) failed", e);
    }
  });
}
var storage = {
  setItem,
  getItem,
  removeItem,
  clearStorage,
  dumpStorage
};

// src/device-settings.ts
var INPUT_KEY = "preferredAudioInputId";
var OUTPUT_KEY = "preferredAudioOutputId";
function openDeviceSettings() {
  const modal = document.getElementById("deviceSettingsModal");
  if (modal) {
    modal.style.display = "flex";
    initDeviceSettings();
  }
}
function closeDeviceSettings() {
  const modal = document.getElementById("deviceSettingsModal");
  if (modal) {
    modal.style.display = "none";
  }
}
function ensureDeviceAccess() {
  return __async(this, null, function* () {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
      yield navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (_) {
    }
  });
}
function refreshAudioDeviceList() {
  return __async(this, null, function* () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.warn("MediaDevices API not available");
      return;
    }
    yield ensureDeviceAccess();
    const devices = yield navigator.mediaDevices.enumerateDevices();
    const inputSel = document.getElementById("inputDeviceSelect");
    const outputSel = document.getElementById("outputDeviceSelect");
    if (!inputSel || !outputSel) return;
    inputSel.innerHTML = '<option value="">Default input</option>';
    outputSel.innerHTML = '<option value="">Default output</option>';
    const inputId = localStorage.getItem(INPUT_KEY) || "";
    const outputId = localStorage.getItem(OUTPUT_KEY) || "";
    devices.forEach((d) => {
      if (d.kind === "audioinput") {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Microphone (${d.deviceId.slice(0, 8)}\u2026)`;
        if (d.deviceId === inputId) opt.selected = true;
        inputSel.appendChild(opt);
      } else if (d.kind === "audiooutput") {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Speaker (${d.deviceId.slice(0, 8)}\u2026)`;
        if (d.deviceId === outputId) opt.selected = true;
        outputSel.appendChild(opt);
      }
    });
    const note = document.getElementById("sinkSupportNote");
    if (note) {
      const sinkSupported = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
      note.textContent = sinkSupported ? "Output routing supported on this browser." : "Output routing (setSinkId) not supported by this browser.";
    }
  });
}
function applyOutputDevice(deviceId) {
  return __async(this, null, function* () {
    const router = document.getElementById("appOutputRouter");
    if (!router) return;
    if ("setSinkId" in HTMLMediaElement.prototype) {
      try {
        yield router.setSinkId(deviceId || "");
      } catch (e) {
        console.warn("Failed to set sinkId:", e);
      }
    }
  });
}
function saveDeviceSelections() {
  const inputSel = document.getElementById("inputDeviceSelect");
  const outputSel = document.getElementById("outputDeviceSelect");
  if (!inputSel || !outputSel) return;
  localStorage.setItem(INPUT_KEY, inputSel.value || "");
  localStorage.setItem(OUTPUT_KEY, outputSel.value || "");
  applyOutputDevice(outputSel.value || "");
  closeDeviceSettings();
}
function initDeviceSettings() {
  return __async(this, null, function* () {
    yield refreshAudioDeviceList();
    const inputSel = document.getElementById("inputDeviceSelect");
    const outputSel = document.getElementById("outputDeviceSelect");
    if (!inputSel || !outputSel) return;
    inputSel.onchange = () => {
      localStorage.setItem(INPUT_KEY, inputSel.value || "");
    };
    outputSel.onchange = () => {
      localStorage.setItem(OUTPUT_KEY, outputSel.value || "");
      applyOutputDevice(outputSel.value || "");
    };
  });
}
if (navigator.mediaDevices && "ondevicechange" in navigator.mediaDevices) {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    const modal = document.getElementById("deviceSettingsModal");
    if (modal && modal.style.display === "flex") {
      refreshAudioDeviceList();
    }
  });
}
document.addEventListener("DOMContentLoaded", () => {
  const outId = localStorage.getItem(OUTPUT_KEY);
  if (outId) applyOutputDevice(outId);
});
window.openDeviceSettings = openDeviceSettings;
window.closeDeviceSettings = closeDeviceSettings;
window.refreshAudioDeviceList = refreshAudioDeviceList;
window.saveDeviceSelections = saveDeviceSelections;

// src/recorder.ts
var AudioRecorder = class {
  constructor(audioContext) {
    this.audioContext = audioContext;
  }
  record(durationSec) {
    return __async(this, null, function* () {
      const recording = [
        new Float32Array(durationSec * this.audioContext.sampleRate),
        new Float32Array(durationSec * this.audioContext.sampleRate)
      ];
      let pointer = 0;
      yield this.audioContext.audioWorklet.addModule("static/buffering-processor.worklet.js");
      const stream = yield navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      const streamSource = this.audioContext.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(
        this.audioContext,
        "buffering-processor",
        {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          processorOptions: {
            buffer: null
          }
        }
      );
      streamSource.connect(worklet);
      worklet.port.onmessage = (event) => {
        if (pointer + event.data.buffer[0].length > recording[0].length) {
          worklet.disconnect();
          streamSource.disconnect();
          return new Promise((resolve) => {
            resolve(recording);
          });
        }
        recording[0].set(event.data.buffer[0], pointer);
        recording[1].set(event.data.buffer[1], pointer);
        pointer += event.data.buffer[0].length;
      };
      return new Promise((resolve) => {
        setTimeout(() => {
          worklet.disconnect();
          streamSource.disconnect();
          stream.getTracks().forEach((track) => track.stop());
          resolve(recording);
        }, durationSec * 1e3);
      });
    });
  }
};

// src/wave.ts
function download(samples, sampleRate = 48e3, name = "output", bext, ixml) {
  const channels = 1;
  const bytesPerSample = 4;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  let bextDataSize = 0;
  let bextPayload = null;
  if (bext) {
    const description = bext.description || "";
    const originator = bext.originator || "";
    const originatorReference = bext.originatorReference || "";
    const originationDate = bext.originationDate || "";
    const originationTime = bext.originationTime || "";
    const codingHistory = bext.codingHistory || "";
    const version = typeof bext.version === "number" ? bext.version : 1;
    const umidBytes = bext.umid && bext.umid.length ? bext.umid : null;
    const baseLen = 602;
    const codingLen = codingHistory ? codingHistory.length + 1 : 0;
    bextDataSize = baseLen + codingLen;
    if (bextDataSize % 2 === 1) bextDataSize++;
    bextPayload = new Uint8Array(bextDataSize);
    let p = 0;
    const writeFixed = (str, len) => {
      for (let i = 0; i < len; i++) {
        const code = i < str.length ? str.charCodeAt(i) & 255 : 0;
        bextPayload[p++] = code;
      }
    };
    writeFixed(description, 256);
    writeFixed(originator, 32);
    writeFixed(originatorReference, 32);
    writeFixed(originationDate, 10);
    writeFixed(originationTime, 8);
    let timeRefLow = 0;
    let timeRefHigh = 0;
    try {
      const tr = bext.timeReference || "0";
      const BigIntFn = globalThis.BigInt;
      if (typeof BigIntFn === "function") {
        const t = BigIntFn(tr);
        const mask = BigIntFn(4294967295);
        timeRefLow = Number(t & mask);
        timeRefHigh = Number(t >> BigIntFn(32) & mask);
      } else {
        const n = Number(tr || 0);
        timeRefLow = Math.floor(n % 4294967296);
        timeRefHigh = Math.floor(n / 4294967296);
      }
    } catch (e) {
      timeRefLow = 0;
      timeRefHigh = 0;
    }
    bextPayload[p++] = timeRefLow & 255;
    bextPayload[p++] = timeRefLow >>> 8 & 255;
    bextPayload[p++] = timeRefLow >>> 16 & 255;
    bextPayload[p++] = timeRefLow >>> 24 & 255;
    bextPayload[p++] = timeRefHigh & 255;
    bextPayload[p++] = timeRefHigh >>> 8 & 255;
    bextPayload[p++] = timeRefHigh >>> 16 & 255;
    bextPayload[p++] = timeRefHigh >>> 24 & 255;
    bextPayload[p++] = version & 255;
    bextPayload[p++] = version >>> 8 & 255;
    if (version > 0) {
      if (umidBytes) {
        for (let i = 0; i < 64; i++) bextPayload[p++] = i < umidBytes.length ? umidBytes[i] : 0;
      } else {
        for (let i = 0; i < 64; i++) bextPayload[p++] = 0;
      }
    } else {
      for (let i = 0; i < 64; i++) bextPayload[p++] = 0;
    }
    for (let i = 0; i < 190; i++) bextPayload[p++] = 0;
    if (codingHistory) {
      for (let i = 0; i < codingHistory.length; i++) bextPayload[p++] = codingHistory.charCodeAt(i) & 255;
      bextPayload[p++] = 0;
    }
    while (p < bextDataSize) bextPayload[p++] = 0;
  }
  let ixmlDataSize = 0;
  let ixmlPayload = null;
  if (ixml) {
    const enc = globalThis.TextEncoder ? new TextEncoder() : null;
    if (enc) ixmlPayload = enc.encode(ixml);
    else {
      const arr = new Uint8Array(ixml.length);
      for (let i = 0; i < ixml.length; i++) arr[i] = ixml.charCodeAt(i) & 255;
      ixmlPayload = arr;
    }
    ixmlDataSize = ixmlPayload.length;
    if (ixmlDataSize % 2 === 1) ixmlDataSize++;
  }
  const fmtChunkSize = 8 + 16;
  const bextChunkSize = bextPayload ? 8 + bextDataSize : 0;
  const ixmlChunkSize = ixmlPayload ? 8 + ixmlDataSize : 0;
  const dataChunkSize = 8 + dataSize + (dataSize % 2 === 1 ? 1 : 0);
  const riffBodySize = 4 + fmtChunkSize + bextChunkSize + ixmlChunkSize + dataChunkSize;
  const totalSize = 8 + riffBodySize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeString(0, "RIFF");
  view.setUint32(4, riffBodySize, true);
  writeString(8, "WAVE");
  let ptr = 12;
  writeString(ptr, "fmt ");
  view.setUint32(ptr + 4, 16, true);
  view.setUint16(ptr + 8, 1, true);
  view.setUint16(ptr + 10, channels, true);
  view.setUint32(ptr + 12, sampleRate, true);
  view.setUint32(ptr + 16, byteRate, true);
  view.setUint16(ptr + 20, blockAlign, true);
  view.setUint16(ptr + 22, 16, true);
  ptr += 8 + 16;
  if (bextPayload) {
    writeString(ptr, "bext");
    view.setUint32(ptr + 4, bextDataSize, true);
    ptr += 8;
    new Uint8Array(buffer, ptr, bextDataSize).set(bextPayload);
    ptr += bextDataSize;
    if (bextDataSize % 2 === 1) {
      view.setUint8(ptr, 0);
      ptr++;
    }
  }
  if (ixmlPayload) {
    writeString(ptr, "iXML");
    view.setUint32(ptr + 4, ixmlDataSize, true);
    ptr += 8;
    const dest = new Uint8Array(buffer, ptr, ixmlDataSize);
    dest.set(ixmlPayload);
    if (ixmlDataSize > ixmlPayload.length) {
      for (let i = ixmlPayload.length; i < ixmlDataSize; i++) dest[i] = 0;
    }
    ptr += ixmlDataSize;
    if (ixmlDataSize % 2 === 1) {
      view.setUint8(ptr, 0);
      ptr++;
    }
  }
  writeString(ptr, "data");
  view.setUint32(ptr + 4, dataSize, true);
  ptr += 8;
  let off = ptr;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, Number(samples[i])));
    view.setInt16(off, s < 0 ? s * 32768 : s * 32767, true);
  }
  if (dataSize % 2 === 1) {
    view.setUint8(off, 0);
    off++;
  }
  const blob = new Blob([buffer], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function convertToIXML(xmlContent) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<BWFXML>
    <IXML_VERSION>3.01</IXML_VERSION>
    <PROJECT>Converted Audio File</PROJECT>
    <NOTE>Converted to iXML format.</NOTE>
    <HISTORY></HISTORY>
    <USER>${xmlContent}</USER>
</BWFXML>`;
}

// src/app.ts
console.debug("App module loaded");
var fileMap = [];
var root = document.documentElement;
var uiColor = "#0366d6";
root.style.setProperty("--color", uiColor);
var tabCounter = 0;
var tabsContainer = document.getElementById("tabs-outer");
var tabsInnerContainer = document.getElementById("tabs");
var tabContents = document.getElementById("tab-contents");
var responseFileUploadInput = document.getElementById("responseFileUpload");
var referenceFileUploadInput = document.getElementById("referenceFileUpload");
var analyzeUploadBtn = document.getElementById("analyzeUploadBtn");
var polarReferenceFileInput = document.getElementById("polarReferenceFile");
var polarMeasurementsEl = document.getElementById("polarMeasurements");
var addPolarMeasurementBtn = document.getElementById("addPolarMeasurementBtn");
var analyzePolarBtn = document.getElementById("analyzePolarBtn");
var polarStatusEl = document.getElementById("polarStatus");
var statusMessage = document.getElementById("statusMessage");
function setStatusMessage(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? "#d73a49" : "#28a745";
}
var acquisitionState = {
  audioContext: null,
  mediaRecorder: null,
  recordedChunks: [],
  oscillatorNode: null,
  playbackSource: null,
  isRecording: false
};
var startBtn = document.getElementById("startBtn");
var stopBtn = document.getElementById("stopBtn");
var playBtn = document.getElementById("playBtn");
var stopPlayBtn = document.getElementById("stopPlayBtn");
var sweepStartFreqInput = document.getElementById("sweepStartFreq");
var sweepEndFreqInput = document.getElementById("sweepEndFreq");
var sweepDurationInput = document.getElementById("sweepDuration");
var recordingStatusEl = document.getElementById("recordingStatus");
var recordingMeterEl = document.getElementById("recordingMeter");
var recordingVisualizationEl = document.getElementById("recordingVisualization");
var recordedAudioContainer = document.getElementById("recordedAudioContainer");
var recordedAudioEl = document.getElementById("recordedAudio");
var analyzeRecordingBtn = document.getElementById("analyzeRecordingBtn");
var viewWaveformBtn = document.getElementById("viewWaveformBtn");
var channelSelectionContainer = document.getElementById("channelSelectionContainer");
var channelSelect = document.getElementById("channelSelect");
function initializeAudioContext() {
  return __async(this, null, function* () {
    if (!acquisitionState.audioContext) {
      acquisitionState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (acquisitionState.audioContext.state === "suspended") {
      yield acquisitionState.audioContext.resume();
    }
    return acquisitionState.audioContext;
  });
}
function detectAndSetupChannels() {
  return __async(this, null, function* () {
    var _a;
    try {
      const stream = yield navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      const audioContext = yield initializeAudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const channelCount = ((_a = source.mediaStream.getAudioTracks()[0].getSettings()) == null ? void 0 : _a.channelCount) || 1;
      stream.getTracks().forEach((track) => track.stop());
      channelSelect.innerHTML = "";
      for (let i = 0; i < channelCount; i++) {
        const option = document.createElement("option");
        option.value = i.toString();
        const channelNames = ["Left", "Right", "Center", "LFE", "Back Left", "Back Right"];
        option.textContent = `Channel ${i + 1}${channelNames[i] ? ` (${channelNames[i]})` : ""}`;
        channelSelect.appendChild(option);
      }
      if (channelCount > 1) {
        channelSelectionContainer.style.display = "flex";
      } else {
        channelSelectionContainer.style.display = "none";
      }
    } catch (error) {
      console.error("Error detecting channels:", error);
      channelSelectionContainer.style.display = "none";
    }
  });
}
tabsContainer.addEventListener("click", (e) => {
  const target = e.target;
  if (target.classList.contains("tab") && target.dataset.tab === "acquisition") {
    detectAndSetupChannels();
  }
});
var recorded = [Float32Array.from([]), Float32Array.from([])];
function startRecordingAndPlayback() {
  return __async(this, null, function* () {
    try {
      const audioContext = yield initializeAudioContext();
      const startFreq = parseFloat(sweepStartFreqInput.value);
      const endFreq = parseFloat(sweepEndFreqInput.value);
      const duration = parseFloat(sweepDurationInput.value);
      const preRecordTime = 0.5;
      const postRecordTime = 1;
      const totalRecordTime = preRecordTime + duration + postRecordTime;
      const [sweepSignal, ,] = audio.chirp(startFreq, endFreq, duration);
      download(sweepSignal, 48e3, "sweep_signal.wav");
      const audioBuffer = audioContext.createBuffer(1, sweepSignal.length, audioContext.sampleRate);
      const channelData = audioBuffer.getChannelData(0);
      channelData.set(sweepSignal);
      const sourceGain = audioContext.createGain();
      sourceGain.gain.value = 0.5;
      recordingStatusEl.textContent = `Recording for ${totalRecordTime.toFixed(1)}s...`;
      const recorder = new AudioRecorder(audioContext);
      recorder.record(totalRecordTime).then((recordingData) => {
        recorded = recordingData;
        stopRecording();
      });
      startBtn.disabled = true;
      stopBtn.disabled = false;
      playBtn.disabled = true;
      sweepStartFreqInput.disabled = true;
      sweepEndFreqInput.disabled = true;
      sweepDurationInput.disabled = true;
      setTimeout(() => {
        acquisitionState.playbackSource = audioContext.createBufferSource();
        acquisitionState.playbackSource.buffer = audioBuffer;
        acquisitionState.playbackSource.connect(sourceGain);
        sourceGain.connect(audioContext.destination);
        acquisitionState.playbackSource.start();
      }, preRecordTime * 1e3);
      setTimeout(() => {
        stopRecording();
      }, totalRecordTime * 1e3);
    } catch (error) {
      console.error("Error starting recording:", error);
      recordingStatusEl.textContent = `Error: ${error.message}`;
      recordingStatusEl.style.color = "#d73a49";
    }
  });
}
function playbackOnly() {
  return __async(this, null, function* () {
    try {
      const audioContext = yield initializeAudioContext();
      const startFreq = parseFloat(sweepStartFreqInput.value);
      const endFreq = parseFloat(sweepEndFreqInput.value);
      const duration = parseFloat(sweepDurationInput.value);
      const [sweepSignal] = audio.chirp(startFreq, endFreq, duration);
      const audioBuffer = audioContext.createBuffer(1, sweepSignal.length, audioContext.sampleRate);
      const channelData = audioBuffer.getChannelData(0);
      channelData.set(sweepSignal);
      const sourceGain = audioContext.createGain();
      sourceGain.gain.value = 0.5;
      acquisitionState.playbackSource = audioContext.createBufferSource();
      acquisitionState.playbackSource.buffer = audioBuffer;
      acquisitionState.playbackSource.connect(sourceGain);
      sourceGain.connect(audioContext.destination);
      acquisitionState.playbackSource.start();
      recordingStatusEl.textContent = `Playing sweep...`;
      recordingStatusEl.style.color = "#0366d6";
      playBtn.disabled = true;
      stopPlayBtn.disabled = false;
      setTimeout(() => {
        stopPlayback();
      }, (duration + 0.5) * 1e3);
    } catch (error) {
      console.error("Error during playback:", error);
      recordingStatusEl.textContent = `Error: ${error.message}`;
      recordingStatusEl.style.color = "#d73a49";
    }
  });
}
function stopRecording() {
  recordingStatusEl.textContent = "Recording complete. Ready to analyze.";
  recordingStatusEl.style.color = "#28a745";
  startBtn.disabled = false;
  stopBtn.disabled = true;
  playBtn.disabled = false;
  sweepStartFreqInput.disabled = false;
  sweepEndFreqInput.disabled = false;
  sweepDurationInput.disabled = false;
  recordedAudioContainer.style.display = "block";
}
function stopPlayback() {
  if (acquisitionState.playbackSource) {
    try {
      acquisitionState.playbackSource.stop();
    } catch (e) {
    }
  }
  recordingStatusEl.textContent = "Playback stopped.";
  playBtn.disabled = false;
  stopPlayBtn.disabled = true;
}
var measurementAngleInput = document.getElementById("measurementAngle");
var measurementLocationInput = document.getElementById("measurementLocation");
var measurementCommentInput = document.getElementById("measurementComment");
var downloadRecordingBtn = document.getElementById("downloadRecordingBtn");
downloadRecordingBtn == null ? void 0 : downloadRecordingBtn.addEventListener("click", () => {
  try {
    download(
      recorded[0],
      48e3,
      "recorded_audio.wav",
      {},
      convertToIXML(`
        <ANGLE>${measurementAngleInput.value}</ANGLE>
        <LOCATION>${measurementLocationInput.value}</LOCATION>
        <COMMENT>${measurementCommentInput.value}</COMMENT>
        <STIMULUS_TYPE>chirp</STIMULUS_TYPE>
        <STIMULUS_START_FREQ>${sweepStartFreqInput.value}</STIMULUS_START_FREQ>
        <STIMULUS_END_FREQ>${sweepEndFreqInput.value}</STIMULUS_END_FREQ>
        <STIMULUS_DURATION>${sweepDurationInput.value}</STIMULUS_DURATION>
        <STIMULUS_FADE>0.01</STIMULUS_FADE>
        <STIMULUS_SAMPLE_RATE>48000</STIMULUS_SAMPLE_RATE>
        <ORIGIN>Acquisition Module</ORIGIN>`)
    );
  } catch (err) {
    console.error("Failed to create/download recording:", err);
    alert("Failed to download recording: " + err.message);
  }
});
var downloadSweepBtn = document.getElementById("downloadSweepBtn");
downloadSweepBtn == null ? void 0 : downloadSweepBtn.addEventListener("click", () => {
  try {
    download(
      recorded[0],
      48e3,
      "reference_audio.wav",
      {},
      convertToIXML(`
        <STIMULUS>
            <TYPE>chirp</TYPE>
            <START>${sweepStartFreqInput.value}</START>
            <END>${sweepEndFreqInput.value}</END>
            <FADE>0.01</FADE>
            <DURATION>${sweepDurationInput.value}</DURATION>
            <SAMPLE_RATE>48000</SAMPLE_RATE>
        </STIMULUS>
        <ORIGIN>Acquisition Module</ORIGIN>`)
    );
  } catch (err) {
    console.error("Failed to create/download recording:", err);
    alert("Failed to download recording: " + err.message);
  }
});
startBtn.addEventListener("click", startRecordingAndPlayback);
stopBtn.addEventListener("click", stopRecording);
playBtn.addEventListener("click", playbackOnly);
stopPlayBtn.addEventListener("click", stopPlayback);
analyzeRecordingBtn.addEventListener("click", () => __async(null, null, function* () {
  console.log("Analyzing recording...");
  try {
    const recordedAudio = Audio.fromSamples(recorded[0], 48e3);
    const startFreq = parseFloat(sweepStartFreqInput.value);
    const endFreq = parseFloat(sweepEndFreqInput.value);
    const duration = parseFloat(sweepDurationInput.value);
    const [sweepSignal] = audio.chirp(startFreq, endFreq, duration);
    const referenceAudio = Audio.fromSamples(sweepSignal, 48e3);
    const now = /* @__PURE__ */ new Date();
    const dateTime = now.toLocaleString("sv-SE", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).replace(",", "");
    const recordingName = `${dateTime}`;
    createAnalysisTab(
      recordedAudio.applyGain(1 / 16384),
      referenceAudio.applyGain(1 / 16384),
      recordingName,
      `${startFreq}-${endFreq}Hz`
    );
  } catch (error) {
    console.error("Error analyzing recording:", error);
    alert("Error analyzing recording: " + error.message);
  }
}));
window.addEventListener("beforeunload", (e) => {
  try {
    saveState();
  } catch (err) {
    console.error("Failed to save state on beforeunload:", err);
  }
});
tabsContainer.addEventListener("click", (e) => {
  var _a;
  const target = e.target;
  if (target.classList.contains("tab-close")) {
    const tab = target.parentElement;
    const tabId = tab.dataset.tab;
    if (tabId == "upload") return;
    console.debug("Closing tab", tabId);
    tab.remove();
    (_a = document.querySelector(`[data-content="${tabId}"]`)) == null ? void 0 : _a.remove();
    storage.removeItem(`analysis-${tabId}`).catch((err) => console.error("Failed to remove analysis from storage:", err));
    if (tab.classList.contains("active")) {
      switchTab("upload");
    }
    saveState();
    e.stopPropagation();
  } else if (target.classList.contains("tab")) {
    const tabId = target.dataset.tab;
    if (tabId) {
      switchTab(tabId);
    }
  }
});
function switchTab(tabId) {
  var _a, _b;
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  (_a = document.querySelector(`[data-tab="${tabId}"]`)) == null ? void 0 : _a.classList.add("active");
  (_b = document.querySelector(`[data-content="${tabId}"]`)) == null ? void 0 : _b.classList.add("active");
}
analyzeUploadBtn.addEventListener("click", () => __async(null, null, function* () {
  var _a, _b;
  const responseFile = (_a = responseFileUploadInput.files) == null ? void 0 : _a[0];
  const referenceFile = (_b = referenceFileUploadInput.files) == null ? void 0 : _b[0];
  if (!responseFile) return;
  analyzeUploadBtn.disabled = true;
  analyzeUploadBtn.textContent = "Analyzing...";
  try {
    const responseData = yield audio.loadAudioFile(responseFile);
    const referenceData = referenceFile ? yield audio.loadAudioFile(referenceFile) : null;
    createAnalysisTab(
      responseData.applyGain(1 / 16384),
      referenceData ? referenceData.applyGain(1 / 16384) : null,
      responseFile.name,
      (referenceFile == null ? void 0 : referenceFile.name) || null
    );
  } catch (error) {
    alert("Error analyzing files: " + error.message);
  } finally {
    analyzeUploadBtn.disabled = false;
    analyzeUploadBtn.textContent = "Analyze Frequency Response";
  }
}));
function createAnalysisTab(responseData, referenceData, filename, referenceFilename) {
  setStatusMessage("Creating analysis tab...");
  tabCounter++;
  const tabId = `analysis-${tabCounter}`;
  let shortName = filename.length > 20 ? filename.substring(0, 17) + "..." : filename;
  if (referenceFilename != null) {
    const shortReferenceName = (referenceFilename == null ? void 0 : referenceFilename.length) > 20 ? referenceFilename.substring(0, 17) + "..." : referenceFilename;
    shortName += " / " + shortReferenceName;
  }
  const tab = document.createElement("button");
  tab.className = "tab tab-closable tab-loading";
  tab.dataset.tab = tabId;
  tab.innerHTML = `<span class="tab-icon-analysis"></span>${shortName} <span class="tab-close">\u2715</span>`;
  tabsInnerContainer.appendChild(tab);
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      var _a, _b;
      const content = document.createElement("div");
      content.className = "tab-content";
      content.dataset.content = tabId;
      content.innerHTML = `
    <!-- nav class="tab-menu-bar">
                <div>
                    <label for="smoothing-${tabId}">Smoothing</label>
                    <select id="smoothing-${tabId}" class="smoothing-select" aria-label="Smoothing factor">
                        <option value="0">None</option>
                        <option value="1/3">1/3 octave</option>
                        <option value="1/6" selected>1/6 octave</option>
                        <option value="1/12">1/12 octave</option>
                        <option value="1/24">1/24 octave</option>
                        <option value="1/48">1/48 octave</option>
                    </select>
                </div>
            </nav> <h5 class="text-xs italic text-gray-600">Frequency Response Analysis of ${filename}${referenceFilename ? " / " + referenceFilename : ""}</h5 -->
        <button class="sidecar-toggle" id="sidebar-toggle-${tabId}" title="Toggle Sidecar">Open settings pane</button>
        <div class="flex h-full">
            <div class="flex-none w-86 border-r border-[#ddd] p-2 relative sidecar" style="transition:50ms linear;">
                <div class="section">
                    <div class="title">Settings</div>
                    <p><i>There are no settings for this analysis.</i></p>
                </div>
                <div class="section">
                    <div class="title">Plots</div>
                    <ul class="list" id="plot-list-${tabId}">
                        <!--li><input type="checkbox" id="checkbox-magnitude-${tabId}" alt="show/hide" checked><label for="checkbox-magnitude-${tabId}">Magnitude</label></li>
                        <li><input type="checkbox" id="checkbox-phase-${tabId}" alt="show/hide" checked><label for="checkbox-phase-${tabId}">Phase</label></li>
                        <li><input type="checkbox" id="checkbox-ir-${tabId}" alt="show/hide" checked><label for="checkbox-ir-${tabId}">Impulse Response</label></li>
                        <li><input type="checkbox" id="checkbox-ir-${tabId}" alt="show/hide" disabled><label for="checkbox-ir-${tabId}">Fundamental + Harmonic Distortion</label></li>
                        <li><input type="checkbox" id="checkbox-distortion-${tabId}" alt="show/hide" disabled><label for="checkbox-distortion-${tabId}">Distortion</label></li>
                        <li><input type="checkbox" id="checkbox-distortion-${tabId}" alt="show/hide" disabled><label for="checkbox-distortion-${tabId}">Sound Pressure Level</label></li>
                        <li><input type="checkbox" id="checkbox-deconvoluted-ir-${tabId}" alt="show/hide" disabled><label for="checkbox-deconvoluted-ir-${tabId}">Deconvoluted Impulse Response</label></li>
                        <li><input type="checkbox" id="checkbox-stimulus-waveform-${tabId}" alt="show/hide" disabled><label for="checkbox-stimulus-waveform-${tabId}">Stimulus Waveform</label></li>
                        <li><input type="checkbox" id="checkbox-recorded-waveform-${tabId}" alt="show/hide" disabled><label for="checkbox-recorded-waveform-${tabId}">Recorded Waveform</label></li>
                        <li><input type="checkbox" id="checkbox-recorded-noise-floor-${tabId}" alt="show/hide" disabled><label for="checkbox-recorded-noise-floor-${tabId}">Recorded Noise Floor</label></li>
                        <li><input type="checkbox" id="checkbox-target-curve-${tabId}" alt="show/hide" disabled><label for="checkbox-target-curve-${tabId}">Target Curve<button class="float-right text-xs cursor-pointer" style="color: #bbb; padding-top: 3px">Set</button></label></li-->
                    </ul>
                </div>
                <div class="section">
                    <div class="title">Properties</div>
                    <p id="properties-${tabId}"><i>There are no properties for this analysis.</i></p>
                </div>
                <div id="resize-handle" class="resize-handle"></div>
            </div>
            <div class="flex-1 main-content">
                <div class="grid grid-cols-6 gap-[1px] bg-[#ddd] border-b border-[#ddd] plot-outer">
                </div>
            </div>
        </div>
       
        
    `;
      tabContents.appendChild(content);
      const propertiesElement = document.getElementById(`properties-${tabId}`);
      if (propertiesElement) {
        propertiesElement.innerHTML = `
            <b>Filename:</b> ${filename}<br>
            ${referenceFilename ? `<b>Reference Filename:</b> ${referenceFilename}<br>` : ""}
            <b>Sample Rate:</b> ${responseData.sampleRate} Hz<br>
            <b>Channels:</b> ${responseData.numberOfChannels}<br>
            <b>Duration:</b> ${responseData.duration.toFixed(2)} s<br>
            <b>RMS Level:</b> ${db(rms(responseData.getChannelData(0)))} dBFS<br>
            <b>Peak Level:</b> ${db(max(responseData.getChannelData(0)))} dBFS<br>
            <iXML Metadata:</i><br>
            <pre>${(((_a = responseData.metadata) == null ? void 0 : _a.iXMLdata) || "").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre>
            `;
      }
      const sidebarToggleBtn = document.getElementById(`sidebar-toggle-${tabId}`);
      const sidecar = content.querySelector(".sidecar");
      const resizeHandle = content.querySelector("#resize-handle");
      sidebarToggleBtn.addEventListener("click", () => {
        if (sidecar.style.width === "0px") {
          sidecar.style.width = "21.5rem";
          sidebarToggleBtn.title = "Close settings pane";
        } else {
          sidecar.style.width = "0px";
          sidebarToggleBtn.title = "Open settings pane";
        }
      });
      let isResizing = false;
      let lastDownX = 0;
      resizeHandle.addEventListener("mousedown", (e) => {
        isResizing = true;
        lastDownX = e.clientX;
        document.body.style.cursor = "ew-resize";
        e.preventDefault();
      });
      document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const offsetRight = tabsContainer.clientWidth - e.clientX;
        const newWidth = tabsContainer.clientWidth - offsetRight;
        if (newWidth >= 200 && newWidth <= 600) {
          sidecar.style.width = `${newWidth}px`;
        }
        e.preventDefault();
      });
      document.addEventListener("mouseup", () => {
        if (isResizing) {
          isResizing = false;
          document.body.style.cursor = "default";
        }
      });
      switchTab(tabId);
      const responseSamples = responseData.getChannelData(0);
      const responseFFT = computeFFT(responseSamples);
      const smoothedResponseFFT = smoothFFT(responseFFT, 1 / 6, 1 / 48);
      let referenceSamples = Float32Array.from([]);
      plot(
        [
          { x: responseFFT.frequency, y: db(responseFFT.magnitude), name: "Recorded signal", line: { color: "#0366d666", width: 0.75 } },
          { x: smoothedResponseFFT.frequency, y: db(smoothedResponseFFT.magnitude), name: "Recorded signal (Smoothed)", line: { color: "#0366d6", width: 1.5 } }
        ],
        tabId,
        "Recorded Spectrum",
        "Frequency (Hz)",
        "Amplitude (dBFS)",
        { type: "log", range: [Math.log10(20), Math.log10(2e4)] },
        { range: [-85, 5] },
        {},
        true
      );
      plot(
        [
          { x: linspace(0, responseSamples.length / 48e3, responseSamples.length), y: responseSamples, name: "Recorded signal", line: { color: "#0366d6ff", width: 0.75 } }
        ],
        tabId,
        "Recorded Waveform",
        "Time (s)",
        "Amplitude",
        {},
        {},
        {},
        true
      );
      setStatusMessage("");
      if (referenceData) {
        referenceSamples = referenceData.getChannelData(0);
        const referenceFFT = computeFFT(referenceSamples);
        const smoothedReferenceFFT = smoothFFT(referenceFFT, 1 / 6, 1 / 48);
        plot(
          [
            { x: referenceFFT.frequency, y: db(referenceFFT.magnitude), name: "Stimulus signal", line: { color: "#0366d666", width: 0.75 } },
            { x: smoothedReferenceFFT.frequency, y: db(smoothedReferenceFFT.magnitude), name: "Stimulus signal (Smoothed)", line: { color: "#0366d6", width: 1.5 } }
          ],
          tabId,
          "Stimulus Spectrum",
          "Frequency (Hz)",
          "Amplitude (dBFS)",
          { type: "log", range: [Math.log10(20), Math.log10(2e4)] },
          { range: [-85, 5] },
          {},
          true
        );
        plot(
          [
            { x: linspace(0, referenceSamples.length / 48e3, referenceSamples.length), y: referenceSamples, name: "Stimulus signal", line: { color: "#0366d6ff", width: 0.75 } }
          ],
          tabId,
          "Stimulus Waveform",
          "Time (s)",
          "Amplitude",
          {},
          {},
          {},
          true
        );
        const ir = twoChannelImpulseResponse(responseSamples, referenceSamples);
        const farina = new Farina(referenceSamples, 20, 2e4, 48e3);
        const farina_ir = farina.deconvolvedResponse(responseSamples);
        plotDistortion(farina, 0.1, 5, tabId);
        plotTHD(farina, 0.1, 5, tabId);
        console.log("Impulse response peak at", farina.lag_of_harmonic(2));
        plot(
          [
            { x: ir.t, y: ir.ir, type: "scatter", mode: "lines", name: "Dual-FFT Impulse Response", line: { color: COLORS[0], width: 0.75 } }
          ],
          tabId,
          "Impulse Response",
          "Time (s)",
          "Amplitude",
          {},
          {},
          {},
          false
        );
        plot(
          [
            { x: [-max(farina_ir.t), max(farina_ir.t)], y: [-200, -200], showlegend: false },
            { x: farina_ir.t, y: db(farina_ir.ir.map((x) => Math.abs(x))), type: "scatter", mode: "lines", fill: "tonexty", name: "Farina Impulse Response", line: { color: COLORS[0], width: 0.75 }, fillcolor: COLORS[0] },
            { x: [-0.05, -0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "Fundamental window start", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [0.05, 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "Fundamental window end", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [-farina.lag_of_harmonic(2) - 0.05, -farina.lag_of_harmonic(2) - 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "H2 window start", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [-farina.lag_of_harmonic(2) + 0.05, -farina.lag_of_harmonic(2) + 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "H2 window end", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [-farina.lag_of_harmonic(3) - 0.05, -farina.lag_of_harmonic(3) - 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "H3 window start", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [-farina.lag_of_harmonic(3) + 0.05, -farina.lag_of_harmonic(3) + 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "H3 window end", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [-farina.lag_of_harmonic(4) - 0.05, -farina.lag_of_harmonic(4) - 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "H4 window start", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [-farina.lag_of_harmonic(4) + 0.05, -farina.lag_of_harmonic(4) + 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "H4 window end", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [-farina.lag_of_harmonic(5) - 0.05, -farina.lag_of_harmonic(5) - 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "H5 window start", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [-farina.lag_of_harmonic(5) + 0.05, -farina.lag_of_harmonic(5) + 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "H5 window end", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [-farina.lag_of_harmonic(6) - 0.05, -farina.lag_of_harmonic(6) - 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "H6 window start", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [-farina.lag_of_harmonic(6) + 0.05, -farina.lag_of_harmonic(6) + 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "H6 window end", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [-farina.lag_of_harmonic(7) - 0.05, -farina.lag_of_harmonic(7) - 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "H7 window start", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false },
            { x: [-farina.lag_of_harmonic(7) + 0.05, -farina.lag_of_harmonic(7) + 0.05], y: [-999, 999], type: "scatter", mode: "lines", name: "H7 window end", line: { color: "#00000033", width: 0.75 }, hoverinfo: "skip", showlegend: false }
          ],
          tabId,
          "Deconvolved Response",
          "Time (s)",
          "Amplitude",
          { range: [-1, 1] },
          { range: [-150, 10] },
          {},
          false
        );
        const transferFunction = computeFFTFromIR(ir);
        const smoothedFreqResponse = smoothFFT(transferFunction, 1 / 6, 1 / 48);
        const gd = groupDelays(transferFunction, 1e3);
        plot(
          [
            { x: transferFunction.frequency, y: db(transferFunction.magnitude), name: "Magnitude", line: { color: "#0366d666", width: 0.75 } },
            { x: smoothedFreqResponse.frequency, y: db(smoothedFreqResponse.magnitude), name: "Magnitude (Smoothed)", line: { color: "#0366d6", width: 1.5 } }
          ],
          tabId,
          "Transfer Function",
          "Frequency (Hz)",
          "Amplitude (dBFS)",
          { type: "log", range: [Math.log10(20), Math.log10(2e4)] },
          { range: [-85, 5] },
          {},
          false
        );
        plot(
          [
            { x: transferFunction.frequency, y: transferFunction.phase, name: "Phase", line: { color: "#0366d666", width: 0.75 } },
            { x: smoothedFreqResponse.frequency, y: smoothedFreqResponse.phase, name: "Phase (Smoothed)", line: { color: "#0366d6", width: 1.5 } }
          ],
          tabId,
          "Phase",
          "Frequency (Hz)",
          "Amplitude (dBFS)",
          { type: "log", range: [Math.log10(20), Math.log10(2e4)] },
          { range: [-720, 720] },
          {},
          false
        );
        plot(
          [
            { x: transferFunction.frequency, y: gd, name: "Group Delay", line: { color: COLORS[0], width: 1.5, dash: "dot" } }
          ],
          tabId,
          "Group Delay",
          "Frequency (Hz)",
          "Group Delay (ms)",
          { type: "log", range: [Math.log10(20), Math.log10(2e4)] },
          { range: [-20, 20] },
          {},
          false
        );
        (() => {
          var _a2, _b2;
          const sr = (_b2 = (_a2 = responseData.sampleRate) != null ? _a2 : referenceData == null ? void 0 : referenceData.sampleRate) != null ? _b2 : 48e3;
          const n = responseSamples.length;
          if (n < 4096) return;
          const windowSize = 2048;
          const targetFrames = 320;
          const minHop = 256;
          const rawFrames = Math.max(1, Math.floor((n - windowSize) / minHop) + 1);
          const hop = rawFrames > targetFrames ? Math.max(minHop, Math.ceil((n - windowSize) / targetFrames)) : minHop;
          const frames = Math.max(1, Math.floor((n - windowSize) / hop) + 1);
          const win = new Float32Array(windowSize);
          for (let i = 0; i < windowSize; i++) {
            win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSize - 1)));
          }
          const firstFrame = new Float32Array(windowSize);
          firstFrame.set(responseSamples.subarray(0, windowSize));
          for (let i = 0; i < windowSize; i++) firstFrame[i] *= win[i];
          const firstFFT = computeFFT(firstFrame);
          const freqs = Array.from(firstFFT.frequency);
          const bins = freqs.length;
          const z = Array.from({ length: bins }, () => []);
          const times = [];
          for (let frame = 0; frame < frames; frame++) {
            const start = frame * hop;
            const slice = responseSamples.subarray(start, start + windowSize);
            const windowed = new Float32Array(windowSize);
            windowed.set(slice);
            for (let i = 0; i < windowSize; i++) windowed[i] *= win[i];
            const fft = computeFFT(windowed);
            const magDb = db(fft.magnitude);
            for (let k = 0; k < bins; k++) {
              z[k].push(magDb[k]);
            }
            times.push((start + windowSize / 2) / sr);
          }
          plot(
            [
              {
                type: "heatmap",
                x: times,
                y: freqs,
                z,
                colorscale: "Electric",
                zmin: -120,
                zmax: 0,
                colorbar: { title: "dBFS" }
              }
            ],
            tabId,
            "Recorded Spectrogram",
            "Time (s)",
            "Frequency (Hz)",
            {},
            { type: "log", range: [Math.log10(20), Math.log10(2e4)] },
            { margin: { l: 60, r: 20, t: 40, b: 50 } },
            false
          );
        })();
      }
      saveState();
      storage.setItem(`${tabId}`, JSON.stringify({
        filename,
        referenceFilename,
        responseSamples: Array.from(responseSamples),
        referenceSamples: referenceSamples.length > 0 ? Array.from(referenceSamples) : null
      })).catch((err) => console.error("Failed to persist analysis:", err));
      function initResize(e) {
        e.preventDefault();
        window.addEventListener("mousemove", resize, false);
        window.addEventListener("mouseup", stopResize, false);
        console.log("Init resize");
        document.body.style.cursor = "col-resize";
      }
      function resize(e) {
        var _a2;
        const container = content.querySelector(".flex");
        const handle = (_a2 = document.getElementById("resize-handle")) == null ? void 0 : _a2.parentElement;
        const rect = container.getBoundingClientRect();
        const newWidth = e.clientX - rect.left;
        if (newWidth > 150 && newWidth < rect.width - 150) {
          handle.style.width = `${newWidth}px`;
        }
      }
      function stopResize() {
        window.removeEventListener("mousemove", resize, false);
        window.removeEventListener("mouseup", stopResize, false);
        window.dispatchEvent(new Event("resize"));
        document.body.style.cursor = "default";
      }
      (_b = document.getElementById("resize-handle")) == null ? void 0 : _b.addEventListener("mousedown", initResize, false);
      tab.classList.remove("tab-loading");
    });
  });
}
function saveState() {
  const tabs = Array.from(document.querySelectorAll(".tab[data-tab]")).map((tab) => {
    var _a;
    return {
      id: tab.dataset.tab,
      name: (_a = tab.textContent) == null ? void 0 : _a.replace("\xD7", "").trim()
    };
  });
  storage.setItem("tabs", JSON.stringify(tabs));
  console.log("Saved state with tabs:", tabs);
}
function loadState() {
  return __async(this, null, function* () {
    try {
      const savedTabs = yield storage.getItem("tabs");
      if (!savedTabs) return;
      const tabs = JSON.parse(savedTabs);
      console.log("Loading saved tabs:", tabs);
      for (const tab of tabs) {
        const raw = yield storage.getItem(`${tab.id}`);
        const analysisData = raw ? JSON.parse(raw) : null;
        console.log("Restoring analysis data for tab", tab.id, analysisData);
        if (analysisData) {
          createAnalysisTab(Audio.fromSamples(Float32Array.from(analysisData.responseSamples)), analysisData.referenceSamples ? Audio.fromSamples(Float32Array.from(analysisData.referenceSamples)) : null, analysisData.filename, analysisData.referenceFilename);
        }
      }
    } catch (e) {
      console.error("Failed to load saved state:", e);
    }
  });
}
function loadWaveformsFromStorage() {
  return __async(this, null, function* () {
    const waveforms = storage.getItem("waveforms");
    console.log("Attempting:", waveforms);
    const items = [];
    yield waveforms.then((raw) => {
      var _a;
      const decoded = JSON.parse(raw || "[]");
      console.log("f ", decoded[0], decoded[0].length, (_a = decoded[0].data) == null ? void 0 : _a.length, decoded[0].metadata);
      console.log("Decoded waveforms from storage:", decoded);
      const startLoadTime = performance.now();
      for (const item of decoded) {
        items.push(Audio.fromObject(item));
      }
      console.log(`Loaded ${items.length} waveforms from storage in ${performance.now() - startLoadTime} milliseconds`);
      console.log("Loaded waveforms from storage:", items);
    }).catch((err) => {
      console.warn("Failed to load waveforms from storage:", err);
    });
    console.log("Returning loaded waveforms:", items);
    return items;
  });
}
function saveWaveformsToStorage(waveforms) {
  console.warn("Saving waveforms to storage:", waveforms);
  const toSave = waveforms.map((wf) => wf.toObject());
  storage.setItem("waveforms", JSON.stringify(toSave)).catch((err) => {
    console.error("Failed to save waveforms to storage:", err);
  });
}
function createListItem(audioObject) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const li = document.createElement("li");
  li.style.display = "flex";
  li.classList.add("file-list-item");
  li.innerHTML = `
        <div style="flex:1;min-width:0;">
            <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${((_a = audioObject.metadata) == null ? void 0 : _a.filename) || "Unknown"}</div>
            <div style="font-size:12px;color:#666;">${((_b = audioObject.metadata) == null ? void 0 : _b.mime) || "audio/*"}</div>
            <div style="font-size:12px;color:#666;">Duration: ${audioObject.duration.toFixed(2)} seconds</div>
            <div style="font-size:12px;color:#666;">Angle: ${(_e = (_d = (_c = audioObject == null ? void 0 : audioObject.metadata) == null ? void 0 : _c.iXML) == null ? void 0 : _d.angle) != null ? _e : "N/A"} deg</div>
            <div style="font-size:12px;color:#666;">Origin: ${(_h = (_g = (_f = audioObject == null ? void 0 : audioObject.metadata) == null ? void 0 : _f.iXML) == null ? void 0 : _g.origin) != null ? _h : "Imported"}</div>
        </div>
        <div class="file-list-item-controls flex:1;min-width:0;">
            <div><label style="font-size:13px;"><input type="radio" name="selectedResponse" value=""> Response</label></div>
            <div><label style="font-size:13px;"><input type="radio" name="selectedReference" value=""> Reference</label></div>
            <div><button type="button" data-action="remove" style="margin-left:8px;">Remove</button></div>
        </div>
    `;
  return li;
}
function updateAnalyzeState() {
  const hasResponse = !!document.querySelector('input[name="selectedResponse"]:checked');
  const analyzeBtn = document.getElementById("analyzeUploadBtn");
}
function addFilesFromInput(fileList) {
  return __async(this, null, function* () {
    yield Promise.all(Array.from(fileList).map((f) => __async(null, null, function* () {
      var _a;
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const a = yield audio.loadAudioFile(f);
      fileMap.push(a);
      console.log("Added file:", id, a);
      console.log("Current file map:", fileMap);
      const li = createListItem(a);
      (_a = document.getElementById("fileList")) == null ? void 0 : _a.appendChild(li);
    }))).then(() => {
      console.log("All files added. Current file map:", fileMap);
      saveWaveformsToStorage(fileMap);
    });
    updateAnalyzeState();
  });
}
document.addEventListener("DOMContentLoaded", () => {
  const respInput = document.getElementById("responseFileUpload");
  const refInput = document.getElementById("referenceFileUpload");
  if (respInput) respInput.addEventListener("change", (e) => {
    var _a, _b;
    if ((_b = (_a = e == null ? void 0 : e.target) == null ? void 0 : _a.files) == null ? void 0 : _b.length) addFilesFromInput(e.target.files);
    e.target.value = "";
  });
  document.getElementById("fileList").addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.matches('button[data-action="remove"]')) {
      const responseRadio = document.querySelector(`input[name="selectedResponse"][value="${id}"]`);
      const referenceRadio = document.querySelector(`input[name="selectedReference"][value="${id}"]`);
      if (responseRadio && responseRadio.checked) responseRadio.checked = false;
      if (referenceRadio && referenceRadio.checked) referenceRadio.checked = false;
      const index = fileMap.findIndex((a) => a.id === id);
      if (index !== -1) fileMap.splice(index, 1);
      li.remove();
      fileMap.pop();
      saveWaveformsToStorage(fileMap);
      updateAnalyzeState();
    }
  });
  document.getElementById("fileList").addEventListener("change", (e) => {
    if (e.target.name === "selectedResponse") {
      updateAnalyzeState();
    }
  });
  loadWaveformsFromStorage().then((waveforms) => {
    var _a;
    console.log("Loaded waveforms from storage on startup:", waveforms);
    for (const a of waveforms) {
      console.log("Creating list item for loaded waveform:", a);
      const li = createListItem(a);
      fileMap.push(a);
      (_a = document.getElementById("fileList")) == null ? void 0 : _a.appendChild(li);
    }
  });
});
loadState();
//# sourceMappingURL=app.js.map
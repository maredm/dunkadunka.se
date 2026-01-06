"use strict";
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
        var info = gen[key](arg);
        var value = info.value;
    } catch (error) {
        reject(error);
        return;
    }
    if (info.done) {
        resolve(value);
    } else {
        Promise.resolve(value).then(_next, _throw);
    }
}
function _async_to_generator(fn) {
    return function() {
        var self = this, args = arguments;
        return new Promise(function(resolve, reject) {
            var gen = fn.apply(self, args);
            function _next(value) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
            }
            function _throw(err) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
            }
            _next(undefined);
        });
    };
}
function _class_call_check(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
    }
}
function _defineProperties(target, props) {
    for(var i = 0; i < props.length; i++){
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
    }
}
function _create_class(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    return Constructor;
}
function _ts_generator(thisArg, body) {
    var f, y, t, _ = {
        label: 0,
        sent: function() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    }, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype), d = Object.defineProperty;
    return d(g, "next", {
        value: verb(0)
    }), d(g, "throw", {
        value: verb(1)
    }), d(g, "return", {
        value: verb(2)
    }), typeof Symbol === "function" && d(g, Symbol.iterator, {
        value: function() {
            return this;
        }
    }), g;
    function verb(n) {
        return function(v) {
            return step([
                n,
                v
            ]);
        };
    }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while(g && (g = 0, op[0] && (_ = 0)), _)try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [
                op[0] & 2,
                t.value
            ];
            switch(op[0]){
                case 0:
                case 1:
                    t = op;
                    break;
                case 4:
                    _.label++;
                    return {
                        value: op[1],
                        done: false
                    };
                case 5:
                    _.label++;
                    y = op[1];
                    op = [
                        0
                    ];
                    continue;
                case 7:
                    op = _.ops.pop();
                    _.trys.pop();
                    continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
                        _ = 0;
                        continue;
                    }
                    if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
                        _.label = op[1];
                        break;
                    }
                    if (op[0] === 6 && _.label < t[1]) {
                        _.label = t[1];
                        t = op;
                        break;
                    }
                    if (t && _.label < t[2]) {
                        _.label = t[2];
                        _.ops.push(op);
                        break;
                    }
                    if (t[2]) _.ops.pop();
                    _.trys.pop();
                    continue;
            }
            op = body.call(thisArg, _);
        } catch (e) {
            op = [
                6,
                e
            ];
            y = 0;
        } finally{
            f = t = 0;
        }
        if (op[0] & 5) throw op[1];
        return {
            value: op[0] ? op[1] : void 0,
            done: true
        };
    }
}
// src/math.ts
console.debug("Math module loaded");
function logspace(start, end, num) {
    var logStart = Math.log10(start);
    var logEnd = Math.log10(end);
    var logStep = (logEnd - logStart) / (num - 1);
    return Array.from({
        length: num
    }, function(_, i) {
        return Math.pow(10, logStart + i * logStep);
    });
}
function linspace(start, end, num) {
    if (num === 1) return [
        start
    ];
    var step = (end - start) / (num - 1);
    return Array.from({
        length: num
    }, function(_, i) {
        return start + i * step;
    });
}
function closest(num, arr) {
    var curr = arr[0];
    var diff = Math.abs(num - curr);
    var index = 0;
    for(var val = 0; val < arr.length; val++){
        var newDiff = Math.abs(num - arr[val]);
        if (newDiff < diff) {
            diff = newDiff;
            curr = arr[val];
            index = val;
        }
    }
    return index;
}
var average = function(array) {
    return array.reduce(function(a, b) {
        return a + b;
    }) / array.length;
};
var abs = function(re) {
    var im = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0;
    return Math.sqrt(re * re + im * im);
};
// src/fft.ts
console.debug("FFT module loaded");
var FFT = /*#__PURE__*/ function() {
    function FFT(size) {
        _class_call_check(this, FFT);
        this.size = size | 0;
        if (this.size <= 1 || (this.size & this.size - 1) !== 0) throw new Error("FFT size must be a power of two and bigger than 1");
        this._csize = size << 1;
        var table = new Array(this.size * 2);
        for(var i = 0; i < table.length; i += 2){
            var angle = Math.PI * i / this.size;
            table[i] = Math.cos(angle);
            table[i + 1] = -Math.sin(angle);
        }
        this.table = table;
        var power = 0;
        for(var t = 1; this.size > t; t <<= 1)power++;
        this._width = power % 2 === 0 ? power - 1 : power;
        this._bitrev = new Array(1 << this._width);
        for(var j = 0; j < this._bitrev.length; j++){
            this._bitrev[j] = 0;
            for(var shift = 0; shift < this._width; shift += 2){
                var revShift = this._width - shift - 2;
                this._bitrev[j] |= (j >>> shift & 3) << revShift;
            }
        }
        this._out = null;
        this._data = null;
        this._inv = 0;
    }
    _create_class(FFT, [
        {
            key: "fromComplexArray",
            value: function fromComplexArray(complex, storage) {
                var res = storage || new Array(complex.length >>> 1);
                for(var i = 0; i < complex.length; i += 2)res[i >>> 1] = complex[i];
                return res;
            }
        },
        {
            key: "createComplexArray",
            value: function createComplexArray() {
                var res = new Array(this._csize);
                for(var i = 0; i < res.length; i++)res[i] = 0;
                return res;
            }
        },
        {
            key: "toComplexArray",
            value: function toComplexArray(input, storage) {
                var res = storage || this.createComplexArray();
                for(var i = 0; i < res.length; i += 2){
                    res[i] = input[i >>> 1];
                    res[i + 1] = 0;
                }
                return res;
            }
        },
        {
            key: "completeSpectrum",
            value: function completeSpectrum(spectrum) {
                var size = this._csize;
                var half = size >>> 1;
                for(var i = 2; i < half; i += 2){
                    spectrum[size - i] = spectrum[i];
                    spectrum[size - i + 1] = -spectrum[i + 1];
                }
            }
        },
        {
            key: "transform",
            value: function transform(out, data) {
                if (out === data) throw new Error("Input and output buffers must be different");
                this._out = out;
                this._data = data;
                this._inv = 0;
                this._transform4();
                this._out = null;
                this._data = null;
            }
        },
        {
            key: "realTransform",
            value: function realTransform(out, data) {
                if (out === data) throw new Error("Input and output buffers must be different");
                this._out = out;
                this._data = data;
                this._inv = 0;
                this._realTransform4();
                this._out = null;
                this._data = null;
            }
        },
        {
            key: "inverseTransform",
            value: function inverseTransform(out, data) {
                if (out === data) throw new Error("Input and output buffers must be different");
                this._out = out;
                this._data = data;
                this._inv = 1;
                this._transform4();
                for(var i = 0; i < out.length; i++)out[i] /= this.size;
                this._out = null;
                this._data = null;
            }
        },
        {
            // radix-4 implementation
            //
            // NOTE: Uses of `var` are intentional for older V8 version that do not
            // support both `let compound assignments` and `const phi`
            key: "_transform4",
            value: function _transform4() {
                var out = this._out;
                var size = this._csize;
                var width = this._width;
                var step = 1 << width;
                var len = size / step << 1;
                var outOff;
                var t;
                var bitrev = this._bitrev;
                if (len === 4) {
                    for(outOff = 0, t = 0; outOff < size; outOff += len, t++){
                        var off = bitrev[t];
                        this._singleTransform2(outOff, off, step);
                    }
                } else {
                    for(outOff = 0, t = 0; outOff < size; outOff += len, t++){
                        var off1 = bitrev[t];
                        this._singleTransform4(outOff, off1, step);
                    }
                }
                var inv = this._inv ? -1 : 1;
                var table = this.table;
                for(step >>= 2; step >= 2; step >>= 2){
                    len = size / step << 1;
                    var quarterLen = len >>> 2;
                    for(outOff = 0; outOff < size; outOff += len){
                        var limit = outOff + quarterLen;
                        for(var i = outOff, k = 0; i < limit; i += 2, k += step){
                            var A = i;
                            var B = A + quarterLen;
                            var C = B + quarterLen;
                            var D = C + quarterLen;
                            var Ar = out[A];
                            var Ai = out[A + 1];
                            var Br = out[B];
                            var Bi = out[B + 1];
                            var Cr = out[C];
                            var Ci = out[C + 1];
                            var Dr = out[D];
                            var Di = out[D + 1];
                            var MAr = Ar;
                            var MAi = Ai;
                            var tableBr = table[k];
                            var tableBi = inv * table[k + 1];
                            var MBr = Br * tableBr - Bi * tableBi;
                            var MBi = Br * tableBi + Bi * tableBr;
                            var tableCr = table[2 * k];
                            var tableCi = inv * table[2 * k + 1];
                            var MCr = Cr * tableCr - Ci * tableCi;
                            var MCi = Cr * tableCi + Ci * tableCr;
                            var tableDr = table[3 * k];
                            var tableDi = inv * table[3 * k + 1];
                            var MDr = Dr * tableDr - Di * tableDi;
                            var MDi = Dr * tableDi + Di * tableDr;
                            var T0r = MAr + MCr;
                            var T0i = MAi + MCi;
                            var T1r = MAr - MCr;
                            var T1i = MAi - MCi;
                            var T2r = MBr + MDr;
                            var T2i = MBi + MDi;
                            var T3r = inv * (MBr - MDr);
                            var T3i = inv * (MBi - MDi);
                            var FAr = T0r + T2r;
                            var FAi = T0i + T2i;
                            var FCr = T0r - T2r;
                            var FCi = T0i - T2i;
                            var FBr = T1r + T3i;
                            var FBi = T1i - T3r;
                            var FDr = T1r - T3i;
                            var FDi = T1i + T3r;
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
        },
        {
            // radix-2 implementation
            //
            // NOTE: Only called for len=4
            key: "_singleTransform2",
            value: function _singleTransform2(outOff, off, step) {
                var out = this._out;
                var data = this._data;
                var evenR = data[off];
                var evenI = data[off + 1];
                var oddR = data[off + step];
                var oddI = data[off + step + 1];
                var leftR = evenR + oddR;
                var leftI = evenI + oddI;
                var rightR = evenR - oddR;
                var rightI = evenI - oddI;
                out[outOff] = leftR;
                out[outOff + 1] = leftI;
                out[outOff + 2] = rightR;
                out[outOff + 3] = rightI;
            }
        },
        {
            // radix-4
            //
            // NOTE: Only called for len=8
            key: "_singleTransform4",
            value: function _singleTransform4(outOff, off, step) {
                var out = this._out;
                var data = this._data;
                var inv = this._inv ? -1 : 1;
                var step2 = step * 2;
                var step3 = step * 3;
                var Ar = data[off];
                var Ai = data[off + 1];
                var Br = data[off + step];
                var Bi = data[off + step + 1];
                var Cr = data[off + step2];
                var Ci = data[off + step2 + 1];
                var Dr = data[off + step3];
                var Di = data[off + step3 + 1];
                var T0r = Ar + Cr;
                var T0i = Ai + Ci;
                var T1r = Ar - Cr;
                var T1i = Ai - Ci;
                var T2r = Br + Dr;
                var T2i = Bi + Di;
                var T3r = inv * (Br - Dr);
                var T3i = inv * (Bi - Di);
                var FAr = T0r + T2r;
                var FAi = T0i + T2i;
                var FBr = T1r + T3i;
                var FBi = T1i - T3r;
                var FCr = T0r - T2r;
                var FCi = T0i - T2i;
                var FDr = T1r - T3i;
                var FDi = T1i + T3r;
                out[outOff] = FAr;
                out[outOff + 1] = FAi;
                out[outOff + 2] = FBr;
                out[outOff + 3] = FBi;
                out[outOff + 4] = FCr;
                out[outOff + 5] = FCi;
                out[outOff + 6] = FDr;
                out[outOff + 7] = FDi;
            }
        },
        {
            // Real input radix-4 implementation
            key: "_realTransform4",
            value: function _realTransform4() {
                var out = this._out;
                var size = this._csize;
                var width = this._width;
                var step = 1 << width;
                var len = size / step << 1;
                var outOff;
                var t;
                var bitrev = this._bitrev;
                if (len === 4) {
                    for(outOff = 0, t = 0; outOff < size; outOff += len, t++){
                        var off = bitrev[t];
                        this._singleRealTransform2(outOff, off >>> 1, step >>> 1);
                    }
                } else {
                    for(outOff = 0, t = 0; outOff < size; outOff += len, t++){
                        var off1 = bitrev[t];
                        this._singleRealTransform4(outOff, off1 >>> 1, step >>> 1);
                    }
                }
                var inv = this._inv ? -1 : 1;
                var table = this.table;
                for(step >>= 2; step >= 2; step >>= 2){
                    len = size / step << 1;
                    var halfLen = len >>> 1;
                    var quarterLen = halfLen >>> 1;
                    var hquarterLen = quarterLen >>> 1;
                    for(outOff = 0; outOff < size; outOff += len){
                        for(var i = 0, k = 0; i <= hquarterLen; i += 2, k += step){
                            var A = outOff + i;
                            var B = A + quarterLen;
                            var C = B + quarterLen;
                            var D = C + quarterLen;
                            var Ar = out[A];
                            var Ai = out[A + 1];
                            var Br = out[B];
                            var Bi = out[B + 1];
                            var Cr = out[C];
                            var Ci = out[C + 1];
                            var Dr = out[D];
                            var Di = out[D + 1];
                            var MAr = Ar;
                            var MAi = Ai;
                            var tableBr = table[k];
                            var tableBi = inv * table[k + 1];
                            var MBr = Br * tableBr - Bi * tableBi;
                            var MBi = Br * tableBi + Bi * tableBr;
                            var tableCr = table[2 * k];
                            var tableCi = inv * table[2 * k + 1];
                            var MCr = Cr * tableCr - Ci * tableCi;
                            var MCi = Cr * tableCi + Ci * tableCr;
                            var tableDr = table[3 * k];
                            var tableDi = inv * table[3 * k + 1];
                            var MDr = Dr * tableDr - Di * tableDi;
                            var MDi = Dr * tableDi + Di * tableDr;
                            var T0r = MAr + MCr;
                            var T0i = MAi + MCi;
                            var T1r = MAr - MCr;
                            var T1i = MAi - MCi;
                            var T2r = MBr + MDr;
                            var T2i = MBi + MDi;
                            var T3r = inv * (MBr - MDr);
                            var T3i = inv * (MBi - MDi);
                            var FAr = T0r + T2r;
                            var FAi = T0i + T2i;
                            var FBr = T1r + T3i;
                            var FBi = T1i - T3r;
                            out[A] = FAr;
                            out[A + 1] = FAi;
                            out[B] = FBr;
                            out[B + 1] = FBi;
                            if (i === 0) {
                                var FCr = T0r - T2r;
                                var FCi = T0i - T2i;
                                out[C] = FCr;
                                out[C + 1] = FCi;
                                continue;
                            }
                            if (i === hquarterLen) continue;
                            var ST0r = T1r;
                            var ST0i = -T1i;
                            var ST1r = T0r;
                            var ST1i = -T0i;
                            var ST2r = -inv * T3i;
                            var ST2i = -inv * T3r;
                            var ST3r = -inv * T2i;
                            var ST3i = -inv * T2r;
                            var SFAr = ST0r + ST2r;
                            var SFAi = ST0i + ST2i;
                            var SFBr = ST1r + ST3i;
                            var SFBi = ST1i - ST3r;
                            var SA = outOff + quarterLen - i;
                            var SB = outOff + halfLen - i;
                            out[SA] = SFAr;
                            out[SA + 1] = SFAi;
                            out[SB] = SFBr;
                            out[SB + 1] = SFBi;
                        }
                    }
                }
            }
        },
        {
            // radix-2 implementation
            //
            // NOTE: Only called for len=4
            key: "_singleRealTransform2",
            value: function _singleRealTransform2(outOff, off, step) {
                var out = this._out;
                var data = this._data;
                var evenR = data[off];
                var oddR = data[off + step];
                var leftR = evenR + oddR;
                var rightR = evenR - oddR;
                out[outOff] = leftR;
                out[outOff + 1] = 0;
                out[outOff + 2] = rightR;
                out[outOff + 3] = 0;
            }
        },
        {
            // radix-4
            //
            // NOTE: Only called for len=8
            key: "_singleRealTransform4",
            value: function _singleRealTransform4(outOff, off, step) {
                var out = this._out;
                var data = this._data;
                var inv = this._inv ? -1 : 1;
                var step2 = step * 2;
                var step3 = step * 3;
                var Ar = data[off];
                var Br = data[off + step];
                var Cr = data[off + step2];
                var Dr = data[off + step3];
                var T0r = Ar + Cr;
                var T1r = Ar - Cr;
                var T2r = Br + Dr;
                var T3r = inv * (Br - Dr);
                var FAr = T0r + T2r;
                var FBr = T1r;
                var FBi = -T3r;
                var FCr = T0r - T2r;
                var FDr = T1r;
                var FDi = T3r;
                out[outOff] = FAr;
                out[outOff + 1] = 0;
                out[outOff + 2] = FBr;
                out[outOff + 3] = FBi;
                out[outOff + 4] = FCr;
                out[outOff + 5] = 0;
                out[outOff + 6] = FDr;
                out[outOff + 7] = FDi;
            }
        }
    ]);
    return FFT;
}();
// src/fractional_octave_smoothing.ts
console.debug("Fractional Octave Smoothing module loaded");
function getFractionalOctaveFrequencies(fraction) {
    var f_low = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 20, f_high = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : 24e3, fftSize = arguments.length > 3 ? arguments[3] : void 0;
    if (fraction <= 0) {
        throw new Error("Fraction must be greater than 0");
    }
    if (f_low <= 0 || f_high <= 0) {
        throw new Error("Frequencies must be greater than 0");
    }
    if (f_low >= f_high) {
        throw new Error("f_low must be less than f_high");
    }
    var num_points = Math.round((Math.log10(f_high) - Math.log10(f_low)) / fraction) + 1;
    var frequencies = logspace(f_low, f_high, num_points);
    var frequency_resolution = 48e3 / fftSize;
    for(var i = 0; i < frequencies.length; i++){
        frequencies[i] = Math.round(frequencies[i] / frequency_resolution) * frequency_resolution;
    }
    frequencies = Array.from(new Set(frequencies));
    return frequencies;
}
function fractionalOctaveSmoothing(frequencyData, fraction, frequencies) {
    var frequenciesAll = linspace(0, 48e3 / 2, frequencyData.length);
    var frequency_resolution = 48e3 / frequencyData.length;
    var smoothedData = new Float32Array(frequencies.length);
    var n = frequencyData.length;
    var factor = Math.pow(2, 0.5 * fraction) - Math.pow(0.5, 0.5 * fraction);
    for(var p = 0; p < frequencies.length; p++){
        var i = closest(frequencies[p], frequenciesAll);
        var sum = 0;
        var width = Math.round(0.5 * factor * (n * 0.5 - Math.abs(n * 0.5 - i)));
        if (width === 0) {
            sum = frequencyData[i];
        } else {
            var as = frequencyData.slice(Math.round(i - width + 1), Math.min(Math.round(i + width), n - 1));
            sum = average(as);
        }
        smoothedData[p] = sum;
    }
    return smoothedData;
}
// src/wave.ts
function download(samples) {
    var sampleRate = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 48e3, name = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : "output";
    var channels = 1;
    var bytesPerSample = 2;
    var blockAlign = channels * bytesPerSample;
    var byteRate = sampleRate * blockAlign;
    var dataSize = samples.length * bytesPerSample;
    var buffer = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buffer);
    function writeString(offset2, str) {
        for(var i = 0; i < str.length; i++)view.setUint8(offset2 + i, str.charCodeAt(i));
    }
    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);
    var offset = 44;
    for(var i = 0; i < samples.length; i++, offset += 2){
        var s = Math.max(-1, Math.min(1, Number(samples[i])));
        view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
    }
    var blob = new Blob([
        buffer
    ], {
        type: "audio/wav"
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name + ".wav";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
// src/audio.ts
console.debug("Audio module loaded");
window.FFT = FFT;
function db(value) {
    if (Array.isArray(value)) {
        return value.map(function(v) {
            return 20 * Math.log10(v + 1e-12);
        });
    } else {
        return 20 * Math.log10(value + 1e-12);
    }
}
function smoothFFT(fftData, fraction, resolution) {
    var frequency = fftData.frequency, magnitude = fftData.magnitude, phase = fftData.phase, fftSize = fftData.fftSize;
    var smoothedMagnitude = new Float32Array(magnitude.length);
    var fractionalFrequencies = getFractionalOctaveFrequencies(resolution, 20, 24e3, fftSize);
    var smoothed = fractionalOctaveSmoothing(magnitude, fraction, fractionalFrequencies);
    return {
        frequency: fractionalFrequencies,
        magnitude: Array.from(smoothed),
        phase: phase,
        // phase remains unchanged
        fftSize: fftSize
    };
}
function computeFFT(data) {
    var fftSize = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : null;
    fftSize !== null && fftSize !== void 0 ? fftSize : fftSize = Math.pow(2, Math.ceil(Math.log2(data.length)));
    console.log("Computing FFT with ".concat(fftSize, " bins for data length ").concat(data.length));
    var fft = new FFT(fftSize);
    var out = fft.createComplexArray();
    var frame = new Float32Array(fftSize);
    for(var i = 0; i < fftSize; i++){
        frame[i] = (data[i] || 0) * 1;
    }
    fft.realTransform(out, frame);
    var frequency = [];
    var magnitude = [];
    var phase = [];
    for(var i1 = 0; i1 < fftSize / 2; i1++){
        var re = out[2 * i1];
        var im = out[2 * i1 + 1];
        magnitude[i1] = abs(re, im) * Math.SQRT2;
        phase[i1] = Math.atan2(im, re);
    }
    var frequencyResolution = 48e3 / fftSize;
    for(var i2 = 0; i2 < fftSize / 2; i2++){
        frequency[i2] = i2 * frequencyResolution;
    }
    return {
        frequency: frequency,
        magnitude: magnitude,
        phase: phase,
        fftSize: fftSize
    };
}
function fftCorrelation(x, y) {
    var lenX = x.length;
    var lenY = y.length;
    var fullLen = lenX + lenY - 1;
    var nextPow2 = function(v) {
        var p = 1;
        while(p < v)p <<= 1;
        return p;
    };
    var n = nextPow2(fullLen);
    var xP = new Float32Array(n);
    var yP = new Float32Array(n);
    xP.set(x, 0);
    yP.set(y, 0);
    var fft = new FFT(n);
    var A = fft.createComplexArray();
    var B = fft.createComplexArray();
    fft.realTransform(A, xP);
    fft.realTransform(B, yP);
    if (typeof fft.completeSpectrum === "function") {
        fft.completeSpectrum(A);
        fft.completeSpectrum(B);
    }
    var C = fft.createComplexArray();
    for(var k = 0; k < n; k++){
        var ar = A[2 * k], ai = A[2 * k + 1];
        var br = B[2 * k], bi = B[2 * k + 1];
        C[2 * k] = ar * br + ai * bi;
        C[2 * k + 1] = ai * br - ar * bi;
    }
    var out = fft.createComplexArray();
    fft.inverseTransform(out, C);
    var corr = new Float64Array(fullLen);
    for(var i = 0; i < fullLen; i++){
        corr[i] = out[2 * i] / n;
    }
    var sumX2 = 0, sumY2 = 0;
    for(var i1 = 0; i1 < lenX; i1++)sumX2 += x[i1] * x[i1];
    for(var i2 = 0; i2 < lenY; i2++)sumY2 += y[i2] * y[i2];
    var denom = Math.sqrt(sumX2 * sumY2);
    var normalized = new Float64Array(fullLen);
    if (denom > 0) {
        for(var i3 = 0; i3 < fullLen; i3++)normalized[i3] = corr[i3] / denom;
    } else {
        for(var i4 = 0; i4 < fullLen; i4++)normalized[i4] = 0;
    }
    var lags = new Int32Array(fullLen);
    for(var i5 = 0; i5 < fullLen; i5++)lags[i5] = i5 - (lenY - 1);
    var peakIdx = 0;
    var peakVal = -Infinity;
    for(var i6 = 0; i6 < fullLen; i6++){
        if (normalized[i6] > peakVal) {
            peakVal = normalized[i6];
            peakIdx = i6;
        }
    }
    var estimatedLag = lags[peakIdx];
    return {
        corr: normalized,
        lags: lags,
        estimatedLagSamples: estimatedLag,
        estimatedLagIndex: peakIdx,
        peakCorrelation: peakVal,
        raw: corr,
        nfft: n
    };
}
function twoChannelFFT(dataArray, reference, fftSize, windowType) {
    var referencePadded = new Float32Array(fftSize);
    var lag = fftCorrelation(dataArray, reference);
    console.log("Estimated lag (samples):", lag.estimatedLagSamples, "Peak correlation:", lag.peakCorrelation);
    console.log("Lag index:", lag.estimatedLagIndex);
    console.log("Lags array:", referencePadded.length, lag.lags);
    var offset = reference.length + lag.estimatedLagSamples - 1;
    console.log("Applying offset of", offset, "samples for alignment");
    referencePadded.set(reference.slice(0, Math.min(reference.length, fftSize) - offset), offset);
    download(referencePadded, 48e3, "reference_aligned.wav");
    var reference_ = computeFFT(referencePadded);
    var signal_ = computeFFT(dataArray);
    var signalMags = signal_.magnitude.map(function(v) {
        return 20 * Math.log10(v === 0 ? 1e-20 : v);
    });
    var referenceMags = reference_.magnitude.map(function(v) {
        return 20 * Math.log10(v === 0 ? 1e-20 : v);
    });
    var h = referenceMags.map(function(v, i) {
        return signalMags[i] - v;
    });
    var frequency = linspace(0, 48e3 / 2, h.length);
    var i_50 = closest(50, frequency);
    var phase_signal = signal_.phase;
    var phase_reference = reference_.phase;
    var sphase = unwrapPhase(phase_signal.map(function(v, i) {
        return v - phase_reference[i];
    }));
    var correction = Math.floor(sphase[i_50] / (2 * Math.PI) + 0.5) * (2 * Math.PI);
    var phase = sphase.map(function(v) {
        return v - correction;
    });
    function unwrapPhase(phases) {
        var N = phases.length;
        var out = Array.from(new Float32Array(N));
        if (N === 0) return out;
        out[0] = phases[0];
        var offset2 = 0;
        for(var i = 1; i < N; i++){
            var delta = phases[i] - phases[i - 1];
            if (delta > Math.PI) {
                offset2 -= 2 * Math.PI;
            } else if (delta < -Math.PI) {
                offset2 += 2 * Math.PI;
            }
            out[i] = phases[i] + offset2;
        }
        return out;
    }
    return {
        frequency: frequency,
        magnitude: h,
        phase: phase,
        fftSize: fftSize
    };
}
// src/app.ts
console.debug("App module loaded");
var root = document.documentElement;
var uiColor = "#0366d6";
root.style.setProperty("--color", uiColor);
var tabCounter = 0;
var tabsContainer = document.getElementById("tabs");
var tabContents = document.getElementById("tab-contents");
var responseFileInput = document.getElementById("responseFile");
var referenceFileInput = document.getElementById("referenceFile");
var analyzeBtn = document.getElementById("analyzeBtn");
responseFileInput.addEventListener("change", function() {
    var _responseFileInput_files;
    analyzeBtn.disabled = !((_responseFileInput_files = responseFileInput.files) === null || _responseFileInput_files === void 0 ? void 0 : _responseFileInput_files.length);
});
tabsContainer.addEventListener("click", function(e) {
    var target = e.target;
    if (target.classList.contains("tab-close")) {
        var tab = target.parentElement;
        var tabId = tab.dataset.tab;
        if (tabId !== "upload") {
            var _document_querySelector;
            tab.remove();
            (_document_querySelector = document.querySelector('[data-content="'.concat(tabId, '"]'))) === null || _document_querySelector === void 0 ? void 0 : _document_querySelector.remove();
            if (tab.classList.contains("active")) {
                switchTab("upload");
            }
        }
        e.stopPropagation();
    } else if (target.classList.contains("tab")) {
        var tabId1 = target.dataset.tab;
        if (tabId1) {
            switchTab(tabId1);
        }
    }
});
function switchTab(tabId) {
    var _document_querySelector, _document_querySelector1;
    document.querySelectorAll(".tab").forEach(function(t) {
        return t.classList.remove("active");
    });
    document.querySelectorAll(".tab-content").forEach(function(c) {
        return c.classList.remove("active");
    });
    (_document_querySelector = document.querySelector('[data-tab="'.concat(tabId, '"]'))) === null || _document_querySelector === void 0 ? void 0 : _document_querySelector.classList.add("active");
    (_document_querySelector1 = document.querySelector('[data-content="'.concat(tabId, '"]'))) === null || _document_querySelector1 === void 0 ? void 0 : _document_querySelector1.classList.add("active");
}
analyzeBtn.addEventListener("click", function() {
    return _async_to_generator(function() {
        var _responseFileInput_files, _referenceFileInput_files, responseFile, referenceFile, responseData, referenceData, _tmp, error;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    responseFile = (_responseFileInput_files = responseFileInput.files) === null || _responseFileInput_files === void 0 ? void 0 : _responseFileInput_files[0];
                    referenceFile = (_referenceFileInput_files = referenceFileInput.files) === null || _referenceFileInput_files === void 0 ? void 0 : _referenceFileInput_files[0];
                    if (!responseFile) return [
                        2
                    ];
                    analyzeBtn.disabled = true;
                    analyzeBtn.textContent = "Analyzing...";
                    _state.label = 1;
                case 1:
                    _state.trys.push([
                        1,
                        6,
                        7,
                        8
                    ]);
                    return [
                        4,
                        loadAudioFile(responseFile)
                    ];
                case 2:
                    responseData = _state.sent();
                    if (!referenceFile) return [
                        3,
                        4
                    ];
                    return [
                        4,
                        loadAudioFile(referenceFile)
                    ];
                case 3:
                    _tmp = _state.sent();
                    return [
                        3,
                        5
                    ];
                case 4:
                    _tmp = null;
                    _state.label = 5;
                case 5:
                    referenceData = _tmp;
                    createAnalysisTab(responseData, referenceData, responseFile.name, (referenceFile === null || referenceFile === void 0 ? void 0 : referenceFile.name) || null);
                    return [
                        3,
                        8
                    ];
                case 6:
                    error = _state.sent();
                    alert("Error analyzing files: " + error.message);
                    return [
                        3,
                        8
                    ];
                case 7:
                    analyzeBtn.disabled = false;
                    analyzeBtn.textContent = "Analyze Frequency Response";
                    return [
                        7
                    ];
                case 8:
                    return [
                        2
                    ];
            }
        });
    })();
});
function loadAudioFile(file) {
    return _async_to_generator(function() {
        var headerBuffer, ext, mime, metadata, wavInfo, mp3Info, arrayBuffer, audioContext, audioBuffer;
        function getExt(name) {
            return (name.split(".").pop() || "").toLowerCase();
        }
        function parseWav(buf) {
            var dv = new DataView(buf);
            function readStr(off, len) {
                var s = "";
                for(var i = 0; i < len; i++)s += String.fromCharCode(dv.getUint8(off + i));
                return s;
            }
            if (readStr(0, 4) !== "RIFF" || readStr(8, 4) !== "WAVE") return null;
            var offset = 12;
            var info = {};
            while(offset + 8 <= dv.byteLength){
                var id = readStr(offset, 4);
                var size = dv.getUint32(offset + 4, true);
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
            return info;
        }
        function parseMp3(buf) {
            var _sampleRates_versionKey;
            var bytes = new Uint8Array(buf);
            var offset = 0;
            if (bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) {
                var size = (bytes[6] & 127) << 21 | (bytes[7] & 127) << 14 | (bytes[8] & 127) << 7 | bytes[9] & 127;
                offset = 10 + size;
            }
            var headerIndex = -1;
            for(var i = offset; i < bytes.length - 4; i++){
                if (bytes[i] === 255 && (bytes[i + 1] & 224) === 224) {
                    headerIndex = i;
                    break;
                }
            }
            if (headerIndex < 0) return null;
            var b1 = bytes[headerIndex + 1];
            var b2 = bytes[headerIndex + 2];
            var b3 = bytes[headerIndex + 3];
            var versionBits = b1 >> 3 & 3;
            var layerBits = b1 >> 1 & 3;
            var bitrateBits = b2 >> 4 & 15;
            var sampleRateBits = b2 >> 2 & 3;
            var channelMode = b3 >> 6 & 3;
            var versions = {
                0: "MPEG Version 2.5",
                1: "reserved",
                2: "MPEG Version 2 (ISO/IEC 13818-3)",
                3: "MPEG Version 1 (ISO/IEC 11172-3)"
            };
            var layers = {
                0: "reserved",
                1: "Layer III",
                2: "Layer II",
                3: "Layer I"
            };
            var sampleRates = {
                3: [
                    44100,
                    48e3,
                    32e3
                ],
                2: [
                    22050,
                    24e3,
                    16e3
                ],
                0: [
                    11025,
                    12e3,
                    8e3
                ]
            };
            var versionKey = versionBits;
            var layerKey = layerBits;
            var bitrateTable = {
                // MPEG1 Layer III
                "3_1": [
                    0,
                    32,
                    40,
                    48,
                    56,
                    64,
                    80,
                    96,
                    112,
                    128,
                    160,
                    192,
                    224,
                    256,
                    320,
                    0
                ],
                // MPEG2/2.5 Layer III
                "0_1": [
                    0,
                    8,
                    16,
                    24,
                    32,
                    40,
                    48,
                    56,
                    64,
                    80,
                    96,
                    112,
                    128,
                    144,
                    160,
                    0
                ],
                "2_1": [
                    0,
                    8,
                    16,
                    24,
                    32,
                    40,
                    48,
                    56,
                    64,
                    80,
                    96,
                    112,
                    128,
                    144,
                    160,
                    0
                ],
                // fallback generic table for other layers/versions (best-effort)
                "3_2": [
                    0,
                    32,
                    48,
                    56,
                    64,
                    80,
                    96,
                    112,
                    128,
                    160,
                    192,
                    224,
                    256,
                    320,
                    384,
                    0
                ],
                "3_3": [
                    0,
                    32,
                    64,
                    96,
                    128,
                    160,
                    192,
                    224,
                    256,
                    320,
                    384,
                    448,
                    512,
                    576,
                    640,
                    0
                ]
            };
            var versionStr = versions[versionKey] || "unknown";
            var layerStr = layers[layerKey] || "unknown";
            var sampleRate = ((_sampleRates_versionKey = sampleRates[versionKey]) === null || _sampleRates_versionKey === void 0 ? void 0 : _sampleRates_versionKey[sampleRateBits]) || null;
            var bitrateKbps = 0;
            var tbKey = "".concat(versionKey, "_").concat(layerKey);
            if (bitrateTable[tbKey]) {
                bitrateKbps = bitrateTable[tbKey][bitrateBits] || 0;
            } else if (bitrateTable["3_1"] && versionKey === 3 && layerKey === 1) {
                bitrateKbps = bitrateTable["3_1"][bitrateBits] || 0;
            }
            var channels = channelMode === 3 ? 1 : 2;
            var duration = null;
            if (bitrateKbps > 0) {
                duration = bytes.length * 8 / (bitrateKbps * 1e3);
            }
            return {
                version: versionStr,
                layer: layerStr,
                bitrateKbps: bitrateKbps || null,
                sampleRate: sampleRate,
                channels: channels,
                duration: duration
            };
        }
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        file.slice(0, 256 * 1024).arrayBuffer()
                    ];
                case 1:
                    headerBuffer = _state.sent();
                    ext = getExt(file.name);
                    mime = file.type || "unknown";
                    metadata = {};
                    wavInfo = parseWav(headerBuffer);
                    if (wavInfo) {
                        metadata.format = "wav";
                        metadata = Object.assign(metadata, wavInfo || {});
                    } else if (mime === "audio/mpeg" || ext === "mp3") {
                        mp3Info = parseMp3(headerBuffer);
                        metadata.format = "mp3";
                        metadata = Object.assign(metadata, mp3Info || {});
                    } else {
                        metadata.format = mime || ext || "unknown";
                    }
                    console.log("Extracted file metadata:", metadata);
                    return [
                        4,
                        file.arrayBuffer()
                    ];
                case 2:
                    arrayBuffer = _state.sent();
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    return [
                        4,
                        audioContext.decodeAudioData(arrayBuffer)
                    ];
                case 3:
                    audioBuffer = _state.sent();
                    console.log("Metadata:", metadata);
                    return [
                        2,
                        {
                            sampleRate: audioBuffer.sampleRate,
                            data: Array.from(audioBuffer.getChannelData(0)),
                            duration: audioBuffer.duration,
                            metadata: metadata
                        }
                    ];
            }
        });
    })();
}
function createAnalysisTab(responseData, referenceData, filename, referenceFilename) {
    tabCounter++;
    var tabId = "analysis-".concat(tabCounter);
    var shortName = filename.length > 20 ? filename.substring(0, 17) + "..." : filename;
    if (referenceFilename != null) {
        var shortReferenceName = (referenceFilename === null || referenceFilename === void 0 ? void 0 : referenceFilename.length) > 20 ? referenceFilename.substring(0, 17) + "..." : referenceFilename;
        shortName += " / " + shortReferenceName;
    }
    var tab = document.createElement("button");
    tab.className = "tab tab-closable";
    tab.dataset.tab = tabId;
    tab.innerHTML = '<span class="tab-icon-analysis"></span>'.concat(shortName, ' <span class="tab-close">\xd7</span>');
    tabsContainer.appendChild(tab);
    var content = document.createElement("div");
    content.className = "tab-content";
    content.dataset.content = tabId;
    content.innerHTML = "\n        <h2>".concat(filename, '</h2>\n        <div class="loose-container">\n            <div id="plot-').concat(tabId, '"></div>\n            <div id="plot-').concat(tabId, '1"></div>\n        </div>\n    ');
    tabContents.appendChild(content);
    switchTab(tabId);
    console.log("Analyzing response file:", filename);
    console.log(responseData, "response samples");
    var data = new Float32Array(responseData.data);
    console.log("Response data loaded", data, "samples");
    var responseFFT = computeFFT(data);
    console.log("Response FFT computed", responseFFT);
    var traces = [
        {
            x: responseFFT.frequency,
            y: db(responseFFT.magnitude),
            type: "scatter",
            mode: "lines",
            name: "Response",
            line: {
                color: "#0366d6",
                width: 2
            }
        }
    ];
    var trace1s = [];
    if (referenceData) {
        var referenceFFT = twoChannelFFT(responseData.data, referenceData.data, responseFFT.fftSize, null);
        var smoothedFreqResponse = smoothFFT(referenceFFT, 1 / 6, 1 / 48);
        traces.push({
            x: referenceFFT.frequency,
            y: referenceFFT.magnitude,
            type: "scatter",
            mode: "lines",
            name: "Frequency Response (Raw)",
            line: {
                color: "#d73a4933",
                width: 1
            }
        });
        traces.push({
            x: smoothedFreqResponse.frequency,
            y: smoothedFreqResponse.magnitude,
            type: "scatter",
            mode: "lines",
            name: "Frequency Response (Smoothed)",
            line: {
                color: "#d73a49",
                width: 2
            }
        });
        trace1s.push({
            x: referenceFFT.frequency,
            y: referenceFFT.phase,
            type: "scatter",
            mode: "lines",
            name: "Reference Phase",
            line: {
                color: "#d73a49",
                width: 2
            }
        });
    }
    var layout = {
        title: "Frequency Analysis",
        plotGlPixelRatio: 2,
        // For better clarity on high-DPI screens
        xaxis: {
            title: "Frequency (Hz)",
            type: "log",
            gridcolor: "#e1e4e8",
            range: [
                Math.log10(20),
                Math.log10(24e3)
            ]
        },
        yaxis: {
            title: "Magnitude (dB)",
            gridcolor: "#e1e4e8"
        },
        legend: {
            x: 0.02,
            y: 0.98
        },
        plot_bgcolor: "#fafbfc",
        paper_bgcolor: "#fff",
        font: {
            family: "'Newsreader', Georgia, 'Times New Roman', Times, serif"
        }
    };
    window.Plotly.newPlot("plot-".concat(tabId), traces, layout, {
        responsive: true
    });
    var layouta = {
        title: "Phase Analysis",
        xaxis: {
            title: "Frequency (Hz)",
            type: "log",
            gridcolor: "#e1e4e8",
            range: [
                Math.log10(20),
                Math.log10(24e3)
            ]
        },
        yaxis: {
            title: "Phase (degrees)",
            gridcolor: "#e1e4e8"
        },
        legend: {
            x: 0.02,
            y: 0.98
        },
        plot_bgcolor: "#fafbfc",
        paper_bgcolor: "#fff",
        staticPlot: false,
        // Enable interactivity
        plotGlPixelRatio: 2,
        // For better clarity on high-DPI screens
        dragmode: "pan",
        showAxisDragHandles: true,
        showAxisRangeEntryBoxes: true,
        axisDragOnHover: true,
        font: {
            family: "'Newsreader', Georgia, 'Times New Roman', Times, serif"
        }
    };
    window.Plotly.newPlot("plot-".concat(tabId, "1"), trace1s, layouta, {
        responsive: true
    });
    saveState();
    setItem("analysis-".concat(tabId), JSON.stringify({
        filename: filename,
        referenceFilename: referenceFilename,
        responseData: responseData,
        referenceData: referenceData
    })).catch(function(err) {
        return console.error("Failed to persist analysis:", err);
    });
}
function openIDB() {
    return new Promise(function(resolve, reject) {
        var req = indexedDB.open("dunkadunka-storage", 1);
        req.onupgradeneeded = function() {
            var db2 = req.result;
            if (!db2.objectStoreNames.contains("kv")) {
                db2.createObjectStore("kv", {
                    keyPath: "key"
                });
            }
        };
        req.onsuccess = function() {
            return resolve(req.result);
        };
        req.onerror = function() {
            return reject(req.error);
        };
    });
}
function setItem(key, value) {
    return _async_to_generator(function() {
        var db2, tx, store, e;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    _state.trys.push([
                        0,
                        3,
                        ,
                        4
                    ]);
                    return [
                        4,
                        openIDB()
                    ];
                case 1:
                    db2 = _state.sent();
                    tx = db2.transaction("kv", "readwrite");
                    store = tx.objectStore("kv");
                    store.put({
                        key: key,
                        value: value
                    });
                    return [
                        4,
                        new Promise(function(resolve, reject) {
                            tx.oncomplete = function() {
                                return resolve();
                            };
                            tx.onerror = function() {
                                return reject(tx.error);
                            };
                            tx.onabort = function() {
                                return reject(tx.error);
                            };
                        })
                    ];
                case 2:
                    _state.sent();
                    try {
                        setItem(key, value);
                    } catch (unused) {}
                    return [
                        3,
                        4
                    ];
                case 3:
                    e = _state.sent();
                    console.error("setItem(idb) failed", e);
                    return [
                        3,
                        4
                    ];
                case 4:
                    return [
                        2
                    ];
            }
        });
    })();
}
function getItem(key) {
    return _async_to_generator(function() {
        var _ref, db2, tx, store, req, res, e;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    _state.trys.push([
                        0,
                        3,
                        ,
                        4
                    ]);
                    return [
                        4,
                        openIDB()
                    ];
                case 1:
                    db2 = _state.sent();
                    tx = db2.transaction("kv", "readonly");
                    store = tx.objectStore("kv");
                    req = store.get(key);
                    return [
                        4,
                        new Promise(function(resolve, reject) {
                            req.onsuccess = function() {
                                return resolve(req.result);
                            };
                            req.onerror = function() {
                                return reject(req.error);
                            };
                        })
                    ];
                case 2:
                    res = _state.sent();
                    return [
                        2,
                        (_ref = res === null || res === void 0 ? void 0 : res.value) !== null && _ref !== void 0 ? _ref : null
                    ];
                case 3:
                    e = _state.sent();
                    console.error("getItem(idb) failed", e);
                    return [
                        2,
                        null
                    ];
                case 4:
                    return [
                        2
                    ];
            }
        });
    })();
}
function saveState() {
    var tabs = Array.from(document.querySelectorAll(".tab[data-tab]")).map(function(tab) {
        var _tab_textContent;
        return {
            id: tab.dataset.tab,
            name: (_tab_textContent = tab.textContent) === null || _tab_textContent === void 0 ? void 0 : _tab_textContent.replace("\xD7", "").trim()
        };
    });
    setItem("tabs", JSON.stringify(tabs));
}
function loadState() {
    return _async_to_generator(function() {
        var savedTabs, tabs, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, tab, raw, analysisData, err, e;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    _state.trys.push([
                        0,
                        10,
                        ,
                        11
                    ]);
                    return [
                        4,
                        getItem("tabs")
                    ];
                case 1:
                    savedTabs = _state.sent();
                    if (!savedTabs) return [
                        2
                    ];
                    tabs = JSON.parse(savedTabs);
                    console.log("Loaded saved tabs:", tabs);
                    _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        7,
                        8,
                        9
                    ]);
                    _iterator = tabs[Symbol.iterator]();
                    _state.label = 3;
                case 3:
                    if (!!(_iteratorNormalCompletion = (_step = _iterator.next()).done)) return [
                        3,
                        6
                    ];
                    tab = _step.value;
                    return [
                        4,
                        getItem("analysis-".concat(tab.id))
                    ];
                case 4:
                    raw = _state.sent();
                    analysisData = raw ? JSON.parse(raw) : null;
                    if (analysisData) {
                        console.log("Restoring analysis tab:", analysisData);
                        createAnalysisTab(analysisData.responseData, analysisData.referenceData, analysisData.filename, analysisData.referenceFilename);
                    }
                    _state.label = 5;
                case 5:
                    _iteratorNormalCompletion = true;
                    return [
                        3,
                        3
                    ];
                case 6:
                    return [
                        3,
                        9
                    ];
                case 7:
                    err = _state.sent();
                    _didIteratorError = true;
                    _iteratorError = err;
                    return [
                        3,
                        9
                    ];
                case 8:
                    try {
                        if (!_iteratorNormalCompletion && _iterator.return != null) {
                            _iterator.return();
                        }
                    } finally{
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                    return [
                        7
                    ];
                case 9:
                    return [
                        3,
                        11
                    ];
                case 10:
                    e = _state.sent();
                    console.error("Failed to load saved state:", e);
                    return [
                        3,
                        11
                    ];
                case 11:
                    return [
                        2
                    ];
            }
        });
    })();
}
loadState();
//# sourceMappingURL=app.js.map
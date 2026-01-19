"use strict";
function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_with_holes(arr) {
    if (Array.isArray(arr)) return arr;
}
function _array_without_holes(arr) {
    if (Array.isArray(arr)) return _array_like_to_array(arr);
}
function _assert_this_initialized(self) {
    if (self === void 0) {
        throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    }
    return self;
}
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
function _call_super(_this, derived, args) {
    derived = _get_prototype_of(derived);
    return _possible_constructor_return(_this, _is_native_reflect_construct() ? Reflect.construct(derived, args || [], _get_prototype_of(_this).constructor) : derived.apply(_this, args));
}
function _class_call_check(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
    }
}
function _construct(Parent, args, Class) {
    if (_is_native_reflect_construct()) {
        _construct = Reflect.construct;
    } else {
        _construct = function construct(Parent, args, Class) {
            var a = [
                null
            ];
            a.push.apply(a, args);
            var Constructor = Function.bind.apply(Parent, a);
            var instance = new Constructor();
            if (Class) _set_prototype_of(instance, Class.prototype);
            return instance;
        };
    }
    return _construct.apply(null, arguments);
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
function _define_property(obj, key, value) {
    if (key in obj) {
        Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true
        });
    } else {
        obj[key] = value;
    }
    return obj;
}
function _get_prototype_of(o) {
    _get_prototype_of = Object.setPrototypeOf ? Object.getPrototypeOf : function getPrototypeOf(o) {
        return o.__proto__ || Object.getPrototypeOf(o);
    };
    return _get_prototype_of(o);
}
function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
        throw new TypeError("Super expression must either be null or a function");
    }
    subClass.prototype = Object.create(superClass && superClass.prototype, {
        constructor: {
            value: subClass,
            writable: true,
            configurable: true
        }
    });
    if (superClass) _set_prototype_of(subClass, superClass);
}
function _instanceof(left, right) {
    if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
        return !!right[Symbol.hasInstance](left);
    } else {
        return left instanceof right;
    }
}
function _is_native_function(fn) {
    return Function.toString.call(fn).indexOf("[native code]") !== -1;
}
function _iterable_to_array(iter) {
    if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter);
}
function _iterable_to_array_limit(arr, i) {
    var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"];
    if (_i == null) return;
    var _arr = [];
    var _n = true;
    var _d = false;
    var _s, _e;
    try {
        for(_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true){
            _arr.push(_s.value);
            if (i && _arr.length === i) break;
        }
    } catch (err) {
        _d = true;
        _e = err;
    } finally{
        try {
            if (!_n && _i["return"] != null) _i["return"]();
        } finally{
            if (_d) throw _e;
        }
    }
    return _arr;
}
function _non_iterable_rest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _non_iterable_spread() {
    throw new TypeError("Invalid attempt to spread non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _object_spread(target) {
    for(var i = 1; i < arguments.length; i++){
        var source = arguments[i] != null ? arguments[i] : {};
        var ownKeys = Object.keys(source);
        if (typeof Object.getOwnPropertySymbols === "function") {
            ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function(sym) {
                return Object.getOwnPropertyDescriptor(source, sym).enumerable;
            }));
        }
        ownKeys.forEach(function(key) {
            _define_property(target, key, source[key]);
        });
    }
    return target;
}
function _possible_constructor_return(self, call) {
    if (call && (_type_of(call) === "object" || typeof call === "function")) {
        return call;
    }
    return _assert_this_initialized(self);
}
function _set_prototype_of(o, p) {
    _set_prototype_of = Object.setPrototypeOf || function setPrototypeOf(o, p) {
        o.__proto__ = p;
        return o;
    };
    return _set_prototype_of(o, p);
}
function _sliced_to_array(arr, i) {
    return _array_with_holes(arr) || _iterable_to_array_limit(arr, i) || _unsupported_iterable_to_array(arr, i) || _non_iterable_rest();
}
function _to_consumable_array(arr) {
    return _array_without_holes(arr) || _iterable_to_array(arr) || _unsupported_iterable_to_array(arr) || _non_iterable_spread();
}
function _type_of(obj) {
    "@swc/helpers - typeof";
    return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj;
}
function _unsupported_iterable_to_array(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _array_like_to_array(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(n);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
}
function _wrap_native_super(Class) {
    var _cache = typeof Map === "function" ? new Map() : undefined;
    _wrap_native_super = function wrapNativeSuper(Class) {
        if (Class === null || !_is_native_function(Class)) return Class;
        if (typeof Class !== "function") {
            throw new TypeError("Super expression must either be null or a function");
        }
        if (typeof _cache !== "undefined") {
            if (_cache.has(Class)) return _cache.get(Class);
            _cache.set(Class, Wrapper);
        }
        function Wrapper() {
            return _construct(Class, arguments, _get_prototype_of(this).constructor);
        }
        Wrapper.prototype = Object.create(Class.prototype, {
            constructor: {
                value: Wrapper,
                enumerable: false,
                writable: true,
                configurable: true
            }
        });
        return _set_prototype_of(Wrapper, Class);
    };
    return _wrap_native_super(Class);
}
function _is_native_reflect_construct() {
    try {
        var result = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}));
    } catch (_) {}
    return (_is_native_reflect_construct = function() {
        return !!result;
    })();
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
    return Float32Array.from({
        length: num
    }, function(_, i) {
        return Math.pow(10, logStart + i * logStep);
    });
}
function linspace(start, end, num) {
    if (num === 1) return Float32Array.from([
        start
    ]);
    var step = (end - start) / (num - 1);
    return Float32Array.from({
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
var mod = function(n, m) {
    return (n % m + m) % m;
};
var nextPow2 = function(v) {
    var p = 1;
    while(p < v)p <<= 1;
    return p;
};
function max(arr) {
    var maxVal = -Infinity;
    for(var i = 0; i < arr.length; i++){
        if (arr[i] > maxVal) maxVal = Math.abs(arr[i]);
    }
    return maxVal;
}
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
            value: function fromComplexArray(complex, storage2) {
                var res = storage2 || new Array(complex.length >>> 1);
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
            value: function toComplexArray(input, storage2) {
                var res = storage2 || this.createComplexArray();
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
    frequencies = Float32Array.from(new Set(frequencies));
    return frequencies;
}
function fractionalOctaveSmoothing(frequencyData, fraction, frequencies) {
    var frequenciesAll = linspace(0, 48e3 / 2, frequencyData.length);
    var smoothedData = new Float32Array(frequencies.length);
    var n = frequencyData.length;
    var factor = Math.pow(2, 0.5 * fraction) - Math.pow(0.5, 0.5 * fraction);
    for(var p = 0; p < frequencies.length; p++){
        var i = closest(frequencies[p], frequenciesAll);
        var sum2 = 0;
        var width = Math.round(0.5 * factor * (n * 0.5 - Math.abs(n * 0.5 - i)));
        if (width === 0) {
            sum2 = frequencyData[i];
        } else {
            var as = frequencyData.slice(Math.round(i - width + 1), Math.min(Math.round(i + width), n - 1));
            sum2 = average(as);
        }
        smoothedData[p] = sum2;
    }
    return smoothedData;
}
// src/wave.ts
function download(samples) {
    var sampleRate = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 48e3, name = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : "output", bext = arguments.length > 3 ? arguments[3] : void 0, ixml = arguments.length > 4 ? arguments[4] : void 0;
    var channels = 1;
    var bytesPerSample = 4;
    var blockAlign = channels * bytesPerSample;
    var byteRate = sampleRate * blockAlign;
    var dataSize = samples.length * bytesPerSample;
    var bextDataSize = 0;
    var bextPayload = null;
    if (bext) {
        var description = bext.description || "";
        var originator = bext.originator || "";
        var originatorReference = bext.originatorReference || "";
        var originationDate = bext.originationDate || "";
        var originationTime = bext.originationTime || "";
        var codingHistory = bext.codingHistory || "";
        var version = typeof bext.version === "number" ? bext.version : 1;
        var umidBytes = bext.umid && bext.umid.length ? bext.umid : null;
        var baseLen = 602;
        var codingLen = codingHistory ? codingHistory.length + 1 : 0;
        bextDataSize = baseLen + codingLen;
        if (bextDataSize % 2 === 1) bextDataSize++;
        bextPayload = new Uint8Array(bextDataSize);
        var p = 0;
        var writeFixed = function(str, len) {
            for(var i = 0; i < len; i++){
                var code = i < str.length ? str.charCodeAt(i) & 255 : 0;
                bextPayload[p++] = code;
            }
        };
        writeFixed(description, 256);
        writeFixed(originator, 32);
        writeFixed(originatorReference, 32);
        writeFixed(originationDate, 10);
        writeFixed(originationTime, 8);
        var timeRefLow = 0;
        var timeRefHigh = 0;
        try {
            var tr = bext.timeReference || "0";
            var BigIntFn = globalThis.BigInt;
            if (typeof BigIntFn === "function") {
                var t = BigIntFn(tr);
                var mask = BigIntFn(4294967295);
                timeRefLow = Number(t & mask);
                timeRefHigh = Number(t >> BigIntFn(32) & mask);
            } else {
                var n = Number(tr || 0);
                timeRefLow = Math.floor(n % 4294967296);
                timeRefHigh = Math.floor(n / 4294967296);
            }
        } catch (unused) {
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
                for(var i = 0; i < 64; i++)bextPayload[p++] = i < umidBytes.length ? umidBytes[i] : 0;
            } else {
                for(var i1 = 0; i1 < 64; i1++)bextPayload[p++] = 0;
            }
        } else {
            for(var i2 = 0; i2 < 64; i2++)bextPayload[p++] = 0;
        }
        for(var i3 = 0; i3 < 190; i3++)bextPayload[p++] = 0;
        if (codingHistory) {
            for(var i4 = 0; i4 < codingHistory.length; i4++)bextPayload[p++] = codingHistory.charCodeAt(i4) & 255;
            bextPayload[p++] = 0;
        }
        while(p < bextDataSize)bextPayload[p++] = 0;
    }
    var ixmlDataSize = 0;
    var ixmlPayload = null;
    if (ixml) {
        var enc = globalThis.TextEncoder ? new TextEncoder() : null;
        if (enc) ixmlPayload = enc.encode(ixml);
        else {
            var arr = new Uint8Array(ixml.length);
            for(var i5 = 0; i5 < ixml.length; i5++)arr[i5] = ixml.charCodeAt(i5) & 255;
            ixmlPayload = arr;
        }
        ixmlDataSize = ixmlPayload.length;
        if (ixmlDataSize % 2 === 1) ixmlDataSize++;
    }
    var fmtChunkSize = 8 + 16;
    var bextChunkSize = bextPayload ? 8 + bextDataSize : 0;
    var ixmlChunkSize = ixmlPayload ? 8 + ixmlDataSize : 0;
    var dataChunkSize = 8 + dataSize + (dataSize % 2 === 1 ? 1 : 0);
    var riffBodySize = 4 + fmtChunkSize + bextChunkSize + ixmlChunkSize + dataChunkSize;
    var totalSize = 8 + riffBodySize;
    var buffer = new ArrayBuffer(totalSize);
    var view = new DataView(buffer);
    function writeString(offset, str) {
        for(var i = 0; i < str.length; i++)view.setUint8(offset + i, str.charCodeAt(i));
    }
    writeString(0, "RIFF");
    view.setUint32(4, riffBodySize, true);
    writeString(8, "WAVE");
    var ptr = 12;
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
        var dest = new Uint8Array(buffer, ptr, ixmlDataSize);
        dest.set(ixmlPayload);
        if (ixmlDataSize > ixmlPayload.length) {
            for(var i6 = ixmlPayload.length; i6 < ixmlDataSize; i6++)dest[i6] = 0;
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
    var off = ptr;
    for(var i7 = 0; i7 < samples.length; i7++, off += 2){
        var s = Math.max(-1, Math.min(1, Number(samples[i7])));
        view.setInt16(off, s < 0 ? s * 32768 : s * 32767, true);
    }
    if (dataSize % 2 === 1) {
        view.setUint8(off, 0);
        off++;
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
function read(bufferOrBlob) {
    return _async_to_generator(function() {
        var _loop, buffer, tmp, view, readStr, offset, fmt, dataOffset, dataSize, bextChunk, ixmlChunk, readFixedString, audioFormat, channels, sampleRate, bitsPerSample, bytesPerSample, totalFrames, out, p, i, o, v, i1, o1, v1, i2, o2, b0, b1, b2, val, i3, o3, v2, i4, o4, i5, o5;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    _loop = function() {
                        var id = readStr(offset, 4);
                        var size = view.getUint32(offset + 4, true);
                        var chunkStart = offset + 8;
                        if (id === "fmt ") {
                            var audioFormat2 = view.getUint16(chunkStart, true);
                            var channels2 = view.getUint16(chunkStart + 2, true);
                            var sampleRate2 = view.getUint32(chunkStart + 4, true);
                            var byteRate = view.getUint32(chunkStart + 8, true);
                            var blockAlign = view.getUint16(chunkStart + 12, true);
                            var bitsPerSample2 = view.getUint16(chunkStart + 14, true);
                            fmt = {
                                audioFormat: audioFormat2,
                                channels: channels2,
                                sampleRate: sampleRate2,
                                byteRate: byteRate,
                                blockAlign: blockAlign,
                                bitsPerSample: bitsPerSample2
                            };
                        } else if (id === "data") {
                            dataOffset = chunkStart;
                            dataSize = size;
                        } else if (id === "bext") {
                            var p2 = chunkStart;
                            var remaining = chunkStart + size - p2;
                            var readLen = function(n) {
                                return Math.max(0, Math.min(n, chunkStart + size - p2));
                            };
                            var safeRead = function(n) {
                                var r = readLen(n);
                                var s = readFixedString(p2, r);
                                p2 += n;
                                return s;
                            };
                            var description = readFixedString(p2, Math.min(256, chunkStart + size - p2));
                            p2 += 256;
                            var originator = readFixedString(p2, Math.min(32, chunkStart + size - p2));
                            p2 += 32;
                            var originatorReference = readFixedString(p2, Math.min(32, chunkStart + size - p2));
                            p2 += 32;
                            var originationDate = readFixedString(p2, Math.min(10, chunkStart + size - p2));
                            p2 += 10;
                            var originationTime = readFixedString(p2, Math.min(8, chunkStart + size - p2));
                            p2 += 8;
                            var timeRefLow = 0;
                            var timeRefHigh = 0;
                            if (p2 + 8 <= chunkStart + size) {
                                timeRefLow = view.getUint32(p2, true);
                                timeRefHigh = view.getUint32(p2 + 4, true);
                            } else {
                                if (p2 + 4 <= chunkStart + size) timeRefLow = view.getUint32(p2, true);
                            }
                            p2 += 8;
                            var version = 0;
                            if (p2 + 2 <= chunkStart + size) {
                                version = view.getUint16(p2, true);
                            }
                            p2 += 2;
                            var umid = null;
                            if (version > 0 && p2 + 64 <= chunkStart + size) {
                                umid = new Uint8Array(buffer.slice(p2, p2 + 64));
                                p2 += 64;
                            } else if (version > 0) {
                                var avail = Math.max(0, chunkStart + size - p2);
                                if (avail > 0) {
                                    umid = new Uint8Array(buffer.slice(p2, p2 + avail));
                                    p2 += avail;
                                }
                            }
                            var reservedLen = 190;
                            var skipReserved = Math.min(reservedLen, Math.max(0, chunkStart + size - p2));
                            p2 += skipReserved;
                            var codingHistory = "";
                            if (p2 < chunkStart + size) {
                                var bytes = new Uint8Array(buffer, p2, chunkStart + size - p2);
                                var s = "";
                                for(var i = 0; i < bytes.length; i++){
                                    var c = bytes[i];
                                    if (c === 0) break;
                                    s += String.fromCharCode(c);
                                }
                                codingHistory = s;
                            }
                            var timeReferenceStr = "0";
                            try {
                                var BigIntFn = globalThis.BigInt;
                                if (typeof BigIntFn === "function") {
                                    var hi = BigIntFn(timeRefHigh);
                                    var lo = BigIntFn(timeRefLow);
                                    var combined = hi << BigIntFn(32) | lo;
                                    timeReferenceStr = combined.toString();
                                } else {
                                    timeReferenceStr = (timeRefHigh * 4294967296 + timeRefLow).toString();
                                }
                            } catch (unused) {
                                timeReferenceStr = (timeRefHigh * 4294967296 + timeRefLow).toString();
                            }
                            bextChunk = {
                                description: description || void 0,
                                originator: originator || void 0,
                                originatorReference: originatorReference || void 0,
                                originationDate: originationDate || void 0,
                                originationTime: originationTime || void 0,
                                timeReference: timeReferenceStr,
                                version: version,
                                umid: umid,
                                codingHistory: codingHistory || void 0
                            };
                        } else if (id === "iXML" || id === "iXML") {
                            var bytes1 = new Uint8Array(buffer, chunkStart, size);
                            var s1 = "";
                            for(var i1 = 0; i1 < bytes1.length; i1++){
                                var c1 = bytes1[i1];
                                if (c1 === 0) break;
                                s1 += String.fromCharCode(c1);
                            }
                            ixmlChunk = s1;
                        }
                        offset = chunkStart + size;
                        if (size % 2 === 1) offset++;
                    };
                    if (!_instanceof(bufferOrBlob, Blob)) return [
                        3,
                        2
                    ];
                    return [
                        4,
                        bufferOrBlob.arrayBuffer()
                    ];
                case 1:
                    buffer = _state.sent();
                    return [
                        3,
                        3
                    ];
                case 2:
                    if (_instanceof(bufferOrBlob, ArrayBuffer)) buffer = bufferOrBlob;
                    else if (_instanceof(bufferOrBlob, Uint8Array)) {
                        tmp = new ArrayBuffer(bufferOrBlob.byteLength);
                        new Uint8Array(tmp).set(bufferOrBlob);
                        buffer = tmp;
                    } else throw new TypeError("Expected Blob, ArrayBuffer or Uint8Array");
                    _state.label = 3;
                case 3:
                    view = new DataView(buffer);
                    readStr = function(off, len) {
                        var s = "";
                        for(var i = 0; i < len && off + i < view.byteLength; i++){
                            var c = view.getUint8(off + i);
                            if (c === 0) break;
                            s += String.fromCharCode(c);
                        }
                        return s;
                    };
                    if (readStr(0, 4) !== "RIFF" || readStr(8, 4) !== "WAVE") throw new Error("Not a valid WAVE file");
                    offset = 12;
                    fmt = null;
                    dataOffset = -1;
                    dataSize = 0;
                    bextChunk = null;
                    ixmlChunk = null;
                    readFixedString = function(off, len) {
                        var _String;
                        var bytes = [];
                        for(var i = 0; i < len && off + i < view.byteLength; i++){
                            bytes.push(view.getUint8(off + i));
                        }
                        var end = bytes.length;
                        while(end > 0 && bytes[end - 1] === 0)end--;
                        return (_String = String).fromCharCode.apply(_String, _to_consumable_array(bytes.slice(0, end)));
                    };
                    while(offset + 8 <= view.byteLength)_loop();
                    if (!fmt) throw new Error('Missing "fmt " chunk');
                    if (dataOffset < 0) throw new Error('Missing "data" chunk');
                    audioFormat = fmt.audioFormat, channels = fmt.channels, sampleRate = fmt.sampleRate, bitsPerSample = fmt.bitsPerSample;
                    bytesPerSample = bitsPerSample / 8;
                    totalFrames = Math.floor(dataSize / (bytesPerSample * channels));
                    out = new Float32Array(totalFrames * channels);
                    p = dataOffset;
                    if (audioFormat === 1) {
                        if (bitsPerSample === 8) {
                            for(i = 0, o = 0; i < totalFrames * channels; i++, o++){
                                v = view.getUint8(p++);
                                out[o] = (v - 128) / 128;
                            }
                        } else if (bitsPerSample === 16) {
                            for(i1 = 0, o1 = 0; i1 < totalFrames * channels; i1++, o1++){
                                v1 = view.getInt16(p, true);
                                p += 2;
                                out[o1] = v1 < 0 ? v1 / 32768 : v1 / 32767;
                            }
                        } else if (bitsPerSample === 24) {
                            for(i2 = 0, o2 = 0; i2 < totalFrames * channels; i2++, o2++){
                                b0 = view.getUint8(p++);
                                b1 = view.getUint8(p++);
                                b2 = view.getUint8(p++);
                                val = b2 << 16 | b1 << 8 | b0;
                                if (val & 8388608) val |= ~16777215;
                                out[o2] = val / 8388608;
                            }
                        } else if (bitsPerSample === 32) {
                            for(i3 = 0, o3 = 0; i3 < totalFrames * channels; i3++, o3++){
                                v2 = view.getInt32(p, true);
                                p += 4;
                                out[o3] = v2 < 0 ? v2 / 2147483648 : v2 / 2147483647;
                            }
                        } else {
                            throw new Error("Unsupported PCM bitsPerSample: " + bitsPerSample);
                        }
                    } else if (audioFormat === 3) {
                        if (bitsPerSample !== 32 && bitsPerSample !== 64) throw new Error("Unsupported float bit depth: " + bitsPerSample);
                        if (bitsPerSample === 32) {
                            for(i4 = 0, o4 = 0; i4 < totalFrames * channels; i4++, o4++){
                                out[o4] = view.getFloat32(p, true);
                                p += 4;
                            }
                        } else {
                            for(i5 = 0, o5 = 0; i5 < totalFrames * channels; i5++, o5++){
                                out[o5] = view.getFloat64(p, true);
                                p += 8;
                            }
                        }
                    } else {
                        throw new Error("Unsupported audio format: " + audioFormat);
                    }
                    return [
                        2,
                        {
                            samples: out,
                            sampleRate: sampleRate,
                            channels: channels,
                            bitsPerSample: bitsPerSample,
                            format: audioFormat,
                            frames: totalFrames,
                            bext: bextChunk,
                            ixml: ixmlChunk
                        }
                    ];
            }
        });
    })();
}
function convertToIXML(xmlContent) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<BWFXML>\n    <IXML_VERSION>3.01</IXML_VERSION>\n    <PROJECT>Converted Audio File</PROJECT>\n    <NOTE>Converted to iXML format.</NOTE>\n    <HISTORY></HISTORY>\n    <USER>'.concat(xmlContent, "</USER>\n</BWFXML>");
}
// src/audio.ts
console.debug("Audio module loaded");
window.FFT = FFT;
function sum(buffer) {
    var sum2 = 0;
    for(var i = 0; i < buffer.length; i++){
        sum2 += buffer[i] * buffer[i];
    }
    return sum2;
}
function rms(buffer) {
    return Math.sqrt(sum(buffer) / buffer.length);
}
function db(value) {
    if (_instanceof(value, Float32Array)) {
        return value.map(function(v) {
            return 20 * Math.log10(v + 1e-50);
        });
    } else {
        return 20 * Math.log10(value + 1e-50);
    }
}
function dbToLinear(value) {
    if (_instanceof(value, Float32Array)) {
        return value.map(function(v) {
            return Math.pow(10, v / 20);
        });
    } else {
        return Math.pow(10, value / 20);
    }
}
function loadAudioFile(file) {
    return _async_to_generator(function() {
        var headerBuffer, ext, mime, metadata, ixmlObj, ixmlRaw, ixmlErr, wavInfo, mp3Info, arrayBuffer, audioContext, audioBuffer;
        function getExt(name) {
            var ext2 = (name.split(".").pop() || "").toLowerCase();
            try {
                var dvh = new DataView(headerBuffer);
                var readStr = function(off, len) {
                    var s = "";
                    for(var i = 0; i < len; i++)s += String.fromCharCode(dvh.getUint8(off + i));
                    return s;
                };
                var offset = 12;
                while(offset + 8 <= dvh.byteLength){
                    var id = readStr(offset, 4);
                    var size = dvh.getUint32(offset + 4, true);
                    if (id === "iXML") {
                        var start = offset + 8;
                        var end = Math.min(start + size, dvh.byteLength);
                        var xmlBytes = new Uint8Array(headerBuffer.slice(start, end));
                        var xmlString = new TextDecoder().decode(xmlBytes);
                        file.__iXMLraw = xmlString;
                        try {
                            var _window_wave, _window;
                            var converter = (read === null || read === void 0 ? void 0 : read.convertiXMLtoObject) || ((_window = window) === null || _window === void 0 ? void 0 : (_window_wave = _window.wave) === null || _window_wave === void 0 ? void 0 : _window_wave.convertiXMLtoObject);
                            if (typeof converter === "function") {
                                try {
                                    var obj = converter(xmlString);
                                    file.__iXML = obj;
                                    console.log("iXML converted to object", obj);
                                } catch (convErr) {
                                    console.warn("convertiXMLtoObject failed:", convErr);
                                    file.__iXMLError = String(convErr);
                                }
                            } else {
                                console.debug("No convertiXMLtoObject available; raw iXML attached to file.__iXMLraw");
                            }
                        } catch (e) {
                            console.warn("iXML conversion attempt failed:", e);
                        }
                        break;
                    }
                    offset += 8 + size + size % 2;
                }
            } catch (e) {
                console.warn("Failed to scan header for iXML chunk:", e);
            }
            return ext2;
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
                    metadata.filename = file.name;
                    metadata.size = file.size;
                    metadata.mime = mime;
                    metadata.ext = ext;
                    ixmlObj = file.__iXML;
                    ixmlRaw = file.__iXMLraw;
                    ixmlErr = file.__iXMLError;
                    metadata.iXMLdata = ixmlRaw;
                    if (ixmlErr) metadata.iXMLError = String(ixmlErr);
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
                    return [
                        2,
                        Audio.fromAudioBuffer(audioBuffer, metadata)
                    ];
            }
        });
    })();
}
var Audio = /*#__PURE__*/ function(AudioBuffer1) {
    _inherits(_Audio, AudioBuffer1);
    function _Audio() {
        _class_call_check(this, _Audio);
        return _call_super(this, _Audio, arguments);
    }
    _create_class(_Audio, [
        {
            key: "applyGain",
            value: function applyGain(gain) {
                var numChannels = this.numberOfChannels;
                for(var ch = 0; ch < numChannels; ch++){
                    var data = this.getChannelData(ch).map(function(v) {
                        return v * gain;
                    });
                    this.copyToChannel(data, ch, 0);
                }
                return this;
            }
        },
        {
            key: "getChannel",
            value: function getChannel(channel) {
                if (channel < 0 || channel >= this.numberOfChannels) {
                    throw new Error("Invalid channel number");
                }
                var channelData = this.getChannelData(channel);
                var newBuffer = new AudioBuffer({
                    length: channelData.length,
                    numberOfChannels: 1,
                    sampleRate: this.sampleRate
                });
                newBuffer.copyToChannel(channelData, 0, 0);
                return new _Audio(newBuffer);
            }
        },
        {
            key: "rms",
            value: function rms1() {
                var channel = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 0;
                if (channel < 0 || channel >= this.numberOfChannels) {
                    throw new Error("Invalid channel number");
                }
                var data = this.getChannelData(channel);
                return rms(data);
            }
        }
    ], [
        {
            key: "fromAudioBuffer",
            value: function fromAudioBuffer(buffer, metadata) {
                var audio2 = new _Audio({
                    length: buffer.length,
                    numberOfChannels: buffer.numberOfChannels,
                    sampleRate: buffer.sampleRate
                });
                for(var ch = 0; ch < buffer.numberOfChannels; ch++){
                    audio2.copyToChannel(buffer.getChannelData(ch), ch);
                }
                audio2.metadata = metadata;
                return audio2;
            }
        },
        {
            key: "fromSamples",
            value: function fromSamples(samples) {
                var sampleRate = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 48e3, metadata = arguments.length > 2 ? arguments[2] : void 0;
                if (!samples || samples.length == 0) return new _Audio({
                    length: 0,
                    numberOfChannels: 1,
                    sampleRate: sampleRate
                });
                var audio2 = new _Audio({
                    length: samples.length,
                    numberOfChannels: 1,
                    sampleRate: sampleRate
                });
                audio2.copyToChannel(samples, 0);
                audio2.metadata = metadata;
                return audio2;
            }
        }
    ]);
    return _Audio;
}(_wrap_native_super(AudioBuffer));
function chirp(f_start, f_stop) {
    var duration = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : null, rate = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : null, fade = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : 0.01, fs = arguments.length > 5 && arguments[5] !== void 0 ? arguments[5] : 48e3;
    var c = Math.log(f_stop / f_start);
    var L;
    var samples_count;
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
    var fade_in = Math.max(0, Math.floor(fade * fs));
    var fade_out = Math.max(0, Math.floor(fade / 10 * fs));
    var pre = Math.max(0, fade_in);
    var post = Math.max(0, fade_out);
    var phi = Float32Array.from({
        length: pre + samples_count + post
    }, function() {
        return 0;
    });
    var offset = f_start * ((fade_in + 1) / fs);
    for(var i = 0; i < pre; i++)phi[i] = f_start * (i / fs);
    var baseIdx = pre;
    for(var i1 = 0; i1 < samples_count; i1++){
        var t2 = i1 / fs;
        phi[baseIdx + i1] = L * f_start * (Math.exp(t2 / L) - 1) + offset;
    }
    var last = phi[baseIdx + samples_count - 1] || 0;
    for(var i2 = 0; i2 < post; i2++){
        phi[baseIdx + samples_count + i2] = last + f_stop * ((i2 + 1) / fs);
    }
    var sweep = Float32Array.from({
        length: phi.length
    }, function() {
        return 0;
    });
    for(var i3 = 0; i3 < phi.length; i3++)sweep[i3] = Math.sin(2 * Math.PI * phi[i3]);
    var t = Float32Array.from({
        length: sweep.length
    }, function() {
        return 0;
    });
    for(var i4 = 0; i4 < sweep.length; i4++)t[i4] = i4 / fs;
    var envMain = Float32Array.from({
        length: t.length
    }, function() {
        return 0;
    });
    var factor = f_stop * duration * duration;
    for(var i5 = 0; i5 < t.length; i5++)envMain[i5] = Math.exp(-t[i5] / L) / L * factor;
    var startZeros = Math.floor(0.01 * fs);
    var endZeros = Math.floor(1e-3 * fs);
    var envelope = Float32Array.from({
        length: startZeros + envMain.length + endZeros
    }, function() {
        return 0;
    });
    for(var i6 = 0; i6 < envMain.length; i6++){
        envelope[startZeros + i6] = envMain[i6];
    }
    var window2 = Float32Array.from({
        length: sweep.length
    }, function() {
        return 0;
    });
    for(var i7 = 0; i7 < sweep.length; i7++){
        var w = 1;
        if (fade_in > 0 && i7 < fade_in) {
            w = i7 / Math.max(1, fade_in);
        }
        if (fade_out > 0 && i7 >= sweep.length - fade_out) {
            var k = i7 - (sweep.length - fade_out);
            w *= 1 - k / Math.max(1, fade_out);
        }
        window2[i7] = w;
    }
    var sweepWindowed = Float32Array.from({
        length: sweep.length
    }, function() {
        return 0;
    });
    for(var i8 = 0; i8 < sweep.length; i8++)sweepWindowed[i8] = sweep[i8] * window2[i8];
    return [
        sweepWindowed,
        t,
        envelope
    ];
}
function smoothFFT(fftData, fraction, resolution) {
    var frequency = fftData.frequency, magnitude = fftData.magnitude, phase = fftData.phase, fftSize = fftData.fftSize;
    var smoothedMagnitude = Float32Array.from({
        length: magnitude.length
    }, function() {
        return 0;
    });
    var fractionalFrequencies = getFractionalOctaveFrequencies(resolution, 20, 24e3, fftSize);
    var smoothed = dbToLinear(fractionalOctaveSmoothing(db(magnitude), fraction, fractionalFrequencies));
    var smoothedPhase = fractionalOctaveSmoothing(phase, fraction, fractionalFrequencies);
    return {
        frequency: fractionalFrequencies,
        magnitude: smoothed,
        phase: smoothedPhase,
        fftSize: fftSize
    };
}
function computeFFT(data) {
    var fftSize = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : null;
    fftSize !== null && fftSize !== void 0 ? fftSize : fftSize = Math.pow(2, Math.ceil(Math.log2(data.length)));
    console.log("Computing FFT with ".concat(fftSize, " bins for data length ").concat(data.length));
    var fft = new FFT(fftSize);
    var out = fft.createComplexArray();
    var frame = Float32Array.from({
        length: fftSize
    }, function() {
        return 0;
    });
    for(var i = 0; i < fftSize; i++){
        frame[i] = (data[i] || 0) * 1;
    }
    fft.realTransform(out, frame);
    var frequency = Float32Array.from({
        length: fftSize / 2
    }, function() {
        return 0;
    });
    var magnitude = Float32Array.from({
        length: fftSize / 2
    }, function() {
        return 0;
    });
    var phase = Float32Array.from({
        length: fftSize / 2
    }, function() {
        return 0;
    });
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
    var nextPow22 = function(v) {
        var p = 1;
        while(p < v)p <<= 1;
        return p;
    };
    var n = nextPow22(fullLen);
    var xP = Float32Array.from({
        length: n
    }, function() {
        return 0;
    });
    var yP = Float32Array.from({
        length: n
    }, function() {
        return 0;
    });
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
    var corr = Float64Array.from({
        length: fullLen
    }, function() {
        return 0;
    });
    for(var i = 0; i < fullLen; i++){
        corr[i] = out[2 * i] / n;
    }
    var sumX2 = 0, sumY2 = 0;
    for(var i1 = 0; i1 < lenX; i1++)sumX2 += x[i1] * x[i1];
    for(var i2 = 0; i2 < lenY; i2++)sumY2 += y[i2] * y[i2];
    var denom = Math.sqrt(sumX2 * sumY2);
    var normalized = Float64Array.from({
        length: fullLen
    }, function() {
        return 0;
    });
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
function fftConvolve(x, y) {
    var mode = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : "same";
    var lenX = x.length;
    var lenY = y.length;
    var fullLen = lenX + lenY - 1;
    var n = nextPow2(fullLen);
    var xP = Float32Array.from({
        length: n
    }, function() {
        return 0;
    });
    var yP = Float32Array.from({
        length: n
    }, function() {
        return 0;
    });
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
        C[2 * k] = ar * br - ai * bi;
        C[2 * k + 1] = ai * br + ar * bi;
    }
    var out = fft.createComplexArray();
    fft.inverseTransform(out, C);
    var result = Float32Array.from({
        length: fullLen
    }, function() {
        return 0;
    });
    for(var i = 0; i < fullLen; i++){
        result[i] = out[2 * i];
    }
    if (mode === "same") {
        var start = Math.floor((fullLen - lenX) / 2);
        return result.slice(start, start + lenX);
    }
    return result;
}
function twoChannelImpulseResponse(y, x) {
    var fullLen = y.length + x.length - 1;
    var N = nextPow2(fullLen);
    var xP = Float32Array.from({
        length: N
    }, function() {
        return 0;
    });
    var yP = Float32Array.from({
        length: N
    }, function() {
        return 0;
    });
    xP.set(y, 0);
    yP.set(x, 0);
    var fft = new FFT(N);
    var A = fft.createComplexArray();
    var B = fft.createComplexArray();
    fft.realTransform(A, xP);
    fft.realTransform(B, yP);
    var C = fft.createComplexArray();
    var epsilon = 1e-20;
    for(var k = 0; k < N; k++){
        var ar = A[2 * k], ai = A[2 * k + 1];
        var br = B[2 * k], bi = B[2 * k + 1];
        var denom = br * br + bi * bi + epsilon;
        C[2 * k] = (ar * br + ai * bi) / denom;
        C[2 * k + 1] = (ai * br - ar * bi) / denom;
    }
    var out = Float32Array.from(fft.createComplexArray());
    fft.inverseTransform(out, C);
    var ir = Float32Array.from({
        length: N
    }, function() {
        return 0;
    });
    for(var i = 0; i < N; i++){
        ir[i] = out[2 * ((i + N / 2) % N)];
    }
    var peakAt = closest(1e8, ir) + -N / 2;
    var ir_complex = out.slice();
    for(var i1 = 0; i1 < N; i1++){
        ir_complex[2 * i1] = out[2 * mod(i1 + peakAt, N)];
        ir_complex[2 * i1 + 1] = out[2 * mod(i1 + peakAt, N) + 1];
    }
    var mean = average(ir);
    for(var i2 = 0; i2 < N; i2++){
        ir[i2] = ir[i2] - mean;
    }
    return {
        ir: ir,
        ir_complex: ir_complex,
        t: linspace((-N - 1) / 2 / 48e3, (N - 1) / 2 / 48e3, N),
        // assuming 48kHz
        peakAt: peakAt,
        sampleRate: 48e3,
        fftSize: N
    };
}
function twoChannelFFT(dataArray, reference, fftSize, offset) {
    var dataPadded = Float32Array.from({
        length: fftSize
    }, function() {
        return 0;
    });
    var referencePadded = Float32Array.from({
        length: fftSize
    }, function() {
        return 0;
    });
    if (offset >= 0) {
        var refLen = Math.min(reference.length, Math.max(0, fftSize - offset));
        for(var i = 0; i < refLen; i++){
            referencePadded[offset + i] = reference[i];
        }
        var dataLen = Math.min(dataArray.length, fftSize);
        for(var i1 = 0; i1 < dataLen; i1++){
            dataPadded[i1] = dataArray[i1];
        }
    } else {
        var refLen1 = Math.min(reference.length, fftSize);
        for(var i2 = 0; i2 < refLen1; i2++){
            referencePadded[i2] = reference[i2];
        }
        var start = -offset;
        var dataLen1 = Math.min(dataArray.length, Math.max(0, fftSize - start));
        for(var i3 = 0; i3 < dataLen1; i3++){
            dataPadded[start + i3] = dataArray[i3];
        }
    }
    var reference_ = computeFFT(referencePadded);
    var signal_ = computeFFT(dataPadded);
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
        var out = Float32Array.from({
            length: N
        }, function() {
            return 0;
        });
        if (N === 0) return out;
        out[0] = phases[0];
        var offset2 = 0;
        var theta = Math.PI;
        for(var i = 1; i < N; i++){
            var delta = phases[i] - phases[i - 1];
            if (delta > theta) {
                offset2 -= 2 * Math.PI;
            } else if (delta < -theta) {
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
function computeFFTFromIR(ir) {
    var f_phase_wrap = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 1e3, frequency_multiplier = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : 1;
    var fftSize = nextPow2(ir.ir.length);
    console.log("Computing FFT from IR with size ".concat(fftSize));
    var fft = new FFT(fftSize);
    var out = Float32Array.from(fft.createComplexArray());
    if (ir.ir_complex[1] === 0) {
        console.log("IR is in real format, converting to complex");
        var frame = Float32Array.from({
            length: fftSize
        }, function() {
            return 0;
        });
        for(var i = 0; i < fftSize; i++){
            frame[i] = ir.ir_complex[2 * i] || 0;
        }
        fft.realTransform(out, frame);
    } else {
        fft.transform(out, ir.ir_complex);
    }
    var magnitude = Float32Array.from({
        length: fftSize / 2
    }, function() {
        return 0;
    });
    var phase = Float32Array.from({
        length: fftSize / 2
    }, function() {
        return 0;
    });
    for(var i1 = 0; i1 < fftSize / 2; i1++){
        var re = out[2 * i1];
        var im = out[2 * i1 + 1];
        magnitude[i1] = abs(re, im);
        phase[i1] = Math.atan2(im, re);
    }
    var frequency = linspace(0, 48e3 / 2, magnitude.length);
    var i_norm = closest(f_phase_wrap, frequency);
    var unwraped_phase = unwrapPhase(phase);
    var correction = Math.floor(unwraped_phase[i_norm] / (2 * Math.PI) + 0.5) * (2 * Math.PI);
    var corrected_unwraped_phase = unwraped_phase.map(function(v) {
        return v - correction;
    });
    function unwrapPhase(phases) {
        var N = phases.length;
        var out2 = Float32Array.from({
            length: N
        }, function() {
            return 0;
        });
        if (N === 0) return out2;
        out2[0] = phases[0];
        var offset = 0;
        for(var i = 1; i < N; i++){
            var delta = phases[i] - phases[i - 1];
            if (delta > Math.PI) {
                offset -= 2 * Math.PI;
            } else if (delta < -Math.PI) {
                offset += 2 * Math.PI;
            }
            out2[i] = phases[i] + offset;
        }
        return out2;
    }
    return {
        frequency: frequency,
        magnitude: magnitude,
        phase: corrected_unwraped_phase.map(function(v) {
            return v / Math.PI * 180;
        }),
        peakAt: ir.peakAt,
        sampleRate: ir.sampleRate,
        fftSize: fftSize
    };
}
function groupDelays(fftData) {
    var normalizeAt = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 1e3;
    var frequency = fftData.frequency, phase = fftData.phase, peakAt = fftData.peakAt;
    var N = frequency.length;
    var groupDelay = Float32Array.from({
        length: N
    }, function() {
        return 0;
    });
    for(var i = 1; i < N - 1; i++){
        var dPhase = phase[i] - phase[i - 1];
        var dFreq = frequency[i] - frequency[i - 1];
        groupDelay[i] = -dPhase / dFreq / 360;
    }
    groupDelay[0] = groupDelay[1];
    groupDelay[N - 1] = groupDelay[N - 2];
    var normIdx = closest(normalizeAt, frequency);
    var delayAtNorm = groupDelay[normIdx];
    for(var i1 = 0; i1 < N; i1++){
        groupDelay[i1] = groupDelay[i1] - delayAtNorm;
    }
    return groupDelay;
}
var A_WEIGHTING_COEFFICIENTS = [
    Float32Array.from([
        0.234301792299513,
        -0.468603584599026,
        -0.234301792299513,
        0.937207169198054,
        -0.234301792299515,
        -0.468603584599025,
        0.234301792299513
    ]),
    Float32Array.from([
        1,
        -4.113043408775871,
        6.553121752655047,
        -4.990849294163381,
        1.785737302937573,
        -0.246190595319487,
        0.011224250033231
    ])
];
var K_WEIGHTING_COEFFICIENTS_PRE = [
    Float32Array.from([
        1.53512485958697,
        -2.69169618940638,
        1.19839281085285
    ]),
    Float32Array.from([
        1,
        -1.69065929318241,
        0.73248077421585
    ])
];
var K_WEIGHTING_COEFFICIENTS_RLB = [
    Float32Array.from([
        1,
        -2,
        1
    ]),
    Float32Array.from([
        1,
        -1.99004745483398,
        0.99007225036621
    ])
];
function applyAWeightingToBuffer(buffer, zi) {
    var b = A_WEIGHTING_COEFFICIENTS[0];
    var a = A_WEIGHTING_COEFFICIENTS[1];
    var output = Float32Array.from({
        length: buffer.length
    }, function() {
        return 0;
    });
    for(var n = 0; n < buffer.length; n++){
        output[n] = b[0] * buffer[n] + zi[0];
        for(var i = 1; i < b.length; i++){
            zi[i - 1] = b[i] * buffer[n] + zi[i] - a[i] * output[n];
        }
    }
    return output;
}
function gateBuffer(buffer, sampleRate) {
    var thresholdDb = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : -70, blockMs = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : 400, overlap = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : 0.75;
    var blockSize = Math.floor(blockMs / 1e3 * sampleRate);
    var hopSize = Math.floor(blockSize * (1 - overlap));
    var threshold = dbToLinear(thresholdDb);
    var gated = Float32Array.from({
        length: buffer.length
    }, function() {
        return 0;
    });
    var i = 0;
    while(i < buffer.length){
        var start = i;
        var end = Math.min(i + blockSize, buffer.length);
        var block = buffer.slice(start, end);
        var blockRms = rms(block);
        if (blockRms >= threshold) {
            for(var j = 0; j < block.length; j++){
                gated[start + j] = block[j];
            }
        }
        i += hopSize;
    }
    return gated;
}
var audio = {
    loadAudioFile: loadAudioFile,
    chirp: chirp,
    computeFFT: computeFFT,
    smoothFFT: smoothFFT,
    fftCorrelation: fftCorrelation,
    fftConvolve: fftConvolve,
    twoChannelImpulseResponse: twoChannelImpulseResponse,
    computeFFTFromIR: computeFFTFromIR,
    twoChannelFFT: twoChannelFFT,
    groupDelays: groupDelays,
    applyAWeightingToBuffer: applyAWeightingToBuffer,
    gateBuffer: gateBuffer
};
// src/windows.ts
function hanningWindow(length) {
    var window2 = new Float32Array(length);
    for(var i = 0; i < length; i++){
        window2[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)));
    }
    return window2;
}
function hammingWindow(length) {
    var window2 = new Float32Array(length);
    for(var i = 0; i < length; i++){
        window2[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (length - 1));
    }
    return window2;
}
function blackmanWindow(length) {
    var window2 = new Float32Array(length);
    for(var i = 0; i < length; i++){
        window2[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (length - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (length - 1));
    }
    return window2;
}
function rectangularWindow(length) {
    var window2 = new Float32Array(length);
    window2.fill(1);
    return window2;
}
function getSelectedWindow(windowType, length) {
    var correct = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : true;
    var type = windowType;
    var window2 = new Float32Array(length);
    var wcf = 1;
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
        window2 = window2.map(function(v) {
            return v / wcf;
        });
    }
    return window2;
}
// src/plotting.ts
var COLORS = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
    "#bcbd22",
    "#17becf"
];
function addPlotToList(tabId, plotId, plotName) {
    var hidden = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : false;
    var plotList = document.getElementById("plot-list-".concat(tabId));
    var listItem = document.createElement("li");
    listItem.innerHTML = '<input type="checkbox" id="checkbox-'.concat(plotId, '" alt="show/hide" ').concat(hidden ? "" : "checked", '><label for="checkbox-').concat(plotId, '">').concat(plotName, "</label>");
    plotList.appendChild(listItem);
}
function addPlotElement(tabId, plotId) {
    var hidden = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : false;
    var _tabContent_querySelector;
    var tabContent = document.querySelector('[data-content="'.concat(tabId, '"]'));
    var plotBox = document.createElement("div");
    plotBox.className = "plot-box";
    plotBox.innerHTML = '\n        <div id="'.concat(plotId, '" class="plot-medium"></div>\n        <div class="button-bar">\n            <button>Customize...</button>\n            <button>Export as...</button>   \n            <label for="checkbox-').concat(plotId, '">Hide</label>\n        </div>\n    ');
    (_tabContent_querySelector = tabContent.querySelector(".plot-outer")) === null || _tabContent_querySelector === void 0 ? void 0 : _tabContent_querySelector.appendChild(plotBox);
    if (hidden) {
        plotBox.style.display = "none";
    }
    return plotBox.querySelector("#".concat(plotId));
}
function plot(traces, tabId, title, xTitle, yTitle) {
    var xAxisExtras = arguments.length > 5 && arguments[5] !== void 0 ? arguments[5] : {}, yAxisExtras = arguments.length > 6 && arguments[6] !== void 0 ? arguments[6] : {}, layoutExtras = arguments.length > 7 && arguments[7] !== void 0 ? arguments[7] : {}, hidden = arguments.length > 8 && arguments[8] !== void 0 ? arguments[8] : false;
    var _document_getElementById;
    var plotSettings = {
        plotGlPixelRatio: 2,
        // For better clarity on high-DPI screens
        legend: {
            "orientation": "h",
            "y": -0.2,
            "yanchor": "top"
        },
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
        margin: {
            t: 80,
            r: 65,
            b: 70,
            l: 65
        }
    };
    var layout = _object_spread({
        title: title,
        xaxis: _object_spread({
            title: xTitle,
            gridcolor: "#e1e4e8"
        }, xAxisExtras),
        yaxis: _object_spread({
            title: yTitle,
            gridcolor: "#e1e4e8",
            automargin: true
        }, yAxisExtras)
    }, layoutExtras, plotSettings);
    var plotId = "plot-".concat(tabId, "-").concat(title.toLowerCase().replace(/\s+/g, "-"));
    var element = addPlotElement(tabId, plotId, hidden);
    window.Plotly.newPlot(element, traces, layout, {
        responsive: true
    });
    addPlotToList(tabId, plotId, title, hidden);
    (_document_getElementById = document.getElementById("checkbox-".concat(plotId))) === null || _document_getElementById === void 0 ? void 0 : _document_getElementById.addEventListener("change", function(e) {
        var box = document.getElementById("".concat(plotId)).parentElement;
        box.setAttribute("style", e.target.checked ? "display: block;" : "display: none;");
        window.dispatchEvent(new Event("resize"));
    });
    console.log("Plotted ".concat(title, " in tab ").concat(tabId));
}
// src/farina.ts
var Farina = /*#__PURE__*/ function() {
    function Farina(stimulus) {
        var f_start = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 50, f_stop = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : 22800, fs = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : 48e3;
        _class_call_check(this, Farina);
        this.deconvolved = Float32Array.from([]);
        this.f_start = f_start;
        this.f_stop = f_stop;
        this.fs = fs;
        this.stimulus = stimulus;
        this.duration = (this.stimulus.length - 528) / this.fs;
    }
    _create_class(Farina, [
        {
            key: "lag_of_harmonic",
            value: function lag_of_harmonic(n) {
                return this.ell() * Math.log(n);
            }
        },
        {
            key: "margin_of_harmonic",
            value: function margin_of_harmonic(n) {
                return this.ell() * Math.log(n + 1) - this.ell() * Math.log(n);
            }
        },
        {
            key: "max_safe_harmonic",
            value: function max_safe_harmonic(window_size) {
                var t = [];
                for(var n = 1; n < 1e3; n++){
                    if (this.margin_of_harmonic(n) > window_size) {
                        t.push(this.margin_of_harmonic(n));
                    }
                }
                return t.length < 999 ? t.length : 0;
            }
        },
        {
            key: "ell",
            value: function ell() {
                return this.duration / Math.log(this.f_stop / this.f_start);
            }
        },
        {
            key: "rate",
            value: function rate(length) {
                return 1 / this.f_start * Math.PI * Math.round(length * this.f_start / Math.log2(this.f_stop / this.f_start));
            }
        },
        {
            key: "instant",
            value: function instant() {
                return closest(1e8, this.deconvolved);
            }
        },
        {
            key: "window",
            value: function window1(signal, at, length) {
                var size = Math.floor(length * this.fs);
                var window2 = getSelectedWindow("rectangular", size, false);
                var si = signal.ir.slice(at - size / 2, at + size / 2);
                var w = Float32Array.from({
                    length: size
                }, function() {
                    return 0;
                });
                if (si.length === window2.length) {
                    for(var i = 0; i < window2.length; i++){
                        w[i] = window2[i] * si[i];
                    }
                }
                var ir_complex = Float32Array.from({
                    length: w.length * 2
                }, function() {
                    return 0;
                });
                for(var i1 = 0; i1 < w.length; i1++){
                    ir_complex[2 * i1] = w[i1];
                    ir_complex[2 * i1 + 1] = 0;
                }
                return {
                    ir: w,
                    ir_complex: ir_complex,
                    t: linspace((-size - 1) / 2 / this.fs, (size - 1) / 2 / this.fs, size),
                    peakAt: at,
                    sampleRate: this.fs,
                    fftSize: w.length
                };
            }
        },
        {
            key: "deconvolution",
            value: function deconvolution(signal) {
                var _this = this;
                var n = linspace(0, this.stimulus.length - 1, this.stimulus.length);
                var ell = this.ell();
                var k = n.map(function(v) {
                    return Math.exp(v / ell / _this.fs);
                });
                var inv_stimulus = this.stimulus.slice().reverse().map(function(v, i) {
                    return v / k[i];
                });
                var deconvolved = fftConvolve(signal, inv_stimulus, "same").slice();
                var norm = max(fftConvolve(this.stimulus, inv_stimulus, "same").map(function(v) {
                    return Math.abs(v);
                }));
                this.deconvolved = deconvolved.map(function(v) {
                    return v / norm;
                });
                return this.deconvolved;
            }
        },
        {
            key: "deconvolvedResponse",
            value: function deconvolvedResponse(signal) {
                var ir = this.deconvolution(signal);
                var peakAt = this.instant();
                var ir_complex = Float32Array.from({
                    length: ir.length * 2
                }, function() {
                    return 0;
                });
                for(var i = 0; i < ir.length; i++){
                    ir_complex[2 * i] = ir[i];
                    ir_complex[2 * i + 1] = 0;
                }
                return {
                    ir: ir,
                    ir_complex: ir_complex,
                    t: linspace(-peakAt / this.fs, (-peakAt + ir.length - 1) / this.fs, ir.length),
                    peakAt: peakAt,
                    sampleRate: this.fs,
                    fftSize: ir.length
                };
            }
        },
        {
            key: "harmonics",
            value: function harmonics(windowSize, harmonicsCount) {
                var results = [];
                for(var n = 0; n <= harmonicsCount; n++){
                    var at = Math.round(this.instant() - this.lag_of_harmonic(n + 1) * this.fs);
                    var w = this.window({
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
        }
    ]);
    return Farina;
}();
function plotDistortion(farina, windowSize, maxHarmonics, tabId) {
    var _loop = function(n) {
        var color = COLORS[n % COLORS.length];
        var response = harmonicsFFT[n];
        var smoothedResponse = smoothedHarmonicsFFT[n];
        if (n === 0) {
            traces.push({
                x: response.frequency.map(function(f) {
                    return f / (n + 1);
                }),
                y: db(response.magnitude),
                type: "scatter",
                mode: "lines",
                name: n === 0 ? "Fundamental" : "Harmonic ".concat(n + 1),
                line: {
                    width: 0.75,
                    color: color + "33"
                },
                showlegend: n === 0
            });
        }
        traces.push({
            x: smoothedResponse.frequency.map(function(f) {
                return f / (n + 1);
            }),
            y: db(smoothedResponse.magnitude),
            type: "scatter",
            mode: "lines",
            name: (n === 0 ? "Fundamental" : "Harmonic ".concat(n + 1)) + " (Smoothed)",
            line: {
                width: 1.5,
                color: color
            }
        });
    };
    var harmonics = farina.harmonics(windowSize, maxHarmonics);
    var harmonicsFFT = harmonics.map(function(h, n) {
        return computeFFTFromIR(h, 1e3, 1 / (n + 1));
    });
    var smoothedHarmonicsFFT = harmonicsFFT.map(function(hf) {
        return smoothFFT(hf, 1 / 6, 1 / 96);
    });
    var traces = [];
    for(var n = 0; n < smoothedHarmonicsFFT.length; n++)_loop(n);
    plot(traces, tabId, "Fundamental and Harmonic Distortion", "Frequency (Hz)", "Amplitude (dBFS)", {
        type: "log",
        range: [
            Math.log10(20),
            Math.log10(2e4)
        ]
    }, {
        range: [
            -85,
            5
        ]
    }, {}, false);
}
function plotTHD(farina, windowSize, maxHarmonics, tabId) {
    var harmonics = farina.harmonics(windowSize, maxHarmonics);
    var harmonicsFFT = harmonics.map(function(h, n) {
        return computeFFTFromIR(h, 1e3, 1 / (n + 1));
    });
    var smoothedHarmonicsFFT = harmonicsFFT.map(function(hf) {
        return smoothFFT(hf, 1 / 6, 1 / 96);
    });
    var fundamental = smoothedHarmonicsFFT[0];
    var traces = [];
    var thd = Float32Array.from({
        length: fundamental.magnitude.length
    }, function() {
        return 0;
    });
    for(var i = 0; i < fundamental.magnitude.length; i++){
        var sumSquares = 0;
        for(var n = 1; n < smoothedHarmonicsFFT.length; n++){
            sumSquares += Math.pow(smoothedHarmonicsFFT[n].magnitude[i], 2);
        }
        thd[i] = Math.sqrt(sumSquares) / fundamental.magnitude[i];
    }
    traces.push({
        x: fundamental.frequency,
        y: thd.map(function(v) {
            return v * 100;
        }),
        // Convert to percentage
        type: "scatter",
        mode: "lines",
        name: "Total Harmonic Distortion (THD)",
        line: {
            width: 1.5,
            color: COLORS[0]
        }
    });
    plot(traces, tabId, "Total Harmonic Distortion", "Frequency (Hz)", "THD (%)", {
        type: "log",
        range: [
            Math.log10(20),
            Math.log10(2e4)
        ]
    }, {
        range: [
            0,
            5
        ]
    }, {}, false);
}
// src/storage.ts
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
function removeItem(key) {
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
                    store.delete(key);
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
                    return [
                        3,
                        4
                    ];
                case 3:
                    e = _state.sent();
                    console.error("removeItem(idb) failed", e);
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
function clearStorage() {
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
                    store.clear();
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
                        sessionStorage.clear();
                    } catch (unused) {}
                    return [
                        3,
                        4
                    ];
                case 3:
                    e = _state.sent();
                    console.error("clearStorage(idb) failed", e);
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
function dumpStorage() {
    return _async_to_generator(function() {
        var db2, tx, store, req, e;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    _state.trys.push([
                        0,
                        2,
                        ,
                        3
                    ]);
                    return [
                        4,
                        openIDB()
                    ];
                case 1:
                    db2 = _state.sent();
                    tx = db2.transaction("kv", "readonly");
                    store = tx.objectStore("kv");
                    req = store.openCursor();
                    req.onsuccess = function(event) {
                        var cursor = event.target.result;
                        if (cursor) {
                            console.log("Key: ".concat(cursor.key, ", Value: ").concat(cursor.value.value));
                            cursor.continue();
                        }
                    };
                    req.onerror = function() {
                        console.error("dumpStorage(idb) failed", req.error);
                    };
                    return [
                        3,
                        3
                    ];
                case 2:
                    e = _state.sent();
                    console.error("dumpStorage(idb) failed", e);
                    return [
                        3,
                        3
                    ];
                case 3:
                    return [
                        2
                    ];
            }
        });
    })();
}
var storage = {
    setItem: setItem,
    getItem: getItem,
    removeItem: removeItem,
    clearStorage: clearStorage,
    dumpStorage: dumpStorage
};
// src/device-settings.ts
var INPUT_KEY = "preferredAudioInputId";
var OUTPUT_KEY = "preferredAudioOutputId";
function openDeviceSettings() {
    var modal = document.getElementById("deviceSettingsModal");
    if (modal) {
        modal.style.display = "flex";
        initDeviceSettings();
    }
}
function closeDeviceSettings() {
    var modal = document.getElementById("deviceSettingsModal");
    if (modal) {
        modal.style.display = "none";
    }
}
function ensureDeviceAccess() {
    return _async_to_generator(function() {
        var _;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    _state.trys.push([
                        0,
                        2,
                        ,
                        3
                    ]);
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return [
                        2
                    ];
                    return [
                        4,
                        navigator.mediaDevices.getUserMedia({
                            audio: true,
                            video: false
                        })
                    ];
                case 1:
                    _state.sent();
                    return [
                        3,
                        3
                    ];
                case 2:
                    _ = _state.sent();
                    return [
                        3,
                        3
                    ];
                case 3:
                    return [
                        2
                    ];
            }
        });
    })();
}
function refreshAudioDeviceList() {
    return _async_to_generator(function() {
        var devices, inputSel, outputSel, inputId, outputId, note, sinkSupported;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                        console.warn("MediaDevices API not available");
                        return [
                            2
                        ];
                    }
                    return [
                        4,
                        ensureDeviceAccess()
                    ];
                case 1:
                    _state.sent();
                    return [
                        4,
                        navigator.mediaDevices.enumerateDevices()
                    ];
                case 2:
                    devices = _state.sent();
                    inputSel = document.getElementById("inputDeviceSelect");
                    outputSel = document.getElementById("outputDeviceSelect");
                    if (!inputSel || !outputSel) return [
                        2
                    ];
                    inputSel.innerHTML = '<option value="">Default input</option>';
                    outputSel.innerHTML = '<option value="">Default output</option>';
                    inputId = localStorage.getItem(INPUT_KEY) || "";
                    outputId = localStorage.getItem(OUTPUT_KEY) || "";
                    devices.forEach(function(d) {
                        if (d.kind === "audioinput") {
                            var opt = document.createElement("option");
                            opt.value = d.deviceId;
                            opt.textContent = d.label || "Microphone (".concat(d.deviceId.slice(0, 8), "…)");
                            if (d.deviceId === inputId) opt.selected = true;
                            inputSel.appendChild(opt);
                        } else if (d.kind === "audiooutput") {
                            var opt1 = document.createElement("option");
                            opt1.value = d.deviceId;
                            opt1.textContent = d.label || "Speaker (".concat(d.deviceId.slice(0, 8), "…)");
                            if (d.deviceId === outputId) opt1.selected = true;
                            outputSel.appendChild(opt1);
                        }
                    });
                    note = document.getElementById("sinkSupportNote");
                    if (note) {
                        sinkSupported = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
                        note.textContent = sinkSupported ? "Output routing supported on this browser." : "Output routing (setSinkId) not supported by this browser.";
                    }
                    return [
                        2
                    ];
            }
        });
    })();
}
function applyOutputDevice(deviceId) {
    return _async_to_generator(function() {
        var router, e;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    router = document.getElementById("appOutputRouter");
                    if (!router) return [
                        2
                    ];
                    if (!("setSinkId" in HTMLMediaElement.prototype)) return [
                        3,
                        4
                    ];
                    _state.label = 1;
                case 1:
                    _state.trys.push([
                        1,
                        3,
                        ,
                        4
                    ]);
                    return [
                        4,
                        router.setSinkId(deviceId || "")
                    ];
                case 2:
                    _state.sent();
                    return [
                        3,
                        4
                    ];
                case 3:
                    e = _state.sent();
                    console.warn("Failed to set sinkId:", e);
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
function saveDeviceSelections() {
    var inputSel = document.getElementById("inputDeviceSelect");
    var outputSel = document.getElementById("outputDeviceSelect");
    if (!inputSel || !outputSel) return;
    localStorage.setItem(INPUT_KEY, inputSel.value || "");
    localStorage.setItem(OUTPUT_KEY, outputSel.value || "");
    applyOutputDevice(outputSel.value || "");
    closeDeviceSettings();
}
function initDeviceSettings() {
    return _async_to_generator(function() {
        var inputSel, outputSel;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        refreshAudioDeviceList()
                    ];
                case 1:
                    _state.sent();
                    inputSel = document.getElementById("inputDeviceSelect");
                    outputSel = document.getElementById("outputDeviceSelect");
                    if (!inputSel || !outputSel) return [
                        2
                    ];
                    inputSel.onchange = function() {
                        localStorage.setItem(INPUT_KEY, inputSel.value || "");
                    };
                    outputSel.onchange = function() {
                        localStorage.setItem(OUTPUT_KEY, outputSel.value || "");
                        applyOutputDevice(outputSel.value || "");
                    };
                    return [
                        2
                    ];
            }
        });
    })();
}
if (navigator.mediaDevices && "ondevicechange" in navigator.mediaDevices) {
    navigator.mediaDevices.addEventListener("devicechange", function() {
        var modal = document.getElementById("deviceSettingsModal");
        if (modal && modal.style.display === "flex") {
            refreshAudioDeviceList();
        }
    });
}
document.addEventListener("DOMContentLoaded", function() {
    var outId = localStorage.getItem(OUTPUT_KEY);
    if (outId) applyOutputDevice(outId);
});
window.openDeviceSettings = openDeviceSettings;
window.closeDeviceSettings = closeDeviceSettings;
window.refreshAudioDeviceList = refreshAudioDeviceList;
window.saveDeviceSelections = saveDeviceSelections;
// src/recorder.ts
var AudioRecorder = /*#__PURE__*/ function() {
    function AudioRecorder(audioContext) {
        _class_call_check(this, AudioRecorder);
        this.audioContext = audioContext;
    }
    _create_class(AudioRecorder, [
        {
            key: "record",
            value: function record(durationSec) {
                return _async_to_generator(function() {
                    var recording, pointer, stream, streamSource, worklet;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                recording = [
                                    new Float32Array(durationSec * this.audioContext.sampleRate),
                                    new Float32Array(durationSec * this.audioContext.sampleRate)
                                ];
                                pointer = 0;
                                return [
                                    4,
                                    this.audioContext.audioWorklet.addModule("static/buffering-processor.worklet.js")
                                ];
                            case 1:
                                _state.sent();
                                return [
                                    4,
                                    navigator.mediaDevices.getUserMedia({
                                        audio: {
                                            echoCancellation: false,
                                            noiseSuppression: false,
                                            autoGainControl: false
                                        }
                                    })
                                ];
                            case 2:
                                stream = _state.sent();
                                streamSource = this.audioContext.createMediaStreamSource(stream);
                                worklet = new AudioWorkletNode(this.audioContext, "buffering-processor", {
                                    numberOfInputs: 1,
                                    numberOfOutputs: 0,
                                    processorOptions: {
                                        buffer: null
                                    }
                                });
                                streamSource.connect(worklet);
                                worklet.port.onmessage = function(event) {
                                    if (pointer + event.data.buffer[0].length > recording[0].length) {
                                        worklet.disconnect();
                                        streamSource.disconnect();
                                        return new Promise(function(resolve) {
                                            resolve(recording);
                                        });
                                    }
                                    recording[0].set(event.data.buffer[0], pointer);
                                    recording[1].set(event.data.buffer[1], pointer);
                                    pointer += event.data.buffer[0].length;
                                };
                                return [
                                    2,
                                    new Promise(function(resolve) {
                                        setTimeout(function() {
                                            worklet.disconnect();
                                            streamSource.disconnect();
                                            stream.getTracks().forEach(function(track) {
                                                return track.stop();
                                            });
                                            resolve(recording);
                                        }, durationSec * 1e3);
                                    })
                                ];
                        }
                    });
                }).call(this);
            }
        }
    ]);
    return AudioRecorder;
}();
// src/app.ts
console.debug("App module loaded");
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
responseFileUploadInput.addEventListener("change", function() {
    var _responseFileUploadInput_files;
    analyzeUploadBtn.disabled = !((_responseFileUploadInput_files = responseFileUploadInput.files) === null || _responseFileUploadInput_files === void 0 ? void 0 : _responseFileUploadInput_files.length);
});
function normalizeAngleDeg(angleDeg) {
    var a = angleDeg % 360;
    if (a < 0) a += 360;
    return a;
}
function getPolarMeasurements() {
    var rows = Array.from(polarMeasurementsEl.querySelectorAll(".polar-measurement-row"));
    var out = [];
    var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
    try {
        for(var _iterator = rows[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
            var row = _step.value;
            var _fileInput_files;
            var angleInput = row.querySelector(".polar-angle");
            var fileInput = row.querySelector(".polar-response-file");
            if (!angleInput || !fileInput) continue;
            var file = (_fileInput_files = fileInput.files) === null || _fileInput_files === void 0 ? void 0 : _fileInput_files[0];
            if (!file) continue;
            var parsed = parseFloat(angleInput.value);
            var angleDeg = Number.isFinite(parsed) ? normalizeAngleDeg(parsed) : 0;
            out.push({
                angleDeg: angleDeg,
                file: file
            });
        }
    } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
    } finally{
        try {
            if (!_iteratorNormalCompletion && _iterator.return != null) {
                _iterator.return();
            }
        } finally{
            if (_didIteratorError) {
                throw _iteratorError;
            }
        }
    }
    return out;
}
function updatePolarAnalyzeEnabled() {
    var _polarReferenceFileInput_files;
    var hasReference = !!((_polarReferenceFileInput_files = polarReferenceFileInput.files) === null || _polarReferenceFileInput_files === void 0 ? void 0 : _polarReferenceFileInput_files.length);
    var hasAnyMeasurement = getPolarMeasurements().length > 0;
    analyzePolarBtn.disabled = !(hasReference && hasAnyMeasurement);
    if (!hasReference) {
        polarStatusEl.textContent = "Select a reference/stimulus file.";
    } else if (!hasAnyMeasurement) {
        polarStatusEl.textContent = "Add at least one measurement (angle + file).";
    } else {
        polarStatusEl.textContent = "";
    }
}
function addPolarMeasurementRow() {
    var initialAngleDeg = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 0;
    var row = document.createElement("div");
    row.className = "param-row polar-measurement-row";
    row.innerHTML = '\n        <label>Angle (deg):</label>\n        <input type="number" class="param-input polar-angle" value="'.concat(initialAngleDeg, '" step="1" min="0" max="360">\n        <input type="file" class="polar-response-file" accept="audio/*,.wav,.mp3,.flac,.ogg">\n        <button class="button-custom button-custom-secondary polar-remove" type="button">Remove</button>\n    ');
    polarMeasurementsEl.appendChild(row);
}
polarReferenceFileInput.addEventListener("change", updatePolarAnalyzeEnabled);
addPolarMeasurementBtn.addEventListener("click", function() {
    addPolarMeasurementRow(0);
    updatePolarAnalyzeEnabled();
});
polarMeasurementsEl.addEventListener("input", function(e) {
    var t = e.target;
    if (t.classList.contains("polar-angle")) updatePolarAnalyzeEnabled();
});
polarMeasurementsEl.addEventListener("change", function(e) {
    var t = e.target;
    if (t.classList.contains("polar-response-file")) updatePolarAnalyzeEnabled();
});
polarMeasurementsEl.addEventListener("click", function(e) {
    var t = e.target;
    if (!t.classList.contains("polar-remove")) return;
    var row = t.closest(".polar-measurement-row");
    row === null || row === void 0 ? void 0 : row.remove();
    if (polarMeasurementsEl.querySelectorAll(".polar-measurement-row").length === 0) {
        addPolarMeasurementRow(0);
    }
    updatePolarAnalyzeEnabled();
});
updatePolarAnalyzeEnabled();
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
    return _async_to_generator(function() {
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    if (!acquisitionState.audioContext) {
                        acquisitionState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    }
                    if (!(acquisitionState.audioContext.state === "suspended")) return [
                        3,
                        2
                    ];
                    return [
                        4,
                        acquisitionState.audioContext.resume()
                    ];
                case 1:
                    _state.sent();
                    _state.label = 2;
                case 2:
                    return [
                        2,
                        acquisitionState.audioContext
                    ];
            }
        });
    })();
}
function detectAndSetupChannels() {
    return _async_to_generator(function() {
        var _source_mediaStream_getAudioTracks__getSettings, stream, audioContext, analyser, source, channelCount, i, option, channelNames, error;
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
                        navigator.mediaDevices.getUserMedia({
                            audio: {
                                echoCancellation: false,
                                noiseSuppression: false,
                                autoGainControl: false
                            }
                        })
                    ];
                case 1:
                    stream = _state.sent();
                    return [
                        4,
                        initializeAudioContext()
                    ];
                case 2:
                    audioContext = _state.sent();
                    analyser = audioContext.createAnalyser();
                    source = audioContext.createMediaStreamSource(stream);
                    source.connect(analyser);
                    channelCount = ((_source_mediaStream_getAudioTracks__getSettings = source.mediaStream.getAudioTracks()[0].getSettings()) === null || _source_mediaStream_getAudioTracks__getSettings === void 0 ? void 0 : _source_mediaStream_getAudioTracks__getSettings.channelCount) || 1;
                    stream.getTracks().forEach(function(track) {
                        return track.stop();
                    });
                    channelSelect.innerHTML = "";
                    for(i = 0; i < channelCount; i++){
                        option = document.createElement("option");
                        option.value = i.toString();
                        channelNames = [
                            "Left",
                            "Right",
                            "Center",
                            "LFE",
                            "Back Left",
                            "Back Right"
                        ];
                        option.textContent = "Channel ".concat(i + 1).concat(channelNames[i] ? " (".concat(channelNames[i], ")") : "");
                        channelSelect.appendChild(option);
                    }
                    if (channelCount > 1) {
                        channelSelectionContainer.style.display = "flex";
                    } else {
                        channelSelectionContainer.style.display = "none";
                    }
                    return [
                        3,
                        4
                    ];
                case 3:
                    error = _state.sent();
                    console.error("Error detecting channels:", error);
                    channelSelectionContainer.style.display = "none";
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
tabsContainer.addEventListener("click", function(e) {
    var target = e.target;
    if (target.classList.contains("tab") && target.dataset.tab === "acquisition") {
        detectAndSetupChannels();
    }
});
var recorded = [
    Float32Array.from([]),
    Float32Array.from([])
];
function startRecordingAndPlayback() {
    return _async_to_generator(function() {
        var audioContext, startFreq, endFreq, duration, preRecordTime, postRecordTime, totalRecordTime, _audio_chirp, sweepSignal, audioBuffer, channelData, sourceGain, recorder, error;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    _state.trys.push([
                        0,
                        2,
                        ,
                        3
                    ]);
                    return [
                        4,
                        initializeAudioContext()
                    ];
                case 1:
                    audioContext = _state.sent();
                    startFreq = parseFloat(sweepStartFreqInput.value);
                    endFreq = parseFloat(sweepEndFreqInput.value);
                    duration = parseFloat(sweepDurationInput.value);
                    preRecordTime = 0.5;
                    postRecordTime = 1;
                    totalRecordTime = preRecordTime + duration + postRecordTime;
                    _audio_chirp = _sliced_to_array(audio.chirp(startFreq, endFreq, duration), 2), sweepSignal = _audio_chirp[0];
                    download(sweepSignal, 48e3, "sweep_signal.wav");
                    audioBuffer = audioContext.createBuffer(1, sweepSignal.length, audioContext.sampleRate);
                    channelData = audioBuffer.getChannelData(0);
                    channelData.set(sweepSignal);
                    sourceGain = audioContext.createGain();
                    sourceGain.gain.value = 0.5;
                    recordingStatusEl.textContent = "Recording for ".concat(totalRecordTime.toFixed(1), "s...");
                    recorder = new AudioRecorder(audioContext);
                    recorder.record(totalRecordTime).then(function(recordingData) {
                        recorded = recordingData;
                        stopRecording();
                    });
                    startBtn.disabled = true;
                    stopBtn.disabled = false;
                    playBtn.disabled = true;
                    sweepStartFreqInput.disabled = true;
                    sweepEndFreqInput.disabled = true;
                    sweepDurationInput.disabled = true;
                    setTimeout(function() {
                        acquisitionState.playbackSource = audioContext.createBufferSource();
                        acquisitionState.playbackSource.buffer = audioBuffer;
                        acquisitionState.playbackSource.connect(sourceGain);
                        sourceGain.connect(audioContext.destination);
                        acquisitionState.playbackSource.start();
                    }, preRecordTime * 1e3);
                    setTimeout(function() {
                        stopRecording();
                    }, totalRecordTime * 1e3);
                    return [
                        3,
                        3
                    ];
                case 2:
                    error = _state.sent();
                    console.error("Error starting recording:", error);
                    recordingStatusEl.textContent = "Error: ".concat(error.message);
                    recordingStatusEl.style.color = "#d73a49";
                    return [
                        3,
                        3
                    ];
                case 3:
                    return [
                        2
                    ];
            }
        });
    })();
}
function playbackOnly() {
    return _async_to_generator(function() {
        var audioContext, startFreq, endFreq, duration, _audio_chirp, sweepSignal, audioBuffer, channelData, sourceGain, error;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    _state.trys.push([
                        0,
                        2,
                        ,
                        3
                    ]);
                    return [
                        4,
                        initializeAudioContext()
                    ];
                case 1:
                    audioContext = _state.sent();
                    startFreq = parseFloat(sweepStartFreqInput.value);
                    endFreq = parseFloat(sweepEndFreqInput.value);
                    duration = parseFloat(sweepDurationInput.value);
                    _audio_chirp = _sliced_to_array(audio.chirp(startFreq, endFreq, duration), 1), sweepSignal = _audio_chirp[0];
                    audioBuffer = audioContext.createBuffer(1, sweepSignal.length, audioContext.sampleRate);
                    channelData = audioBuffer.getChannelData(0);
                    channelData.set(sweepSignal);
                    sourceGain = audioContext.createGain();
                    sourceGain.gain.value = 0.5;
                    acquisitionState.playbackSource = audioContext.createBufferSource();
                    acquisitionState.playbackSource.buffer = audioBuffer;
                    acquisitionState.playbackSource.connect(sourceGain);
                    sourceGain.connect(audioContext.destination);
                    acquisitionState.playbackSource.start();
                    recordingStatusEl.textContent = "Playing sweep...";
                    recordingStatusEl.style.color = "#0366d6";
                    playBtn.disabled = true;
                    stopPlayBtn.disabled = false;
                    setTimeout(function() {
                        stopPlayback();
                    }, (duration + 0.5) * 1e3);
                    return [
                        3,
                        3
                    ];
                case 2:
                    error = _state.sent();
                    console.error("Error during playback:", error);
                    recordingStatusEl.textContent = "Error: ".concat(error.message);
                    recordingStatusEl.style.color = "#d73a49";
                    return [
                        3,
                        3
                    ];
                case 3:
                    return [
                        2
                    ];
            }
        });
    })();
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
        } catch (e) {}
    }
    recordingStatusEl.textContent = "Playback stopped.";
    playBtn.disabled = false;
    stopPlayBtn.disabled = true;
}
var measurementAngleInput = document.getElementById("measurementAngle");
var measurementLocationInput = document.getElementById("measurementLocation");
var measurementCommentInput = document.getElementById("measurementComment");
var downloadRecordingBtn = document.getElementById("downloadRecordingBtn");
downloadRecordingBtn === null || downloadRecordingBtn === void 0 ? void 0 : downloadRecordingBtn.addEventListener("click", function() {
    try {
        download(recorded[0], 48e3, "recorded_audio.wav", {}, convertToIXML("\n        <ANGLE>".concat(measurementAngleInput.value, "</ANGLE>\n        <LOCATION>").concat(measurementLocationInput.value, "</LOCATION>\n        <COMMENT>").concat(measurementCommentInput.value, "</COMMENT>\n        <STIMULUS>\n            <TYPE>chirp</TYPE>\n            <START>").concat(sweepStartFreqInput.value, "</START>\n            <END>").concat(sweepEndFreqInput.value, "</END>\n            <FADE>0.01</FADE>\n            <DURATION>").concat(sweepDurationInput.value, "</DURATION>\n            <SAMPLE_RATE>48000</SAMPLE_RATE>\n        </STIMULUS>\n        <ORIGIN>Acquisition Module</ORIGIN>")));
    } catch (err) {
        console.error("Failed to create/download recording:", err);
        alert("Failed to download recording: " + err.message);
    }
});
var downloadSweepBtn = document.getElementById("downloadSweepBtn");
downloadSweepBtn === null || downloadSweepBtn === void 0 ? void 0 : downloadSweepBtn.addEventListener("click", function() {
    try {
        download(recorded[0], 48e3, "reference_audio.wav", {}, convertToIXML("\n        <STIMULUS>\n            <TYPE>chirp</TYPE>\n            <START>".concat(sweepStartFreqInput.value, "</START>\n            <END>").concat(sweepEndFreqInput.value, "</END>\n            <FADE>0.01</FADE>\n            <DURATION>").concat(sweepDurationInput.value, "</DURATION>\n            <SAMPLE_RATE>48000</SAMPLE_RATE>\n        </STIMULUS>\n        <ORIGIN>Acquisition Module</ORIGIN>")));
    } catch (err) {
        console.error("Failed to create/download recording:", err);
        alert("Failed to download recording: " + err.message);
    }
});
startBtn.addEventListener("click", startRecordingAndPlayback);
stopBtn.addEventListener("click", stopRecording);
playBtn.addEventListener("click", playbackOnly);
stopPlayBtn.addEventListener("click", stopPlayback);
analyzeRecordingBtn.addEventListener("click", function() {
    return _async_to_generator(function() {
        var recordedAudio, startFreq, endFreq, duration, _audio_chirp, sweepSignal, referenceAudio, now, dateTime, recordingName;
        return _ts_generator(this, function(_state) {
            console.log("Analyzing recording...");
            try {
                recordedAudio = Audio.fromSamples(recorded[0], 48e3);
                startFreq = parseFloat(sweepStartFreqInput.value);
                endFreq = parseFloat(sweepEndFreqInput.value);
                duration = parseFloat(sweepDurationInput.value);
                _audio_chirp = _sliced_to_array(audio.chirp(startFreq, endFreq, duration), 1), sweepSignal = _audio_chirp[0];
                referenceAudio = Audio.fromSamples(sweepSignal, 48e3);
                now = /* @__PURE__ */ new Date();
                dateTime = now.toLocaleString("sv-SE", {
                    year: "2-digit",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false
                }).replace(",", "");
                recordingName = "".concat(dateTime);
                createAnalysisTab(recordedAudio.applyGain(1 / 16384), referenceAudio.applyGain(1 / 16384), recordingName, "".concat(startFreq, "-").concat(endFreq, "Hz"));
            } catch (error) {
                console.error("Error analyzing recording:", error);
                alert("Error analyzing recording: " + error.message);
            }
            return [
                2
            ];
        });
    })();
});
window.addEventListener("beforeunload", function(e) {
    try {
        saveState();
    } catch (err) {
        console.error("Failed to save state on beforeunload:", err);
    }
});
tabsContainer.addEventListener("click", function(e) {
    var target = e.target;
    if (target.classList.contains("tab-close")) {
        var _document_querySelector;
        var tab = target.parentElement;
        var tabId = tab.dataset.tab;
        if (tabId == "upload") return;
        console.debug("Closing tab", tabId);
        tab.remove();
        (_document_querySelector = document.querySelector('[data-content="'.concat(tabId, '"]'))) === null || _document_querySelector === void 0 ? void 0 : _document_querySelector.remove();
        storage.removeItem("analysis-".concat(tabId)).catch(function(err) {
            return console.error("Failed to remove analysis from storage:", err);
        });
        if (tab.classList.contains("active")) {
            switchTab("upload");
        }
        saveState();
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
analyzeUploadBtn.addEventListener("click", function() {
    return _async_to_generator(function() {
        var _responseFileUploadInput_files, _referenceFileUploadInput_files, responseFile, referenceFile, responseData, referenceData, _tmp, error;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    responseFile = (_responseFileUploadInput_files = responseFileUploadInput.files) === null || _responseFileUploadInput_files === void 0 ? void 0 : _responseFileUploadInput_files[0];
                    referenceFile = (_referenceFileUploadInput_files = referenceFileUploadInput.files) === null || _referenceFileUploadInput_files === void 0 ? void 0 : _referenceFileUploadInput_files[0];
                    if (!responseFile) return [
                        2
                    ];
                    analyzeUploadBtn.disabled = true;
                    analyzeUploadBtn.textContent = "Analyzing...";
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
                        audio.loadAudioFile(responseFile)
                    ];
                case 2:
                    responseData = _state.sent();
                    if (!referenceFile) return [
                        3,
                        4
                    ];
                    return [
                        4,
                        audio.loadAudioFile(referenceFile)
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
                    createAnalysisTab(responseData.applyGain(1 / 16384), referenceData ? referenceData.applyGain(1 / 16384) : null, responseFile.name, (referenceFile === null || referenceFile === void 0 ? void 0 : referenceFile.name) || null);
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
                    analyzeUploadBtn.disabled = false;
                    analyzeUploadBtn.textContent = "Analyze Frequency Response";
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
analyzePolarBtn.addEventListener("click", function() {
    return _async_to_generator(function() {
        var _polarReferenceFileInput_files, referenceFile, measurements, oldText, referenceData, loaded, responseAudios, anglesDeg, error;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    referenceFile = (_polarReferenceFileInput_files = polarReferenceFileInput.files) === null || _polarReferenceFileInput_files === void 0 ? void 0 : _polarReferenceFileInput_files[0];
                    if (!referenceFile) return [
                        2
                    ];
                    measurements = getPolarMeasurements();
                    if (measurements.length === 0) {
                        alert("Please add at least one measurement (angle + file).");
                        return [
                            2
                        ];
                    }
                    oldText = analyzePolarBtn.textContent || "Analyze Polar Directivity";
                    analyzePolarBtn.disabled = true;
                    analyzePolarBtn.textContent = "Analyzing...";
                    _state.label = 1;
                case 1:
                    _state.trys.push([
                        1,
                        4,
                        5,
                        6
                    ]);
                    return [
                        4,
                        audio.loadAudioFile(referenceFile)
                    ];
                case 2:
                    referenceData = _state.sent().applyGain(1 / 16384);
                    return [
                        4,
                        Promise.all(measurements.map(function(m) {
                            return _async_to_generator(function() {
                                var _tmp;
                                return _ts_generator(this, function(_state) {
                                    switch(_state.label){
                                        case 0:
                                            _tmp = {
                                                angleDeg: m.angleDeg
                                            };
                                            return [
                                                4,
                                                audio.loadAudioFile(m.file)
                                            ];
                                        case 1:
                                            return [
                                                2,
                                                (_tmp.audio = _state.sent().applyGain(1 / 16384), _tmp)
                                            ];
                                    }
                                });
                            })();
                        }))
                    ];
                case 3:
                    loaded = _state.sent();
                    loaded.sort(function(a, b) {
                        return a.angleDeg - b.angleDeg;
                    });
                    responseAudios = loaded.map(function(x) {
                        return x.audio;
                    });
                    anglesDeg = loaded.map(function(x) {
                        return x.angleDeg;
                    });
                    createDirectivityPlotTab(responseAudios, referenceData, anglesDeg);
                    return [
                        3,
                        6
                    ];
                case 4:
                    error = _state.sent();
                    alert("Error analyzing polar files: " + error.message);
                    return [
                        3,
                        6
                    ];
                case 5:
                    analyzePolarBtn.textContent = oldText;
                    updatePolarAnalyzeEnabled();
                    return [
                        7
                    ];
                case 6:
                    return [
                        2
                    ];
            }
        });
    })();
});
function createAnalysisTab(responseData, referenceData, filename, referenceFilename) {
    var _document_getElementById;
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
    tab.innerHTML = '<span class="tab-icon-analysis"></span>'.concat(shortName, ' <span class="tab-close">✕</span>');
    tabsInnerContainer.appendChild(tab);
    var content = document.createElement("div");
    content.className = "tab-content";
    content.dataset.content = tabId;
    content.innerHTML = '\n    <!-- nav class="tab-menu-bar">\n                <div>\n                    <label for="smoothing-'.concat(tabId, '">Smoothing</label>\n                    <select id="smoothing-').concat(tabId, '" class="smoothing-select" aria-label="Smoothing factor">\n                        <option value="0">None</option>\n                        <option value="1/3">1/3 octave</option>\n                        <option value="1/6" selected>1/6 octave</option>\n                        <option value="1/12">1/12 octave</option>\n                        <option value="1/24">1/24 octave</option>\n                        <option value="1/48">1/48 octave</option>\n                    </select>\n                </div>\n            </nav> <h5 class="text-xs italic text-gray-600">Frequency Response Analysis of ').concat(filename).concat(referenceFilename ? " / " + referenceFilename : "", '</h5 -->\n        <button class="sidecar-toggle" id="sidebar-toggle-').concat(tabId, '" title="Toggle Sidecar">Open settings pane</button>\n        <div class="flex h-full">\n            <div class="flex-none w-86 border-r border-[#ddd] p-2 relative sidecar" style="transition:50ms linear;">\n                <div class="section">\n                    <div class="title">Settings</div>\n                    <p><i>There are no settings for this analysis.</i></p>\n                </div>\n                <div class="section">\n                    <div class="title">Plots</div>\n                    <ul class="list" id="plot-list-').concat(tabId, '">\n                        <!--li><input type="checkbox" id="checkbox-magnitude-').concat(tabId, '" alt="show/hide" checked><label for="checkbox-magnitude-').concat(tabId, '">Magnitude</label></li>\n                        <li><input type="checkbox" id="checkbox-phase-').concat(tabId, '" alt="show/hide" checked><label for="checkbox-phase-').concat(tabId, '">Phase</label></li>\n                        <li><input type="checkbox" id="checkbox-ir-').concat(tabId, '" alt="show/hide" checked><label for="checkbox-ir-').concat(tabId, '">Impulse Response</label></li>\n                        <li><input type="checkbox" id="checkbox-ir-').concat(tabId, '" alt="show/hide" disabled><label for="checkbox-ir-').concat(tabId, '">Fundamental + Harmonic Distortion</label></li>\n                        <li><input type="checkbox" id="checkbox-distortion-').concat(tabId, '" alt="show/hide" disabled><label for="checkbox-distortion-').concat(tabId, '">Distortion</label></li>\n                        <li><input type="checkbox" id="checkbox-distortion-').concat(tabId, '" alt="show/hide" disabled><label for="checkbox-distortion-').concat(tabId, '">Sound Pressure Level</label></li>\n                        <li><input type="checkbox" id="checkbox-deconvoluted-ir-').concat(tabId, '" alt="show/hide" disabled><label for="checkbox-deconvoluted-ir-').concat(tabId, '">Deconvoluted Impulse Response</label></li>\n                        <li><input type="checkbox" id="checkbox-stimulus-waveform-').concat(tabId, '" alt="show/hide" disabled><label for="checkbox-stimulus-waveform-').concat(tabId, '">Stimulus Waveform</label></li>\n                        <li><input type="checkbox" id="checkbox-recorded-waveform-').concat(tabId, '" alt="show/hide" disabled><label for="checkbox-recorded-waveform-').concat(tabId, '">Recorded Waveform</label></li>\n                        <li><input type="checkbox" id="checkbox-recorded-noise-floor-').concat(tabId, '" alt="show/hide" disabled><label for="checkbox-recorded-noise-floor-').concat(tabId, '">Recorded Noise Floor</label></li>\n                        <li><input type="checkbox" id="checkbox-target-curve-').concat(tabId, '" alt="show/hide" disabled><label for="checkbox-target-curve-').concat(tabId, '">Target Curve<button class="float-right text-xs cursor-pointer" style="color: #bbb; padding-top: 3px">Set</button></label></li-->\n                    </ul>\n                </div>\n                <div class="section">\n                    <div class="title">Properties</div>\n                    <p id="properties-').concat(tabId, '"><i>There are no properties for this analysis.</i></p>\n                </div>\n                <div id="resize-handle" class="resize-handle"></div>\n            </div>\n            <div class="flex-1 main-content">\n                <div class="grid grid-cols-6 gap-[1px] bg-[#ddd] border-b border-[#ddd] plot-outer">\n                </div>\n            </div>\n        </div>\n       \n        \n    ');
    tabContents.appendChild(content);
    var propertiesElement = document.getElementById("properties-".concat(tabId));
    if (propertiesElement) {
        var _responseData_metadata;
        propertiesElement.innerHTML = "\n            <b>Filename:</b> ".concat(filename, "<br>\n            ").concat(referenceFilename ? "<b>Reference Filename:</b> ".concat(referenceFilename, "<br>") : "", "\n            <b>Sample Rate:</b> ").concat(responseData.sampleRate, " Hz<br>\n            <b>Channels:</b> ").concat(responseData.numberOfChannels, "<br>\n            <b>Duration:</b> ").concat(responseData.duration.toFixed(2), " s<br>\n            <b>RMS Level:</b> ").concat(db(rms(responseData.getChannelData(0))), " dBFS<br>\n            <b>Peak Level:</b> ").concat(db(max(responseData.getChannelData(0))), " dBFS<br>\n            <iXML Metadata:</i><br>\n            <pre>").concat((((_responseData_metadata = responseData.metadata) === null || _responseData_metadata === void 0 ? void 0 : _responseData_metadata.iXMLdata) || "").replaceAll("<", "&lt;").replaceAll(">", "&gt;"), "</pre>\n            ");
    }
    var sidebarToggleBtn = document.getElementById("sidebar-toggle-".concat(tabId));
    var sidecar = content.querySelector(".sidecar");
    var resizeHandle = content.querySelector("#resize-handle");
    sidebarToggleBtn.addEventListener("click", function() {
        if (sidecar.style.width === "0px") {
            sidecar.style.width = "21.5rem";
            sidebarToggleBtn.title = "Close settings pane";
        } else {
            sidecar.style.width = "0px";
            sidebarToggleBtn.title = "Open settings pane";
        }
    });
    var isResizing = false;
    var lastDownX = 0;
    resizeHandle.addEventListener("mousedown", function(e) {
        isResizing = true;
        lastDownX = e.clientX;
        document.body.style.cursor = "ew-resize";
        e.preventDefault();
    });
    document.addEventListener("mousemove", function(e) {
        if (!isResizing) return;
        var offsetRight = tabsContainer.clientWidth - e.clientX;
        var newWidth = tabsContainer.clientWidth - offsetRight;
        if (newWidth >= 200 && newWidth <= 600) {
            sidecar.style.width = "".concat(newWidth, "px");
        }
        e.preventDefault();
    });
    document.addEventListener("mouseup", function() {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = "default";
        }
    });
    switchTab(tabId);
    var responseSamples = responseData.getChannelData(0);
    var responseFFT = computeFFT(responseSamples);
    var smoothedResponseFFT = smoothFFT(responseFFT, 1 / 6, 1 / 48);
    var referenceSamples = Float32Array.from([]);
    plot([
        {
            x: responseFFT.frequency,
            y: db(responseFFT.magnitude),
            name: "Recorded signal",
            line: {
                color: "#0366d666",
                width: 0.75
            }
        },
        {
            x: smoothedResponseFFT.frequency,
            y: db(smoothedResponseFFT.magnitude),
            name: "Recorded signal (Smoothed)",
            line: {
                color: "#0366d6",
                width: 1.5
            }
        }
    ], tabId, "Recorded Spectrum", "Frequency (Hz)", "Amplitude (dBFS)", {
        type: "log",
        range: [
            Math.log10(20),
            Math.log10(2e4)
        ]
    }, {
        range: [
            -85,
            5
        ]
    }, {}, true);
    plot([
        {
            x: linspace(0, responseSamples.length / 48e3, responseSamples.length),
            y: responseSamples,
            name: "Recorded signal",
            line: {
                color: "#0366d6ff",
                width: 0.75
            }
        }
    ], tabId, "Recorded Waveform", "Time (s)", "Amplitude", {}, {}, {}, true);
    if (referenceData) {
        referenceSamples = referenceData.getChannelData(0);
        var referenceFFT = computeFFT(referenceSamples);
        var smoothedReferenceFFT = smoothFFT(referenceFFT, 1 / 6, 1 / 48);
        plot([
            {
                x: referenceFFT.frequency,
                y: db(referenceFFT.magnitude),
                name: "Stimulus signal",
                line: {
                    color: "#0366d666",
                    width: 0.75
                }
            },
            {
                x: smoothedReferenceFFT.frequency,
                y: db(smoothedReferenceFFT.magnitude),
                name: "Stimulus signal (Smoothed)",
                line: {
                    color: "#0366d6",
                    width: 1.5
                }
            }
        ], tabId, "Stimulus Spectrum", "Frequency (Hz)", "Amplitude (dBFS)", {
            type: "log",
            range: [
                Math.log10(20),
                Math.log10(2e4)
            ]
        }, {
            range: [
                -85,
                5
            ]
        }, {}, true);
        plot([
            {
                x: linspace(0, referenceSamples.length / 48e3, referenceSamples.length),
                y: referenceSamples,
                name: "Stimulus signal",
                line: {
                    color: "#0366d6ff",
                    width: 0.75
                }
            }
        ], tabId, "Stimulus Waveform", "Time (s)", "Amplitude", {}, {}, {}, true);
        var ir = twoChannelImpulseResponse(responseSamples, referenceSamples);
        var farina = new Farina(referenceSamples, 20, 2e4, 48e3);
        var farina_ir = farina.deconvolvedResponse(responseSamples);
        plotDistortion(farina, 0.1, 5, tabId);
        plotTHD(farina, 0.1, 5, tabId);
        console.log("Impulse response peak at", farina.lag_of_harmonic(2));
        plot([
            {
                x: ir.t,
                y: ir.ir,
                type: "scatter",
                mode: "lines",
                name: "Dual-FFT Impulse Response",
                line: {
                    color: COLORS[0],
                    width: 0.75
                }
            }
        ], tabId, "Impulse Response", "Time (s)", "Amplitude", {}, {}, {}, false);
        plot([
            {
                x: [
                    -max(farina_ir.t),
                    max(farina_ir.t)
                ],
                y: [
                    -200,
                    -200
                ],
                showlegend: false
            },
            {
                x: farina_ir.t,
                y: db(farina_ir.ir.map(function(x) {
                    return Math.abs(x);
                })),
                type: "scatter",
                mode: "lines",
                fill: "tonexty",
                name: "Farina Impulse Response",
                line: {
                    color: COLORS[0],
                    width: 0.75
                },
                fillcolor: COLORS[0]
            },
            {
                x: [
                    -0.05,
                    -0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "Fundamental window start",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    0.05,
                    0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "Fundamental window end",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    -farina.lag_of_harmonic(2) - 0.05,
                    -farina.lag_of_harmonic(2) - 0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "H2 window start",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    -farina.lag_of_harmonic(2) + 0.05,
                    -farina.lag_of_harmonic(2) + 0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "H2 window end",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    -farina.lag_of_harmonic(3) - 0.05,
                    -farina.lag_of_harmonic(3) - 0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "H3 window start",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    -farina.lag_of_harmonic(3) + 0.05,
                    -farina.lag_of_harmonic(3) + 0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "H3 window end",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    -farina.lag_of_harmonic(4) - 0.05,
                    -farina.lag_of_harmonic(4) - 0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "H4 window start",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    -farina.lag_of_harmonic(4) + 0.05,
                    -farina.lag_of_harmonic(4) + 0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "H4 window end",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    -farina.lag_of_harmonic(5) - 0.05,
                    -farina.lag_of_harmonic(5) - 0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "H5 window start",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    -farina.lag_of_harmonic(5) + 0.05,
                    -farina.lag_of_harmonic(5) + 0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "H5 window end",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    -farina.lag_of_harmonic(6) - 0.05,
                    -farina.lag_of_harmonic(6) - 0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "H6 window start",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    -farina.lag_of_harmonic(6) + 0.05,
                    -farina.lag_of_harmonic(6) + 0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "H6 window end",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    -farina.lag_of_harmonic(7) - 0.05,
                    -farina.lag_of_harmonic(7) - 0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "H7 window start",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            },
            {
                x: [
                    -farina.lag_of_harmonic(7) + 0.05,
                    -farina.lag_of_harmonic(7) + 0.05
                ],
                y: [
                    -999,
                    999
                ],
                type: "scatter",
                mode: "lines",
                name: "H7 window end",
                line: {
                    color: "#00000033",
                    width: 0.75
                },
                hoverinfo: "skip",
                showlegend: false
            }
        ], tabId, "Deconvolved Response", "Time (s)", "Amplitude", {
            range: [
                -1,
                1
            ]
        }, {
            range: [
                -150,
                10
            ]
        }, {}, false);
        var transferFunction = computeFFTFromIR(ir);
        var smoothedFreqResponse = smoothFFT(transferFunction, 1 / 6, 1 / 48);
        var gd = groupDelays(transferFunction, 1e3);
        plot([
            {
                x: transferFunction.frequency,
                y: db(transferFunction.magnitude),
                name: "Magnitude",
                line: {
                    color: "#0366d666",
                    width: 0.75
                }
            },
            {
                x: smoothedFreqResponse.frequency,
                y: db(smoothedFreqResponse.magnitude),
                name: "Magnitude (Smoothed)",
                line: {
                    color: "#0366d6",
                    width: 1.5
                }
            }
        ], tabId, "Transfer Function", "Frequency (Hz)", "Amplitude (dBFS)", {
            type: "log",
            range: [
                Math.log10(20),
                Math.log10(2e4)
            ]
        }, {
            range: [
                -85,
                5
            ]
        }, {}, false);
        plot([
            {
                x: transferFunction.frequency,
                y: transferFunction.phase,
                name: "Phase",
                line: {
                    color: "#0366d666",
                    width: 0.75
                }
            },
            {
                x: smoothedFreqResponse.frequency,
                y: smoothedFreqResponse.phase,
                name: "Phase (Smoothed)",
                line: {
                    color: "#0366d6",
                    width: 1.5
                }
            }
        ], tabId, "Phase", "Frequency (Hz)", "Amplitude (dBFS)", {
            type: "log",
            range: [
                Math.log10(20),
                Math.log10(2e4)
            ]
        }, {
            range: [
                -720,
                720
            ]
        }, {}, false);
        plot([
            {
                x: transferFunction.frequency,
                y: gd,
                name: "Group Delay",
                line: {
                    color: COLORS[0],
                    width: 1.5,
                    dash: "dot"
                }
            }
        ], tabId, "Group Delay", "Frequency (Hz)", "Group Delay (ms)", {
            type: "log",
            range: [
                Math.log10(20),
                Math.log10(2e4)
            ]
        }, {
            range: [
                -20,
                20
            ]
        }, {}, false);
        (function() {
            var _ref, _responseData_sampleRate;
            var sr = (_ref = (_responseData_sampleRate = responseData.sampleRate) !== null && _responseData_sampleRate !== void 0 ? _responseData_sampleRate : referenceData === null || referenceData === void 0 ? void 0 : referenceData.sampleRate) !== null && _ref !== void 0 ? _ref : 48e3;
            var n = responseSamples.length;
            if (n < 4096) return;
            var windowSize = 2048;
            var targetFrames = 320;
            var minHop = 256;
            var rawFrames = Math.max(1, Math.floor((n - windowSize) / minHop) + 1);
            var hop = rawFrames > targetFrames ? Math.max(minHop, Math.ceil((n - windowSize) / targetFrames)) : minHop;
            var frames = Math.max(1, Math.floor((n - windowSize) / hop) + 1);
            var win = new Float32Array(windowSize);
            for(var i = 0; i < windowSize; i++){
                win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSize - 1)));
            }
            var firstFrame = new Float32Array(windowSize);
            firstFrame.set(responseSamples.subarray(0, windowSize));
            for(var i1 = 0; i1 < windowSize; i1++)firstFrame[i1] *= win[i1];
            var firstFFT = computeFFT(firstFrame);
            var freqs = Array.from(firstFFT.frequency);
            var bins = freqs.length;
            var z = Array.from({
                length: bins
            }, function() {
                return [];
            });
            var times = [];
            for(var frame = 0; frame < frames; frame++){
                var start = frame * hop;
                var slice = responseSamples.subarray(start, start + windowSize);
                var windowed = new Float32Array(windowSize);
                windowed.set(slice);
                for(var i2 = 0; i2 < windowSize; i2++)windowed[i2] *= win[i2];
                var fft = computeFFT(windowed);
                var magDb = db(fft.magnitude);
                for(var k = 0; k < bins; k++){
                    z[k].push(magDb[k]);
                }
                times.push((start + windowSize / 2) / sr);
            }
            plot([
                {
                    type: "heatmap",
                    x: times,
                    y: freqs,
                    z: z,
                    colorscale: "Electric",
                    zmin: -120,
                    zmax: 0,
                    colorbar: {
                        title: "dBFS"
                    }
                }
            ], tabId, "Recorded Spectrogram", "Time (s)", "Frequency (Hz)", {}, {
                type: "log",
                range: [
                    Math.log10(20),
                    Math.log10(2e4)
                ]
            }, {
                margin: {
                    l: 60,
                    r: 20,
                    t: 40,
                    b: 50
                }
            }, false);
        })();
    }
    saveState();
    storage.setItem("".concat(tabId), JSON.stringify({
        filename: filename,
        referenceFilename: referenceFilename,
        responseSamples: Array.from(responseSamples),
        referenceSamples: referenceSamples.length > 0 ? Array.from(referenceSamples) : null
    })).catch(function(err) {
        return console.error("Failed to persist analysis:", err);
    });
    function initResize(e) {
        e.preventDefault();
        window.addEventListener("mousemove", resize, false);
        window.addEventListener("mouseup", stopResize, false);
        console.log("Init resize");
        document.body.style.cursor = "col-resize";
    }
    function resize(e) {
        var _document_getElementById;
        var container = content.querySelector(".flex");
        var handle = (_document_getElementById = document.getElementById("resize-handle")) === null || _document_getElementById === void 0 ? void 0 : _document_getElementById.parentElement;
        var rect = container.getBoundingClientRect();
        var newWidth = e.clientX - rect.left;
        if (newWidth > 150 && newWidth < rect.width - 150) {
            handle.style.width = "".concat(newWidth, "px");
        }
    }
    function stopResize() {
        window.removeEventListener("mousemove", resize, false);
        window.removeEventListener("mouseup", stopResize, false);
        window.dispatchEvent(new Event("resize"));
        document.body.style.cursor = "default";
    }
    (_document_getElementById = document.getElementById("resize-handle")) === null || _document_getElementById === void 0 ? void 0 : _document_getElementById.addEventListener("mousedown", initResize, false);
}
function createDirectivityPlotTab(responseDatas, referenceData, anglesDeg) {
    var _transfers_;
    if (responseDatas.length === 0 || referenceData.length === 0) return;
    tabCounter++;
    var directivityTabId = "directivity-".concat(tabCounter);
    var shortName = "Directivity (".concat(responseDatas.length, ")");
    var tab = document.createElement("button");
    tab.className = "tab tab-closable";
    tab.dataset.tab = directivityTabId;
    tab.innerHTML = '<span class="tab-icon-analysis"></span>'.concat(shortName, ' <span class="tab-close">✕</span>');
    tabsInnerContainer.appendChild(tab);
    var content = document.createElement("div");
    content.className = "tab-content";
    content.dataset.content = directivityTabId;
    content.innerHTML = '\n        <div class="flex h-full">\n        <div class="flex-1 main-content">\n            <div class="grid grid-cols-6 gap-[1px] bg-[#ddd] border-b border-[#ddd] plot-outer"></div>\n        </div>\n        </div>\n    ';
    tabContents.appendChild(content);
    switchTab(directivityTabId);
    var useCustomAngles = !!anglesDeg && anglesDeg.length === responseDatas.length;
    var angles = useCustomAngles ? anglesDeg.map(normalizeAngleDeg) : responseDatas.map(function(_, i) {
        return 360 * i / responseDatas.length;
    });
    var referenceSamples = Float32Array.from(referenceData.getChannelData(0));
    var transfers = responseDatas.map(function(resp) {
        var len = Math.min(resp.getChannelData(0).length, referenceSamples.length);
        var ir = twoChannelImpulseResponse(resp.getChannelData(0).subarray(0, len), referenceSamples.subarray(0, len));
        return smoothFFT(computeFFTFromIR(ir), 1 / 3, 1 / 48);
    });
    var baseFreq = (_transfers_ = transfers[0]) === null || _transfers_ === void 0 ? void 0 : _transfers_.frequency;
    if (!baseFreq || baseFreq.length === 0) return;
    var normHz = 1e3;
    var normIdx = 0;
    var best = Number.POSITIVE_INFINITY;
    for(var i = 0; i < baseFreq.length; i++){
        var d = Math.abs(baseFreq[i] - normHz);
        if (d < best) {
            best = d;
            normIdx = i;
        }
    }
    transfers.push(transfers[0]);
    angles.push(360);
    var z = transfers.map(function(tf) {
        var _magDb_normIdx;
        var magDb = db(tf.magnitude);
        var ref = (_magDb_normIdx = magDb[normIdx]) !== null && _magDb_normIdx !== void 0 ? _magDb_normIdx : 0;
        return magDb.map(function(v) {
            return v - ref;
        });
    });
    plot([
        {
            type: "heatmap",
            x: Array.from(baseFreq),
            y: angles,
            z: z,
            colorscale: "Jet",
            zmin: -50,
            zmax: 0,
            colorbar: {
                title: "dB (norm @ 1 kHz)"
            }
        }
    ], directivityTabId, "Directivity Map", "Frequency (Hz)", "Angle (deg)", {
        type: "log",
        range: [
            Math.log10(20),
            Math.log10(2e4)
        ]
    }, {
        range: [
            0,
            360
        ]
    }, {
        margin: {
            l: 60,
            r: 20,
            t: 40,
            b: 50
        }
    }, false);
}
function saveState() {
    var tabs = Array.from(document.querySelectorAll(".tab[data-tab]")).map(function(tab) {
        var _tab_textContent;
        return {
            id: tab.dataset.tab,
            name: (_tab_textContent = tab.textContent) === null || _tab_textContent === void 0 ? void 0 : _tab_textContent.replace("\xD7", "").trim()
        };
    });
    storage.setItem("tabs", JSON.stringify(tabs));
    console.log("Saved state with tabs:", tabs);
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
                        storage.getItem("tabs")
                    ];
                case 1:
                    savedTabs = _state.sent();
                    if (!savedTabs) return [
                        2
                    ];
                    tabs = JSON.parse(savedTabs);
                    console.log("Loading saved tabs:", tabs);
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
                        storage.getItem("".concat(tab.id))
                    ];
                case 4:
                    raw = _state.sent();
                    analysisData = raw ? JSON.parse(raw) : null;
                    console.log("Restoring analysis data for tab", tab.id, analysisData);
                    if (analysisData) {
                        createAnalysisTab(Audio.fromSamples(Float32Array.from(analysisData.responseSamples)), analysisData.referenceSamples ? Audio.fromSamples(Float32Array.from(analysisData.referenceSamples)) : null, analysisData.filename, analysisData.referenceFilename);
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
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fft_1 = require("./fft");
var tabCounter = 0;
var tabsContainer = document.getElementById('tabs');
var tabContents = document.getElementById('tab-contents');
var responseFileInput = document.getElementById('responseFile');
var referenceFileInput = document.getElementById('referenceFile');
var analyzeBtn = document.getElementById('analyzeBtn');
// Enable analyze button when response file is selected
responseFileInput.addEventListener('change', function () {
    var _a;
    analyzeBtn.disabled = !((_a = responseFileInput.files) === null || _a === void 0 ? void 0 : _a.length);
});
// Tab switching
tabsContainer.addEventListener('click', function (e) {
    var _a;
    var target = e.target;
    if (target.classList.contains('tab-close')) {
        var tab = target.parentElement;
        var tabId = tab.dataset.tab;
        if (tabId !== 'upload') {
            tab.remove();
            (_a = document.querySelector("[data-content=\"".concat(tabId, "\"]"))) === null || _a === void 0 ? void 0 : _a.remove();
            // Activate upload tab if current was closed
            if (tab.classList.contains('active')) {
                switchTab('upload');
            }
        }
        e.stopPropagation();
    }
    else if (target.classList.contains('tab')) {
        var tabId = target.dataset.tab;
        if (tabId) {
            switchTab(tabId);
        }
    }
});
function switchTab(tabId) {
    var _a, _b;
    document.querySelectorAll('.tab').forEach(function (t) { return t.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function (c) { return c.classList.remove('active'); });
    (_a = document.querySelector("[data-tab=\"".concat(tabId, "\"]"))) === null || _a === void 0 ? void 0 : _a.classList.add('active');
    (_b = document.querySelector("[data-content=\"".concat(tabId, "\"]"))) === null || _b === void 0 ? void 0 : _b.classList.add('active');
}
analyzeBtn.addEventListener('click', function () { return __awaiter(void 0, void 0, void 0, function () {
    var responseFile, referenceFile, responseData, referenceData, _a, error_1;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                responseFile = (_b = responseFileInput.files) === null || _b === void 0 ? void 0 : _b[0];
                referenceFile = (_c = referenceFileInput.files) === null || _c === void 0 ? void 0 : _c[0];
                if (!responseFile)
                    return [2 /*return*/];
                analyzeBtn.disabled = true;
                analyzeBtn.textContent = 'Analyzing...';
                _d.label = 1;
            case 1:
                _d.trys.push([1, 6, 7, 8]);
                return [4 /*yield*/, loadAudioFile(responseFile)];
            case 2:
                responseData = _d.sent();
                if (!referenceFile) return [3 /*break*/, 4];
                return [4 /*yield*/, loadAudioFile(referenceFile)];
            case 3:
                _a = _d.sent();
                return [3 /*break*/, 5];
            case 4:
                _a = null;
                _d.label = 5;
            case 5:
                referenceData = _a;
                createAnalysisTab(responseData, referenceData, responseFile.name);
                return [3 /*break*/, 8];
            case 6:
                error_1 = _d.sent();
                alert('Error analyzing files: ' + error_1.message);
                return [3 /*break*/, 8];
            case 7:
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = 'Analyze Frequency Response';
                return [7 /*endfinally*/];
            case 8: return [2 /*return*/];
        }
    });
}); });
function loadAudioFile(file) {
    return __awaiter(this, void 0, void 0, function () {
        var arrayBuffer, audioContext, audioBuffer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, file.arrayBuffer()];
                case 1:
                    arrayBuffer = _a.sent();
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    return [4 /*yield*/, audioContext.decodeAudioData(arrayBuffer)];
                case 2:
                    audioBuffer = _a.sent();
                    return [2 /*return*/, {
                            sampleRate: audioBuffer.sampleRate,
                            data: audioBuffer.getChannelData(0),
                            duration: audioBuffer.duration
                        }];
            }
        });
    });
}
function computeFFT(data) {
    var fft = new fft_1.FFT(data.length);
    var out = fft.createComplexArray();
    fft.realTransform(out, data);
    var frequencies = [];
    var magnitudes = [];
    var numFreqs = Math.min(data.length / 2, 2048);
    for (var k = 0; k < numFreqs; k++) {
        var real = out[k * 2];
        var imag = out[k * 2 + 1];
        var magnitude = Math.sqrt(real * real + imag * imag) / data.length;
        magnitudes.push(20 * Math.log10(magnitude + 1e-10));
        frequencies.push(k * 44100 / data.length);
    }
    return { frequencies: frequencies, magnitudes: magnitudes };
}
function createAnalysisTab(responseData, referenceData, filename) {
    tabCounter++;
    var tabId = "analysis-".concat(tabCounter);
    var shortName = filename.length > 20 ? filename.substring(0, 17) + '...' : filename;
    // Create tab button
    var tab = document.createElement('button');
    tab.className = 'tab';
    tab.dataset.tab = tabId;
    tab.innerHTML = "\uD83D\uDCCA ".concat(shortName, " <span class=\"tab-close\">\u00D7</span>");
    tabsContainer.appendChild(tab);
    // Create tab content
    var content = document.createElement('div');
    content.className = 'tab-content';
    content.dataset.content = tabId;
    content.innerHTML = "\n        <div class=\"plot-container\">\n            <h2>".concat(filename, "</h2>\n            <div id=\"plot-").concat(tabId, "\"></div>\n        </div>\n    ");
    tabContents.appendChild(content);
    // Switch to new tab
    switchTab(tabId);
    // Compute and plot
    var responseFFT = computeFFT(responseData.data);
    var traces = [{
            x: responseFFT.frequencies,
            y: responseFFT.magnitudes,
            type: 'scatter',
            mode: 'lines',
            name: 'Response',
            line: { color: '#0366d6', width: 2 }
        }];
    if (referenceData) {
        var referenceFFT_1 = computeFFT(referenceData.data);
        traces.push({
            x: referenceFFT_1.frequencies,
            y: referenceFFT_1.magnitudes,
            type: 'scatter',
            mode: 'lines',
            name: 'Reference',
            line: { color: '#28a745', width: 2 }
        });
        // Frequency response (difference)
        var freqResponse = responseFFT.magnitudes.map(function (val, i) {
            return val - (referenceFFT_1.magnitudes[i] || 0);
        });
        traces.push({
            x: responseFFT.frequencies,
            y: freqResponse,
            type: 'scatter',
            mode: 'lines',
            name: 'Frequency Response',
            line: { color: '#d73a49', width: 2 }
        });
    }
    var layout = {
        title: 'Frequency Analysis',
        xaxis: {
            title: 'Frequency (Hz)',
            type: 'log',
            gridcolor: '#e1e4e8'
        },
        yaxis: {
            title: 'Magnitude (dB)',
            gridcolor: '#e1e4e8'
        },
        legend: { x: 0.02, y: 0.98 },
        plot_bgcolor: '#fafbfc',
        paper_bgcolor: '#fff'
    };
    window.Plotly.newPlot("plot-".concat(tabId), traces, layout, { responsive: true });
}

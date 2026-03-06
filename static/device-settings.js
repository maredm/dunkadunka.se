"use strict";
// Device settings for audio input/output selection
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openDeviceSettings = openDeviceSettings;
exports.closeDeviceSettings = closeDeviceSettings;
exports.refreshAudioDeviceList = refreshAudioDeviceList;
exports.saveDeviceSelections = saveDeviceSelections;
const INPUT_KEY = 'preferredAudioInputId';
const OUTPUT_KEY = 'preferredAudioOutputId';
function openDeviceSettings() {
    const modal = document.getElementById('deviceSettingsModal');
    if (modal) {
        modal.style.display = 'flex';
        initDeviceSettings();
    }
}
function closeDeviceSettings() {
    const modal = document.getElementById('deviceSettingsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}
function ensureDeviceAccess() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
                return;
            // Request permission so labels are revealed
            yield navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
        catch (_) {
            // Permission may be denied; device labels may be blank
        }
    });
}
function refreshAudioDeviceList() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            console.warn('MediaDevices API not available');
            return;
        }
        yield ensureDeviceAccess();
        const devices = yield navigator.mediaDevices.enumerateDevices();
        const inputSel = document.getElementById('inputDeviceSelect');
        const outputSel = document.getElementById('outputDeviceSelect');
        if (!inputSel || !outputSel)
            return;
        inputSel.innerHTML = '<option value="">Default input</option>';
        outputSel.innerHTML = '<option value="">Default output</option>';
        const inputId = localStorage.getItem(INPUT_KEY) || '';
        const outputId = localStorage.getItem(OUTPUT_KEY) || '';
        devices.forEach(d => {
            if (d.kind === 'audioinput') {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.textContent = d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`;
                if (d.deviceId === inputId)
                    opt.selected = true;
                inputSel.appendChild(opt);
            }
            else if (d.kind === 'audiooutput') {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.textContent = d.label || `Speaker (${d.deviceId.slice(0, 8)}…)`;
                if (d.deviceId === outputId)
                    opt.selected = true;
                outputSel.appendChild(opt);
            }
        });
        const note = document.getElementById('sinkSupportNote');
        if (note) {
            const sinkSupported = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
            note.textContent = sinkSupported
                ? 'Output routing supported on this browser.'
                : 'Output routing (setSinkId) not supported by this browser.';
        }
    });
}
function applyOutputDevice(deviceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const router = document.getElementById('appOutputRouter');
        if (!router)
            return;
        if ('setSinkId' in HTMLMediaElement.prototype) {
            try {
                yield router.setSinkId(deviceId || '');
            }
            catch (e) {
                console.warn('Failed to set sinkId:', e);
            }
        }
    });
}
function saveDeviceSelections() {
    const inputSel = document.getElementById('inputDeviceSelect');
    const outputSel = document.getElementById('outputDeviceSelect');
    if (!inputSel || !outputSel)
        return;
    localStorage.setItem(INPUT_KEY, inputSel.value || '');
    localStorage.setItem(OUTPUT_KEY, outputSel.value || '');
    applyOutputDevice(outputSel.value || '');
    closeDeviceSettings();
}
function initDeviceSettings() {
    return __awaiter(this, void 0, void 0, function* () {
        yield refreshAudioDeviceList();
        // Persist immediately when changed
        const inputSel = document.getElementById('inputDeviceSelect');
        const outputSel = document.getElementById('outputDeviceSelect');
        if (!inputSel || !outputSel)
            return;
        inputSel.onchange = () => {
            localStorage.setItem(INPUT_KEY, inputSel.value || '');
        };
        outputSel.onchange = () => {
            localStorage.setItem(OUTPUT_KEY, outputSel.value || '');
            applyOutputDevice(outputSel.value || '');
        };
    });
}
// Update list if devices change while modal is open
if (navigator.mediaDevices && 'ondevicechange' in navigator.mediaDevices) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
        const modal = document.getElementById('deviceSettingsModal');
        if (modal && modal.style.display === 'flex') {
            refreshAudioDeviceList();
        }
    });
}
// Apply preferred output on load (best-effort)
document.addEventListener('DOMContentLoaded', () => {
    const outId = localStorage.getItem(OUTPUT_KEY);
    if (outId)
        applyOutputDevice(outId);
});
// Export functions to global scope for inline onclick handlers
window.openDeviceSettings = openDeviceSettings;
window.closeDeviceSettings = closeDeviceSettings;
window.refreshAudioDeviceList = refreshAudioDeviceList;
window.saveDeviceSelections = saveDeviceSelections;

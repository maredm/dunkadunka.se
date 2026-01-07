// Device settings for audio input/output selection

const INPUT_KEY = 'preferredAudioInputId';
const OUTPUT_KEY = 'preferredAudioOutputId';

export function openDeviceSettings(): void {
    const modal = document.getElementById('deviceSettingsModal');
    if (modal) {
        modal.style.display = 'flex';
        initDeviceSettings();
    }
}

export function closeDeviceSettings(): void {
    const modal = document.getElementById('deviceSettingsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function ensureDeviceAccess(): Promise<void> {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
        // Request permission so labels are revealed
        await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (_) {
        // Permission may be denied; device labels may be blank
    }
}

export async function refreshAudioDeviceList(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('MediaDevices API not available');
        return;
    }

    await ensureDeviceAccess();

    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputSel = document.getElementById('inputDeviceSelect') as HTMLSelectElement | null;
    const outputSel = document.getElementById('outputDeviceSelect') as HTMLSelectElement | null;

    if (!inputSel || !outputSel) return;

    inputSel.innerHTML = '<option value="">Default input</option>';
    outputSel.innerHTML = '<option value="">Default output</option>';

    const inputId = localStorage.getItem(INPUT_KEY) || '';
    const outputId = localStorage.getItem(OUTPUT_KEY) || '';

    devices.forEach(d => {
        if (d.kind === 'audioinput') {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`;
            if (d.deviceId === inputId) opt.selected = true;
            inputSel.appendChild(opt);
        } else if (d.kind === 'audiooutput') {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `Speaker (${d.deviceId.slice(0, 8)}…)`;
            if (d.deviceId === outputId) opt.selected = true;
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
}

async function applyOutputDevice(deviceId: string): Promise<void> {
    const router = document.getElementById('appOutputRouter') as HTMLAudioElement | null;
    if (!router) return;

    if ('setSinkId' in HTMLMediaElement.prototype) {
        try {
            await (router as any).setSinkId(deviceId || '');
        } catch (e) {
            console.warn('Failed to set sinkId:', e);
        }
    }
}

export function saveDeviceSelections(): void {
    const inputSel = document.getElementById('inputDeviceSelect') as HTMLSelectElement | null;
    const outputSel = document.getElementById('outputDeviceSelect') as HTMLSelectElement | null;

    if (!inputSel || !outputSel) return;

    localStorage.setItem(INPUT_KEY, inputSel.value || '');
    localStorage.setItem(OUTPUT_KEY, outputSel.value || '');

    applyOutputDevice(outputSel.value || '');
    closeDeviceSettings();
}

async function initDeviceSettings(): Promise<void> {
    await refreshAudioDeviceList();

    // Persist immediately when changed
    const inputSel = document.getElementById('inputDeviceSelect') as HTMLSelectElement | null;
    const outputSel = document.getElementById('outputDeviceSelect') as HTMLSelectElement | null;

    if (!inputSel || !outputSel) return;

    inputSel.onchange = () => {
        localStorage.setItem(INPUT_KEY, inputSel.value || '');
    };
    outputSel.onchange = () => {
        localStorage.setItem(OUTPUT_KEY, outputSel.value || '');
        applyOutputDevice(outputSel.value || '');
    };
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
    if (outId) applyOutputDevice(outId);
});

// Export functions to global scope for inline onclick handlers
(window as any).openDeviceSettings = openDeviceSettings;
(window as any).closeDeviceSettings = closeDeviceSettings;
(window as any).refreshAudioDeviceList = refreshAudioDeviceList;
(window as any).saveDeviceSelections = saveDeviceSelections;

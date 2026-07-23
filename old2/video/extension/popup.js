const statusEl = document.getElementById("status");
const videoDeviceEl = document.getElementById("videoDevice");
const durationEl = document.getElementById("durationSeconds");
const outputFileEl = document.getElementById("outputFile");

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? "#b91c1c" : "#374151";
}

function toPositiveNumber(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }
    return value;
}

async function sendNative(payload) {
    return chrome.runtime.sendMessage({ type: "native-command", payload });
}

function fillVideoDevices(devices) {
    videoDeviceEl.innerHTML = "";

    if (!Array.isArray(devices) || devices.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No video devices found";
        videoDeviceEl.appendChild(option);
        return;
    }

    for (const device of devices) {
        const option = document.createElement("option");
        option.value = String(device.id);
        option.textContent = `[${device.id}] ${device.name}`;
        videoDeviceEl.appendChild(option);
    }
}

async function listDevices() {
    setStatus("Listing devices...");
    const response = await sendNative({ action: "list_devices" });
    if (!response?.ok) {
        setStatus(response?.error || "Failed to list devices", true);
        return;
    }

    fillVideoDevices(response.video_devices || []);
    setStatus(`Loaded ${response.video_devices?.length || 0} video device(s).`);
}

async function recordForDuration() {
    const deviceId = Number(videoDeviceEl.value);
    if (!Number.isInteger(deviceId) || deviceId < 0) {
        setStatus("Select a valid video device.", true);
        return;
    }

    const duration = toPositiveNumber(durationEl.value.trim());
    if (!duration) {
        setStatus("Duration must be a positive number.", true);
        return;
    }

    const outputFile = outputFileEl.value.trim();
    const payload = {
        action: "record_for_duration",
        video_device_id: deviceId,
        duration_seconds: duration
    };

    if (outputFile) {
        payload.output_file = outputFile;
    }

    setStatus(`Recording device ${deviceId} for ${duration}s...`);
    const response = await sendNative(payload);
    if (!response?.ok) {
        setStatus(response?.error || "Recording failed", true);
        return;
    }

    setStatus(`Saved: ${response.output_file}`);
}

document.getElementById("listDevices").addEventListener("click", () => {
    listDevices().catch((error) => setStatus(error?.message || "Unexpected error", true));
});

document.getElementById("recordForDuration").addEventListener("click", () => {
    recordForDuration().catch((error) => setStatus(error?.message || "Unexpected error", true));
});

listDevices().catch((error) => setStatus(error?.message || "Unexpected error", true));

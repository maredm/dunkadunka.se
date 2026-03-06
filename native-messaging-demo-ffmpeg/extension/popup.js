const statusEl = document.getElementById("status");
const deviceSelect = document.getElementById("deviceSelect");
const fileNameInput = document.getElementById("fileName");
const widthInput = document.getElementById("width");
const heightInput = document.getElementById("height");
const cropWInput = document.getElementById("cropW");
const cropHInput = document.getElementById("cropH");
const cropXInput = document.getElementById("cropX");
const cropYInput = document.getElementById("cropY");
const pixFmtInput = document.getElementById("pixFmt");
const durationInput = document.getElementById("duration");
let lastPid = null;

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b00020" : "#444";
}

async function sendNative(payload) {
  return chrome.runtime.sendMessage({ type: "native-command", payload });
}

function getOptionalInt(input) {
  const raw = input.value.trim();
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return null;
  }
  return value;
}

function buildOptions() {
  const options = {};

  const fileName = fileNameInput.value.trim();
  if (fileName) {
    options.filename = fileName;
  }

  const width = getOptionalInt(widthInput);
  const height = getOptionalInt(heightInput);
  if ((width === null) !== (height === null)) {
    throw new Error("Provide both width and height");
  }
  if (width !== null && height !== null) {
    options.width = width;
    options.height = height;
  }

  const cropW = getOptionalInt(cropWInput);
  const cropH = getOptionalInt(cropHInput);
  const cropX = getOptionalInt(cropXInput) ?? 0;
  const cropY = getOptionalInt(cropYInput) ?? 0;
  if ((cropW === null) !== (cropH === null)) {
    throw new Error("Provide both crop width and crop height");
  }
  if (cropW !== null && cropH !== null) {
    options.crop = { w: cropW, h: cropH, x: Math.max(0, cropX), y: Math.max(0, cropY) };
  }

  const pixFmt = pixFmtInput.value.trim();
  if (pixFmt) {
    options.pix_fmt = pixFmt;
  }

  const durationRaw = durationInput.value.trim();
  if (durationRaw) {
    const duration = Number(durationRaw);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Duration must be a positive number");
    }
    options.duration_seconds = duration;
  }

  return options;
}

function fillDevices(videoDevices) {
  deviceSelect.innerHTML = "";

  if (!Array.isArray(videoDevices) || videoDevices.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No AVFoundation video devices found";
    deviceSelect.appendChild(option);
    return;
  }

  videoDevices.forEach((device) => {
    const option = document.createElement("option");
    option.value = String(device.id);
    option.textContent = `[${device.id}] ${device.name}`;
    deviceSelect.appendChild(option);
  });
}

async function listDevices() {
  setStatus("Listing devices...");
  const response = await sendNative({ action: "list_devices" });
  if (!response?.ok) {
    setStatus(response?.error || "Failed to list devices", true);
    return;
  }

  fillDevices(response.video_devices || []);
  setStatus("Devices loaded");
}

async function startCapture() {
  const deviceId = Number(deviceSelect.value);
  if (!Number.isInteger(deviceId)) {
    setStatus("Select a valid device", true);
    return;
  }

  let options;
  try {
    options = buildOptions();
  } catch (err) {
    setStatus(err?.message || "Invalid capture options", true);
    return;
  }

  setStatus(`Starting capture for ${deviceId}...`);
  const response = await sendNative({
    action: "start_capture",
    device_id: deviceId,
    options
  });
  if (!response?.ok) {
    setStatus(response?.error || "Failed to start capture", true);
    return;
  }

  lastPid = response.pid || null;
  setStatus(`Capture started. PID ${response.pid}`);
}

async function stopCapture() {
  setStatus("Stopping capture...");
  const payload = { action: "stop_capture" };

  if (lastPid) {
    payload.pid = lastPid;
  } else {
    const deviceId = Number(deviceSelect.value);
    if (Number.isInteger(deviceId)) {
      payload.device_id = deviceId;
    }
  }

  const response = await sendNative(payload);
  if (!response?.ok) {
    setStatus(response?.error || "Failed to stop capture", true);
    return;
  }

  setStatus(`Capture stopped for PID ${response.pid}`);
}

document.getElementById("listDevices").addEventListener("click", () => {
  listDevices().catch((err) => setStatus(err?.message || "Unexpected error", true));
});

document.getElementById("startCapture").addEventListener("click", () => {
  startCapture().catch((err) => setStatus(err?.message || "Unexpected error", true));
});

document.getElementById("stopCapture").addEventListener("click", () => {
  stopCapture().catch((err) => setStatus(err?.message || "Unexpected error", true));
});

listDevices().catch((err) => setStatus(err?.message || "Unexpected error", true));

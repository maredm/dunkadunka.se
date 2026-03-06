const statusEl = document.getElementById("status");
const deviceSelect = document.getElementById("deviceSelect");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b00020" : "#444";
}

async function sendNative(payload) {
  return chrome.runtime.sendMessage({ type: "native-command", payload });
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

  setStatus(`Starting capture for ${deviceId}...`);
  const response = await sendNative({ action: "start_capture", device_id: deviceId });
  if (!response?.ok) {
    setStatus(response?.error || "Failed to start capture", true);
    return;
  }

  setStatus(`Capture started. PID ${response.pid}`);
}

document.getElementById("listDevices").addEventListener("click", () => {
  listDevices().catch((err) => setStatus(err?.message || "Unexpected error", true));
});

document.getElementById("startCapture").addEventListener("click", () => {
  startCapture().catch((err) => setStatus(err?.message || "Unexpected error", true));
});

listDevices().catch((err) => setStatus(err?.message || "Unexpected error", true));

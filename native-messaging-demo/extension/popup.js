const statusEl = document.getElementById("status");
const slider = document.getElementById("slider");

async function sendNative(payload) {
    return chrome.runtime.sendMessage({ type: "native-command", payload });
}

function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.style.color = isError ? "#b00020" : "#444";
}

async function refreshVolume() {
    const response = await sendNative({ action: "get_volume" });
    if (!response?.ok) {
        setStatus(response?.error || "Failed to read volume", true);
        return;
    }
    slider.value = String(response.volume);
    setStatus(`Volume: ${response.volume}%`);
}

async function changeVolume(delta) {
    const response = await sendNative({ action: "change_volume", delta });
    if (!response?.ok) {
        setStatus(response?.error || "Failed to change volume", true);
        return;
    }
    slider.value = String(response.volume);
    setStatus(`Volume: ${response.volume}%`);
}

async function setVolume() {
    const value = Number(slider.value);
    const response = await sendNative({ action: "set_volume", value });
    if (!response?.ok) {
        setStatus(response?.error || "Failed to set volume", true);
        return;
    }
    setStatus(`Volume set to ${response.volume}%`);
}

document.getElementById("refresh").addEventListener("click", refreshVolume);
document.getElementById("up").addEventListener("click", () => changeVolume(10));
document.getElementById("down").addEventListener("click", () => changeVolume(-10));
document.getElementById("apply").addEventListener("click", setVolume);

refreshVolume().catch((err) => {
    setStatus(err?.message || "Unexpected error", true);
});

const HOST_NAME = "com.dunkadunka.ffmpeg_controller";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "native-command") {
        return false;
    }

    const payload = message.payload || {};
    chrome.runtime.sendNativeMessage(HOST_NAME, payload, (response) => {
        if (chrome.runtime.lastError) {
            sendResponse({
                ok: false,
                error: `${chrome.runtime.lastError.message} (host=${HOST_NAME})`
            });
            return;
        }

        sendResponse(response || { ok: false, error: "No response from native host" });
    });

    return true;
});

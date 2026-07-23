const HOST_NAME = "com.dunkadunka.volume_host";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "native-command") {
        return false;
    }

    chrome.runtime.sendNativeMessage(HOST_NAME, message.payload, (response) => {
        if (chrome.runtime.lastError) {
            sendResponse({
                ok: false,
                error: chrome.runtime.lastError.message,
            });
            return;
        }

        sendResponse(response || { ok: false, error: "No response from native host" });
    });

    return true;
});

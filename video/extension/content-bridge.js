window.addEventListener("message", async (event) => {
    if (event.source !== window) {
        return;
    }

    const data = event.data;
    if (!data || data.source !== "ffmpeg-controller-web" || data.type !== "native-command") {
        return;
    }

    const requestId = data.requestId || null;

    try {
        const response = await chrome.runtime.sendMessage({
            type: "native-command",
            payload: data.payload || {}
        });

        window.postMessage(
            {
                source: "ffmpeg-controller-extension",
                type: "native-response",
                requestId,
                response: response || { ok: false, error: "Empty native response" }
            },
            "*"
        );
    } catch (error) {
        window.postMessage(
            {
                source: "ffmpeg-controller-extension",
                type: "native-response",
                requestId,
                response: { ok: false, error: error?.message || "Unknown extension error" }
            },
            "*"
        );
    }
});

const PAGE_NAME = "three-channel-router.html";

function isTargetPage() {
    const path = window.location.pathname || "";
    return path.endsWith(`/${PAGE_NAME}`) || path === PAGE_NAME;
}

if (isTargetPage()) {
    window.addEventListener("message", (event) => {
        if (event.source !== window) {
            return;
        }

        const data = event.data;
        if (!data || data.type !== "native-volume-command") {
            return;
        }

        chrome.runtime.sendMessage(
            { type: "native-command", payload: data.payload },
            (response) => {
                const runtimeError = chrome.runtime.lastError;
                window.postMessage(
                    {
                        type: "native-volume-response",
                        id: data.id,
                        response: runtimeError
                            ? { ok: false, error: runtimeError.message }
                            : response || { ok: false, error: "No response from native host" },
                    },
                    "*"
                );
            }
        );
    });
}

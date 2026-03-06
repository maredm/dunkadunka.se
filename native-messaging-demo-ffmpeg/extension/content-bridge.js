const PAGE_SUFFIXES = [
  "/native-messaging-demo-ffmpeg/web/index.html",
  "/video/index.html",
  "/video/",
  "/video"
];

function isTargetPage() {
  const path = window.location.pathname || "";
  return PAGE_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

if (isTargetPage()) {
  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (!data || data.type !== "ffmpeg-demo-bridge-ping") {
      return;
    }

    window.postMessage(
      {
        type: "ffmpeg-demo-bridge-pong",
        id: data.id,
        response: { ok: true }
      },
      "*"
    );
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (!data || data.type !== "ffmpeg-demo-command") {
      return;
    }

    chrome.runtime.sendMessage(
      { type: "native-command", payload: data.payload },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        window.postMessage(
          {
            type: "ffmpeg-demo-response",
            id: data.id,
            response: runtimeError
              ? { ok: false, error: runtimeError.message }
              : response || { ok: false, error: "No response from native host" }
          },
          "*"
        );
      }
    );
  });
}

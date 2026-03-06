const HOST_NAME = "com.dunkadunka.ffmpeg_demo_host";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "native-command") {
    return false;
  }

  const payload = message.payload || {};
  const action = typeof payload.action === "string" ? payload.action : "unknown";

  chrome.runtime.sendNativeMessage(HOST_NAME, payload, (response) => {
    if (chrome.runtime.lastError) {
      sendResponse({
        ok: false,
        error: `${chrome.runtime.lastError.message} (host=${HOST_NAME}, action=${action})`
      });
      return;
    }

    sendResponse(response || { ok: false, error: "No response from native host" });
  });

  return true;
});

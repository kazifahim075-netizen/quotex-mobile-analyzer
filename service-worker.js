chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  chrome.tabs.sendMessage(tab.id, {
    type: "TOGGLE_PANEL"
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "CAPTURE_VISIBLE") {
    chrome.tabs.captureVisibleTab(
      null,
      {
        format: "jpeg",
        quality: 70
      },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            dataUrl: null,
            error: chrome.runtime.lastError.message
          });
          return;
        }

        sendResponse({
          ok: true,
          dataUrl: dataUrl,
          error: null
        });
      }
    );

    return true;
  }
});

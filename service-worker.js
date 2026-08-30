chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  chrome.tabs.sendMessage(tab.id, {
    type: "TOGGLE_PANEL"
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "CAPTURE_VISIBLE") {
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      {
        format: "jpeg",
        quality: 70
      },
      (dataUrl) => {
        sendResponse({
          ok: !chrome.runtime.lastError,
          dataUrl,
          error: chrome.runtime.lastError?.message
        });
      }
    );

    return true;
  }
});

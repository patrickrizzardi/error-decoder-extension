// Background service worker — handles context menu + panel display

// Register context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "decode-error",
    title: "Decode this error",
    contexts: ["selection"],
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "decode-error" || !info.selectionText || !tab?.id) return;

  // Store selected text for the panel to read
  await chrome.storage.session.set({
    pendingDecode: info.selectionText,
    pendingTabId: tab.id,
    pendingUrl: tab.url,
  });

  // Tell the content script to show the injected panel
  chrome.tabs.sendMessage(tab.id, { type: "SHOW_PANEL" });
});

// Listen for messages from content script / auth page
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PAGE_CONTEXT") {
    chrome.storage.session.set({ pageContext: JSON.stringify(message.data) });
    sendResponse({ received: true });
  }

  if (message.type === "AUTH_SUCCESS") {
    chrome.storage.local.set({
      apiKey: message.apiKey,
      userEmail: message.email,
      userPlan: message.plan,
    });
    sendResponse({ received: true });
  }

  return true;
});

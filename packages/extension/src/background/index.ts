// Background service worker — handles context menu + side panel

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
  if (info.menuItemId !== "decode-error" || !info.selectionText) return;

  // Store selected text in session storage for side panel to read
  await chrome.storage.session.set({
    pendingDecode: info.selectionText,
    pendingTabId: tab?.id,
    pendingUrl: tab?.url,
  });

  // Open side panel
  if (tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Listen for messages from content script (page context)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PAGE_CONTEXT") {
    chrome.storage.session.set({ pageContext: JSON.stringify(message.data) });
    sendResponse({ received: true });
  }

  if (message.type === "AUTH_SUCCESS") {
    // Store API key from auth flow
    chrome.storage.local.set({
      apiKey: message.apiKey,
      userEmail: message.email,
      userPlan: message.plan,
    });
    sendResponse({ received: true });
  }

  return true; // Keep message channel open for async response
});

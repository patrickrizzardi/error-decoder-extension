// Background service worker — handles context menu + side panel

// Register context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "decode-error",
    title: "Decode this error",
    contexts: ["selection"],
  });

  // Enable side panel to open on action click as well
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "decode-error" || !info.selectionText) return;

  // Store selected text for side panel to read
  await chrome.storage.session.set({
    pendingDecode: info.selectionText,
    pendingTabId: tab?.id,
    pendingUrl: tab?.url,
  });

  // Try to open side panel
  if (chrome.sidePanel?.open && tab?.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      console.log("[BG] Side panel opened");
      return;
    } catch (err) {
      console.warn("[BG] Side panel failed, falling back to tab:", err);
    }
  }

  // Fallback: open results in a new tab
  const resultUrl = chrome.runtime.getURL("sidepanel/index.html");
  chrome.tabs.create({ url: resultUrl });
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

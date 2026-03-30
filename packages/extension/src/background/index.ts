// Background service worker — routes messages, stores errors, monitors network

// Register context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "decode-error",
    title: "Decode this error",
    contexts: ["selection"],
  });
});

// Extension icon click → toggle sidebar
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
});

// Right-click "Decode this error" → store text, open sidebar
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "decode-error" || !info.selectionText || !tab?.id) return;

  await chrome.storage.session.set({
    pendingText: info.selectionText,
  });

  chrome.tabs.sendMessage(tab.id, { type: "SHOW_PANEL" });
});

// ============================================
// Network monitoring — tagged with tabId
// ============================================

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.statusCode >= 400 && details.tabId > 0) {
      if (details.url.includes("/api/decode") || details.url.includes("/api/usage")) return;

      appendCapturedError({
        text: `Network ${details.statusCode}: ${details.method} ${details.url}`,
        level: "error",
        timestamp: details.timeStamp,
        url: details.url,
        domain: new URL(details.url).hostname,
        source: "network",
        tabId: details.tabId,
      });
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.url.startsWith("chrome-extension://") || details.tabId < 0) return;

    appendCapturedError({
      text: `Network Error: ${details.error} — ${details.method} ${details.url}`,
      level: "error",
      timestamp: details.timeStamp,
      url: details.url,
      domain: (() => { try { return new URL(details.url).hostname; } catch { return ""; } })(),
      source: "network",
      tabId: details.tabId,
    });
  },
  { urls: ["<all_urls>"] }
);

// ============================================
// Message handling
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CAPTURED_ERROR") {
    appendCapturedError({
      text: message.text,
      level: message.level,
      timestamp: message.timestamp || Date.now(),
      url: message.url,
      domain: message.domain,
      source: "console",
      tabId: sender.tab?.id ?? -1,
    });
    sendResponse({ received: true });
  }

  // Tech stack detected by content script — store per tab
  if (message.type === "TECH_DETECTED" && sender.tab?.id) {
    chrome.storage.session.set({ [`tech_tab_${sender.tab.id}`]: message.tech });
    sendResponse({ received: true });
  }

  if (message.type === "ELEMENT_SELECTED") {
    chrome.storage.session.set({ selectedElement: message.element });
    sendResponse({ received: true });
  }

  if (message.type === "INSPECT_CANCELLED") {
    chrome.storage.session.remove("selectedElement");
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

// ============================================
// Error storage — per-tab
// ============================================

const appendCapturedError = async (error: {
  text: string;
  level: string;
  timestamp: number;
  url?: string;
  domain?: string;
  source?: string;
  tabId: number;
}) => {
  const key = `errors_tab_${error.tabId}`;
  const result = await chrome.storage.session.get(key);
  const errors = result[key] || [];

  // Dedupe
  const last = errors[errors.length - 1];
  if (last && last.text === error.text && error.timestamp - last.timestamp < 500) return;

  errors.push(error);
  if (errors.length > 50) errors.shift();

  await chrome.storage.session.set({ [key]: errors });
};

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`errors_tab_${tabId}`);
});

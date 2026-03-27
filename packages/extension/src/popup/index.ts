// Popup — paste mode for errors from terminal/Slack/etc

const textarea = document.getElementById("error-input") as HTMLTextAreaElement;
const charCurrent = document.getElementById("char-current")!;
const decodeBtn = document.getElementById("decode-btn") as HTMLButtonElement;

// Character count
textarea.addEventListener("input", () => {
  charCurrent.textContent = textarea.value.length.toLocaleString();
});

// Decode button — stores text and opens side panel
decodeBtn.addEventListener("click", async () => {
  const text = textarea.value.trim();
  if (!text) return;

  await chrome.storage.session.set({ pendingDecode: text });

  // Open side panel to show result
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }

  // Close popup
  window.close();
});

// Open options page for account
document.getElementById("account-link")?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

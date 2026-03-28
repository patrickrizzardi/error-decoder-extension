// Side panel — displays decode results

import { api } from "../shared/api";
import type { DecodeResponse } from "@shared/types";

// DOM elements
const emptyState = document.getElementById("empty-state")!;
const loadingState = document.getElementById("loading-state")!;
const resultState = document.getElementById("result-state")!;
const errorState = document.getElementById("error-state")!;

const showState = (state: "empty" | "loading" | "result" | "error") => {
  emptyState.classList.toggle("hidden", state !== "empty");
  loadingState.classList.toggle("hidden", state !== "loading");
  resultState.classList.toggle("hidden", state !== "result");
  errorState.classList.toggle("hidden", state !== "error");
};

const renderResult = (result: DecodeResponse) => {
  document.getElementById("what-happened-text")!.textContent = result.whatHappened;

  const whyList = document.getElementById("why-list")!;
  whyList.innerHTML = result.why.map((r) => `<li>${r}</li>`).join("");

  const fixList = document.getElementById("fix-list")!;
  fixList.innerHTML = result.howToFix.map((f) => `<li>${f}</li>`).join("");

  const codeSection = document.getElementById("code-example")!;
  if (result.codeExample) {
    codeSection.classList.remove("hidden");

    const beforeBlock = document.getElementById("code-before")!;
    if (result.codeExample.before) {
      beforeBlock.classList.remove("hidden");
      document.getElementById("code-before-text")!.textContent = result.codeExample.before;
    } else {
      beforeBlock.classList.add("hidden");
    }

    document.getElementById("code-after-text")!.textContent = result.codeExample.after;
  } else {
    codeSection.classList.add("hidden");
  }

  showState("result");
};

const showError = (message: string, retryable = false) => {
  document.getElementById("error-message")!.textContent = message;
  document.getElementById("retry-btn")!.classList.toggle("hidden", !retryable);
  showState("error");
};

// Check for pending decode from context menu
const checkPendingDecode = async () => {
  const { pendingDecode } = await chrome.storage.session.get("pendingDecode");
  if (!pendingDecode) return;

  // Clear pending
  await chrome.storage.session.remove("pendingDecode");

  showState("loading");

  try {
    const response = await api.decode({ errorText: pendingDecode });

    if ("error" in response) {
      showError(response.error.message, true);
      return;
    }

    renderResult(response.data);
  } catch {
    showError("Failed to connect to ErrorDecoder. Try again.", true);
  }
};

// Copy code button
document.getElementById("copy-code")?.addEventListener("click", async () => {
  const code = document.getElementById("code-after-text")?.textContent ?? "";
  await navigator.clipboard.writeText(code);
  const btn = document.getElementById("copy-code")!;
  btn.textContent = "Copied!";
  setTimeout(() => {
    btn.textContent = "Copy";
  }, 2000);
});

// Retry button
document.getElementById("retry-btn")?.addEventListener("click", checkPendingDecode);

// Close panel — tell parent page to hide the iframe
document.getElementById("close-panel")?.addEventListener("click", () => {
  // Send message to parent page's content script via background
  window.parent.postMessage({ type: "ERRORDECODER_CLOSE" }, "*");
});

// Feedback buttons
document.getElementById("thumbs-up")?.addEventListener("click", () => {
  document.getElementById("feedback-thanks")!.classList.remove("hidden");
});

document.getElementById("thumbs-down")?.addEventListener("click", () => {
  document.getElementById("feedback-thanks")!.classList.remove("hidden");
});

// Listen for new decode requests while panel is open
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.pendingDecode?.newValue) {
    checkPendingDecode();
  }
});

// Initial check
checkPendingDecode();

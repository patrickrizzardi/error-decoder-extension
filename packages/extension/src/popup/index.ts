// Popup — paste mode with inline results

import { api } from "../shared/api";
import type { DecodeResponse } from "@shared/types";

const textarea = document.getElementById("error-input") as HTMLTextAreaElement;
const charCurrent = document.getElementById("char-current")!;
const decodeBtn = document.getElementById("decode-btn") as HTMLButtonElement;
const pasteMode = document.getElementById("paste-mode")!;
const loadingState = document.getElementById("loading-state")!;
const resultState = document.getElementById("result-state")!;
const errorState = document.getElementById("error-state")!;

const showState = (state: "paste" | "loading" | "result" | "error") => {
  pasteMode.classList.toggle("hidden", state !== "paste");
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
    document.getElementById("code-after-text")!.textContent = result.codeExample.after;
  } else {
    codeSection.classList.add("hidden");
  }

  showState("result");
};

// Character count
textarea.addEventListener("input", () => {
  charCurrent.textContent = textarea.value.length.toLocaleString();
});

// Decode button — call API and show results inline
decodeBtn.addEventListener("click", async () => {
  const text = textarea.value.trim();
  if (!text) return;

  showState("loading");

  try {
    const response = await api.decode({ errorText: text });

    if ("error" in response) {
      document.getElementById("error-message")!.textContent = response.error.message;
      showState("error");
      return;
    }

    renderResult(response.data);
  } catch {
    document.getElementById("error-message")!.textContent =
      "Failed to connect to ErrorDecoder. Is the API running?";
    showState("error");
  }
});

// Copy code
document.getElementById("copy-code")?.addEventListener("click", async () => {
  const code = document.getElementById("code-after-text")?.textContent ?? "";
  await navigator.clipboard.writeText(code);
  const btn = document.getElementById("copy-code")!;
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = "Copy"; }, 2000);
});

// Decode another
document.getElementById("new-decode-btn")?.addEventListener("click", () => {
  textarea.value = "";
  charCurrent.textContent = "0";
  showState("paste");
  textarea.focus();
});

// Retry
document.getElementById("retry-btn")?.addEventListener("click", () => {
  showState("paste");
});

// Open options page
document.getElementById("account-link")?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

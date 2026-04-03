// Popup — paste mode with inline results

import { marked } from "marked";
import DOMPurify from "dompurify";
import { api } from "../shared/api";
import { copyToClipboard } from "../shared/ui";

const textarea = document.getElementById("error-input") as HTMLTextAreaElement;
const charCurrent = document.getElementById("char-current");
if (!charCurrent) throw new Error("Missing #char-current element");
const decodeBtn = document.getElementById("decode-btn") as HTMLButtonElement;
const pasteMode = document.getElementById("paste-mode");
if (!pasteMode) throw new Error("Missing #paste-mode element");
const loadingState = document.getElementById("loading-state");
if (!loadingState) throw new Error("Missing #loading-state element");
const resultState = document.getElementById("result-state");
if (!resultState) throw new Error("Missing #result-state element");
const errorState = document.getElementById("error-state");
if (!errorState) throw new Error("Missing #error-state element");

const showState = (state: "paste" | "loading" | "result" | "error") => {
  pasteMode.classList.toggle("hidden", state !== "paste");
  loadingState.classList.toggle("hidden", state !== "loading");
  resultState.classList.toggle("hidden", state !== "result");
  errorState.classList.toggle("hidden", state !== "error");
};

const renderResult = (result: { markdown: string }) => {
  const resultContent = document.getElementById("result-content");
  if (!resultContent) throw new Error("Missing #result-content element");
  resultContent.innerHTML = DOMPurify.sanitize(marked.parse(result.markdown) as string);

  // Add copy buttons to code blocks
  resultContent.querySelectorAll("pre").forEach((pre) => {
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => copyToClipboard(btn, () => pre.textContent || ""));
    wrapper.appendChild(btn);
  });

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
      const errorMessage = document.getElementById("error-message");
      if (errorMessage) errorMessage.textContent = response.error.message;
      showState("error");
      return;
    }

    renderResult(response.data);
  } catch {
    const errorMessage = document.getElementById("error-message");
    if (errorMessage) errorMessage.textContent =
      "Failed to connect to ErrorDecoder. Is the API running?";
    showState("error");
  }
});

// Decode another
document.getElementById("new-decode-btn")?.addEventListener("click", () => {
  textarea.value = "";
  charCurrent.textContent = "0";
  const resultContent = document.getElementById("result-content");
  if (resultContent) resultContent.innerHTML = "";
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

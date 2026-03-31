// DevTools panel — displays captured errors and decodes them
// Errors are captured automatically by the content script (always on)

type CapturedError = {
  text: string;
  level: "error" | "warning";
  timestamp: number;
};

const errors: CapturedError[] = [];

const errorListEl = document.getElementById("error-list")!;
const emptyMsg = document.getElementById("empty-msg")!;
const resultPlaceholder = document.getElementById("result-placeholder")!;
const resultContent = document.getElementById("result-content")!;
const resultLoading = document.getElementById("result-loading")!;
const statusText = document.getElementById("status-text")!;

// ============================================
// Auto-connect to receive errors from background
// ============================================

const port = chrome.runtime.connect({ name: "devtools-panel" });

port.onMessage.addListener((message) => {
  if (message.type === "DEVTOOLS_ERROR") {
    addError(message.text, message.level);
  }
});

// Also listen via regular onMessage as backup
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "DEVTOOLS_ERROR") {
    addError(message.text, message.level);
  }
});

statusText.textContent = "Listening for errors...";

const addError = (text: string, level: "error" | "warning") => {
  // Deduplicate rapid-fire identical errors
  const last = errors[errors.length - 1];
  if (last && last.text === text && Date.now() - last.timestamp < 500) return;

  errors.push({ text, level, timestamp: Date.now() });
  renderNewError(errors.length - 1);
  statusText.textContent = `${errors.length} error${errors.length !== 1 ? "s" : ""}`;
};

// ============================================
// Render
// ============================================

const renderNewError = (index: number) => {
  emptyMsg.style.display = "none";

  const err = errors[index];
  const item = document.createElement("div");
  item.className = "error-item";

  const firstLine = err.text.split("\n")[0].slice(0, 200);

  item.innerHTML = `
    <div class="error-icon ${err.level}">${err.level === "error" ? "!" : "?"}</div>
    <div class="error-text" title="${escapeHtml(err.text)}">${escapeHtml(firstLine)}</div>
    <button class="error-decode-btn">Decode</button>
  `;

  item.querySelector(".error-decode-btn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    selectItem(item);
    decodeError(err.text);
  });

  item.addEventListener("click", () => {
    selectItem(item);
    decodeError(err.text);
  });

  errorListEl.appendChild(item);

  // Auto-scroll to bottom
  errorListEl.scrollTop = errorListEl.scrollHeight;
};

const selectItem = (item: HTMLElement) => {
  document.querySelectorAll(".error-item").forEach((el) => el.classList.remove("selected"));
  item.classList.add("selected");
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ============================================
// Decode
// ============================================

const getApiKey = (): Promise<string | null> =>
  new Promise((resolve) => {
    chrome.storage.local.get("apiKey", (result) => resolve(result.apiKey || null));
  });

const decodeError = async (errorText: string) => {
  const apiKey = await getApiKey();
  if (!apiKey) {
    showResult(`<p style="color: var(--error-red);">API key not set. Go to extension options and paste your key.</p>`);
    return;
  }

  resultPlaceholder.style.display = "none";
  resultContent.style.display = "none";
  resultLoading.style.display = "block";

  try {
    const apiBase = typeof __API_BASE__ !== "undefined" ? __API_BASE__ : "http://localhost:4001/api";

    const response = await fetch(`${apiBase}/decode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ errorText }),
    });

    const json = await response.json();

    if (json.error) {
      showResult(`<p style="color: var(--error-red);">${escapeHtml(json.error.message)}</p>`);
      return;
    }

    const data = json.data;
    let html = "";

    html += `<h3>What Happened</h3><p>${escapeHtml(data.whatHappened)}</p>`;

    if (data.why?.length) {
      html += `<h3>Why This Occurs</h3><ul>${data.why.map((r: string) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`;
    }

    if (data.howToFix?.length) {
      html += `<h3>How to Fix</h3><ol>${data.howToFix.map((f: string) => `<li>${escapeHtml(f)}</li>`).join("")}</ol>`;
    }

    if (data.codeExample) {
      html += `<h3>Code Example</h3>`;
      if (data.codeExample.before) {
        html += `<div class="code-block"><pre><code>${escapeHtml(data.codeExample.before)}</code></pre></div>`;
      }
      html += `<div class="code-block"><pre><code id="code-copy-target">${escapeHtml(data.codeExample.after)}</code></pre><button class="copy-btn" id="copy-result-code">Copy</button></div>`;
    }

    showResult(html);

    document.getElementById("copy-result-code")?.addEventListener("click", async () => {
      const code = document.getElementById("code-copy-target")?.textContent ?? "";
      await navigator.clipboard.writeText(code);
      const btn = document.getElementById("copy-result-code")!;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy"; }, 2000);
    });
  } catch {
    showResult(`<p style="color: var(--error-red);">Failed to connect to API. Is the server running?</p>`);
  }
};

const showResult = (html: string) => {
  resultPlaceholder.style.display = "none";
  resultLoading.style.display = "none";
  resultContent.style.display = "block";
  resultContent.innerHTML = html;
};

// ============================================
// UI Events
// ============================================

document.getElementById("clear-btn")!.addEventListener("click", () => {
  errors.length = 0;
  errorListEl.querySelectorAll(".error-item").forEach((el) => el.remove());
  emptyMsg.style.display = "block";
  resultPlaceholder.style.display = "flex";
  resultContent.style.display = "none";
  statusText.textContent = "Listening for errors...";
});

document.getElementById("paste-toggle")!.addEventListener("click", () => {
  document.getElementById("paste-area")!.classList.toggle("visible");
});

document.getElementById("paste-decode")!.addEventListener("click", () => {
  const input = document.getElementById("paste-input") as HTMLTextAreaElement;
  const text = input.value.trim();
  if (text) {
    decodeError(text);
    input.value = "";
    document.getElementById("paste-area")!.classList.remove("visible");
  }
});

// Sidebar — tabbed debugging dashboard
// Tabs: Errors (feed) | Decode (paste + model picker) | Inspect (element AI)

import { marked } from "marked";

// ============================================
// Textarea resize grip
// ============================================

(() => {
  const grip = document.getElementById("textarea-grip");
  const textarea = document.getElementById("decode-input") as HTMLTextAreaElement | null;
  if (!grip || !textarea) return;

  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  grip.addEventListener("mousedown", (e) => {
    isDragging = true;
    startY = e.clientY;
    startHeight = textarea.offsetHeight;
    e.preventDefault();

    const pill = grip.querySelector(".textarea-grip-pill") as HTMLElement;
    if (pill) pill.style.background = "rgba(86, 156, 214, 0.8)";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const delta = e.clientY - startY;
    const newHeight = Math.max(40, startHeight + delta);
    textarea.style.height = `${newHeight}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    const pill = grip.querySelector(".textarea-grip-pill") as HTMLElement;
    if (pill) pill.style.background = "";
  });
})();

type CapturedError = {
  text: string;
  level: string;
  timestamp: number;
  url?: string;
  domain?: string;
};

let renderedCount = 0;

// ============================================
// Tabs
// ============================================

const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
const tabContents = document.querySelectorAll<HTMLDivElement>(".tab-content");

const switchTab = (tabName: string) => {
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));
  tabContents.forEach((c) => c.classList.toggle("active", c.id === `tab-${tabName}`));
};

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab!));
});

// ============================================
// ERRORS TAB — real-time feed
// ============================================

const errorFeed = document.getElementById("error-feed")!;
const emptyState = document.getElementById("empty-state")!;
const feedActions = document.getElementById("feed-actions")!;
const errorCountEl = document.getElementById("error-count")!;
const errorBadge = document.getElementById("error-badge")!;
const statusEl = document.getElementById("status")!;

// Get the tab ID this sidebar is running in
let currentTabId: number | null = null;
const getTabKey = () => currentTabId ? `errors_tab_${currentTabId}` : null;

const resolveTabId = async () => {
  // The sidebar iframe is injected into a page — ask the parent page's tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;
  return currentTabId;
};

// Watch storage for this tab's errors
chrome.storage.session.onChanged.addListener((changes) => {
  const key = getTabKey();
  if (key && changes[key]) {
    renderNewErrors(changes[key].newValue || []);
  }

  // Right-click "Decode this error" → switch to decode tab with text
  if (changes.pendingText?.newValue) {
    const textarea = document.getElementById("decode-input") as HTMLTextAreaElement;
    textarea.value = changes.pendingText.newValue;
    switchTab("decode");
    chrome.storage.session.remove("pendingText");
  }

  // Element selected from inspector
  if (changes.selectedElement?.newValue) {
    showInspectResult(changes.selectedElement.newValue);
  }
});

// Load existing on open
const init = async () => {
  await resolveTabId();
  const key = getTabKey();

  if (key) {
    const result = await chrome.storage.session.get(key);
    const errors = result[key] || [];
    if (errors.length > 0) renderNewErrors(errors);
  }

  const { pendingText } = await chrome.storage.session.get("pendingText");
  if (pendingText) {
    const textarea = document.getElementById("decode-input") as HTMLTextAreaElement;
    textarea.value = pendingText;
    switchTab("decode");
    chrome.storage.session.remove("pendingText");
  }

  // Load tech stack for this tab
  loadTechStack();

  // Check user plan for Sonnet button
  loadUserPlan();
};

init();

const renderNewErrors = (errors: CapturedError[]) => {
  for (let i = renderedCount; i < errors.length; i++) {
    renderErrorItem(errors[i], i);
  }
  renderedCount = errors.length;
  updateCounts(errors.length);
};

// Track selected error indices for multi-select
const selectedErrors = new Set<number>();

const renderErrorItem = (err: CapturedError, index: number) => {
  emptyState.classList.add("hidden");
  feedActions.classList.remove("hidden");

  const firstLine = err.text.split("\n")[0].slice(0, 150);
  const time = new Date(err.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const levelClass = err.level === "warning" ? "warning" : err.text.startsWith("Network") ? "network" : "error";

  const item = document.createElement("div");
  item.className = "error-item";
  item.dataset.index = String(index);

  item.innerHTML = `
    <input type="checkbox" class="error-checkbox" data-index="${index}" />
    <div class="error-badge ${levelClass}"></div>
    <div class="error-info">
      <div class="error-text">${escapeHtml(firstLine)}</div>
      <div class="error-meta">${escapeHtml(err.domain || "")}</div>
    </div>
    <div class="error-time">${time}</div>
  `;

  // Checkbox toggle
  const checkbox = item.querySelector(".error-checkbox") as HTMLInputElement;
  checkbox.addEventListener("click", (e) => {
    e.stopPropagation();
    if (checkbox.checked) {
      selectedErrors.add(index);
      item.classList.add("selected");
    } else {
      selectedErrors.delete(index);
      item.classList.remove("selected");
    }
    updateSelectionUI();
  });

  // Click row → toggle checkbox
  item.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event("click"));
  });

  errorFeed.appendChild(item);
  errorFeed.scrollTop = errorFeed.scrollHeight;
};

const updateSelectionUI = () => {
  const count = selectedErrors.size;
  const decodeSelectedBtn = document.getElementById("decode-selected") as HTMLButtonElement;
  decodeSelectedBtn.disabled = count === 0;
  decodeSelectedBtn.textContent = count > 0 ? `Decode Selected (${count})` : "Decode Selected";
};

const updateCounts = (count: number) => {
  errorCountEl.textContent = `${count} error${count !== 1 ? "s" : ""}`;
  statusEl.textContent = `${count} captured`;
  errorBadge.textContent = String(count);
  errorBadge.classList.toggle("hidden", count === 0);
};

// Decode Selected errors
document.getElementById("decode-selected")!.addEventListener("click", async () => {
  if (selectedErrors.size === 0) return;

  const key = getTabKey();
  if (!key) return;
  const result = await chrome.storage.session.get(key);
  const allErrors = result[key] || [];

  const selected = [...selectedErrors].sort().map((i) => allErrors[i]).filter(Boolean);
  if (selected.length === 0) return;

  // Paste into decode tab — user picks the model
  const textarea = document.getElementById("decode-input") as HTMLTextAreaElement;
  if (selected.length === 1) {
    textarea.value = selected[0].text;
  } else {
    textarea.value = selected.map((e: CapturedError, i: number) => `Error ${i + 1} [${e.level}]: ${e.text}`).join("\n\n");
  }
  switchTab("decode");
});

// Decode All — paste into decode tab, user picks model
document.getElementById("decode-all")!.addEventListener("click", async () => {
  const key = getTabKey();
  if (!key) return;
  const result = await chrome.storage.session.get(key);
  const recent = (result[key] || []).slice(-15);
  if (recent.length === 0) return;

  const textarea = document.getElementById("decode-input") as HTMLTextAreaElement;
  textarea.value = recent.map((e: CapturedError, i: number) => `Error ${i + 1} [${e.level}]: ${e.text}`).join("\n\n");
  switchTab("decode");
});

// Clear errors
document.getElementById("clear-errors")!.addEventListener("click", async () => {
  const key = getTabKey();
  if (key) await chrome.storage.session.set({ [key]: [] });
  renderedCount = 0;
  errorFeed.querySelectorAll(".error-item").forEach((el) => el.remove());
  emptyState.classList.remove("hidden");
  feedActions.classList.add("hidden");
  updateCounts(0);
});

// ============================================
// TECH STACK BAR
// ============================================

let detectedTech: Array<{ name: string; category: string; color: string; version?: string }> = [];

const loadTechStack = async () => {
  if (!currentTabId) return;
  const key = `tech_tab_${currentTabId}`;
  const result = await chrome.storage.session.get(key);
  const tech = result[key];
  if (tech?.length) renderTechBar(tech);
};

// Also watch for tech updates
chrome.storage.session.onChanged.addListener((changes) => {
  if (!currentTabId) return;
  const key = `tech_tab_${currentTabId}`;
  if (changes[key]?.newValue) {
    renderTechBar(changes[key].newValue);
  }
});

const renderTechBar = (tech: typeof detectedTech) => {
  detectedTech = tech;
  const bar = document.getElementById("tech-bar")!;
  if (tech.length === 0) {
    bar.classList.add("hidden");
    return;
  }

  bar.classList.remove("hidden");
  bar.innerHTML = tech
    .map((t) => `<span class="tech-badge" style="background:${t.color}" title="${t.name}${t.version ? ` v${t.version}` : ""} (${t.category})">${t.name}</span>`)
    .join("");
};

// Build tech context string for AI prompts
const getTechContext = (): string => {
  if (detectedTech.length === 0) return "";
  const techs = detectedTech.map((t) => `${t.name}${t.version ? ` v${t.version}` : ""}`).join(", ");
  return `\n\nDetected tech stack: ${techs}`;
};

// ============================================
// DECODE TAB — paste + model picker + results
// ============================================

const decodeInput = document.getElementById("decode-input") as HTMLTextAreaElement;
const decodeResult = document.getElementById("decode-result")!;
const sonnetBtn = document.getElementById("decode-sonnet") as HTMLButtonElement;
const sonnetRemaining = document.getElementById("sonnet-remaining")!;

const loadUserPlan = async () => {
  const apiKey = await getApiKey();
  if (!apiKey) return;

  const apiBase = typeof __API_BASE__ !== "undefined" ? __API_BASE__ : "http://localhost:4001/api";
  try {
    const res = await fetch(`${apiBase}/usage`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const json = await res.json();
    if (json.data) {
      // Always check the API for plan status — don't rely on cached storage
      if (json.data.plan === "pro") {
        sonnetBtn.classList.remove("hidden");
        const remaining = json.data.sonnetLimit - json.data.sonnetUsed;
        sonnetRemaining.textContent = `(${remaining} left)`;
      }
      // Update local storage to keep it in sync
      chrome.storage.local.set({ userPlan: json.data.plan });
    }
  } catch {}
};

// Loading state management — prevents double-clicks
let decoding = false;
const haikuBtn = document.getElementById("decode-haiku") as HTMLButtonElement;

const setDecoding = (loading: boolean, phase?: string) => {
  decoding = loading;
  haikuBtn.disabled = loading;
  sonnetBtn.disabled = loading;
  haikuBtn.textContent = loading ? (phase || "Decoding...") : "Decode (Haiku)";
  decodeInput.readOnly = loading;
};

// Ask content script to resolve source maps
const resolveSourceMaps = async (errorText: string): Promise<string> => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return errorText;

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id!, { type: "RESOLVE_SOURCEMAP", errorText }, (response) => {
        resolve(response?.resolved || errorText);
      });
      // Timeout after 5 seconds
      setTimeout(() => resolve(errorText), 5000);
    });
  } catch {
    return errorText;
  }
};

// Decode with Haiku
haikuBtn.addEventListener("click", () => {
  const text = decodeInput.value.trim();
  if (!text || decoding) return;
  decodeSingle(text, "haiku");
});

// Decode with Sonnet (Pro only)
sonnetBtn.addEventListener("click", () => {
  const text = decodeInput.value.trim();
  if (!text || decoding) return;
  decodeSingle(text, "sonnet");
});

const getApiKey = (): Promise<string | null> =>
  new Promise((resolve) => chrome.storage.local.get("apiKey", (r) => resolve(r.apiKey || null)));

const decodeSingle = async (errorText: string, model: "haiku" | "sonnet") => {
  if (decoding) return;

  const apiKey = await getApiKey();
  if (!apiKey) {
    decodeResult.innerHTML = `<p style="color: var(--error-red);">API key not set. Open extension settings and paste your key.</p>`;
    return;
  }

  setDecoding(true, "Resolving source maps...");
  decodeInput.classList.remove("has-results");
  decodeResult.innerHTML = "";

  // Resolve source maps to get actual file names + source code
  const enrichedText = await resolveSourceMaps(errorText);

  setDecoding(true, "Decoding...");
  decodeResult.innerHTML = `<div class="skeleton"></div><div class="skeleton short"></div><div class="skeleton"></div>`;

  const apiBase = typeof __API_BASE__ !== "undefined" ? __API_BASE__ : "http://localhost:4001/api";

  try {
    const response = await fetch(`${apiBase}/decode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ errorText: enrichedText + getTechContext(), model }),
    });

    const json = await response.json();

    if (json.error) {
      decodeResult.innerHTML = `<p style="color: var(--error-red);">${escapeHtml(json.error.message)}</p>`;
      return;
    }

    renderMarkdown(json.data.markdown, decodeResult);
    decodeInput.classList.add("has-results");
  } catch {
    decodeResult.innerHTML = `<p style="color: var(--error-red);">Failed to connect to API.</p>`;
  } finally {
    setDecoding(false);
  }
};

const decodeBatch = async (errors: CapturedError[]) => {
  if (decoding) return;

  const apiKey = await getApiKey();
  if (!apiKey) {
    decodeResult.innerHTML = `<p style="color: var(--error-red);">API key not set.</p>`;
    return;
  }

  setDecoding(true);
  decodeResult.innerHTML = `<div class="skeleton"></div><div class="skeleton short"></div><div class="skeleton"></div><div class="skeleton short"></div>`;

  const apiBase = typeof __API_BASE__ !== "undefined" ? __API_BASE__ : "http://localhost:4001/api";

  try {
    const response = await fetch(`${apiBase}/decode-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        errors: errors.map((e) => ({
          text: e.text,
          level: e.level,
          source: e.text.startsWith("Network") ? "network" : "console",
        })),
        techContext: getTechContext(),
      }),
    });

    const json = await response.json();

    if (json.error) {
      decodeResult.innerHTML = `<p style="color: var(--error-red);">${escapeHtml(json.error.message)}</p>`;
      return;
    }

    renderMarkdown(json.data.markdown, decodeResult);
    decodeInput.classList.add("has-results");
  } catch {
    decodeResult.innerHTML = `<p style="color: var(--error-red);">Failed to connect to API.</p>`;
  } finally {
    setDecoding(false);
  }
};

// ============================================
// INSPECT TAB — element inspector
// ============================================

const inspectBtn = document.getElementById("inspect-btn") as HTMLButtonElement;
const inspectCancelBtn = document.getElementById("inspect-cancel") as HTMLButtonElement;

const startInspect = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "START_INSPECT" });
    inspectBtn.textContent = "🔍 Click an element...";
    inspectBtn.disabled = true;
    inspectCancelBtn.classList.remove("hidden");
  }
};

const cancelInspect = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "STOP_INSPECT" });
  }
  inspectBtn.textContent = "🔍 Click to inspect an element";
  inspectBtn.disabled = false;
  inspectCancelBtn.classList.add("hidden");
};

inspectBtn.addEventListener("click", startInspect);
inspectCancelBtn.addEventListener("click", cancelInspect);

// Re-inspect — pick a new element
document.getElementById("inspect-new")!.addEventListener("click", () => {
  document.getElementById("inspect-selected")!.classList.add("hidden");
  document.getElementById("inspect-start")!.classList.remove("hidden");
  document.getElementById("inspect-result")!.innerHTML = "";
  chrome.storage.session.remove("selectedElement");
  startInspect();
});

// ESC key cancels inspect from sidebar
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !inspectCancelBtn.classList.contains("hidden")) {
    cancelInspect();
  }
});

// Listen for cancel from content script (user pressed ESC on page)
chrome.storage.session.onChanged.addListener((changes) => {
  // Inspect cancelled from page side
  if (changes.selectedElement === undefined && !inspectCancelBtn.classList.contains("hidden")) {
    cancelInspect();
  }
});

const showInspectResult = (el: any) => {
  document.getElementById("inspect-start")!.classList.add("hidden");
  document.getElementById("inspect-selected")!.classList.remove("hidden");
  inspectBtn.textContent = "🔍 Click to inspect an element";
  inspectBtn.disabled = false;
  inspectCancelBtn.classList.add("hidden");

  let info = `<${el.tag}`;
  if (el.id) info += ` id="${el.id}"`;
  if (el.classes?.length) info += ` class="${el.classes.join(" ")}"`;
  info += `>\n`;
  info += `Size: ${el.dimensions?.width}×${el.dimensions?.height}px\n`;
  const styles = Object.entries(el.styles || {}).slice(0, 10);
  if (styles.length) {
    info += `\nComputed styles:\n`;
    for (const [prop, val] of styles) info += `  ${prop}: ${val}\n`;
  }
  if (el.cssRules?.length) {
    info += `\nCSS rules:\n`;
    for (const rule of el.cssRules.slice(-5)) {
      const source = rule.originalFile ? `→ ${rule.originalFile}` : rule.file;
      info += `  ${rule.selector} (${source})\n`;
    }
  }

  document.getElementById("element-info")!.textContent = info;
  document.getElementById("inspect-result")!.innerHTML = "";

  // Show source map tip if on production without resolved files
  // Check the ACTUAL page URL (from tab), not the sidebar's URL
  const hasResolvedFiles = el.cssRules?.some((r: any) => r.originalFile);
  const allInline = el.cssRules?.every((r: any) => r.file === "inline");
  const tipEl = document.getElementById("sourcemap-tip");

  if (tipEl) {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const pageUrl = tab?.url || "";
      const isLocal = pageUrl.includes("localhost") || pageUrl.includes("127.0.0.1");

      // Only show tip on non-local sites with external bundled CSS and no resolved files
      if (!isLocal && !hasResolvedFiles && !allInline) {
        tipEl.classList.remove("hidden");
      } else {
        tipEl.classList.add("hidden");
      }
    });
  }
};

const inspectAskBtn = document.getElementById("inspect-ask-btn") as HTMLButtonElement;
inspectAskBtn.addEventListener("click", async () => {
  const question = (document.getElementById("inspect-question") as HTMLInputElement).value.trim();
  if (!question || inspectAskBtn.disabled) return;
  inspectAskBtn.disabled = true;
  inspectAskBtn.textContent = "Thinking...";

  const { selectedElement } = await chrome.storage.session.get("selectedElement");
  if (!selectedElement) return;

  // Build CSS rules context — include original file if resolved
  const cssRulesText = (selectedElement.cssRules || [])
    .map((r: any) => {
      const source = r.originalFile ? `${r.originalFile} (bundled in ${r.file})` : r.file;
      return `  ${r.selector} → ${source}: ${r.properties}`;
    })
    .join("\n");

  const prompt = `User asks: "${question}"

Element: <${selectedElement.tag}${selectedElement.id ? ` id="${selectedElement.id}"` : ""}${selectedElement.classes?.length ? ` class="${selectedElement.classes.join(" ")}"` : ""}>
Text: "${selectedElement.text}"
Size: ${selectedElement.dimensions?.width}×${selectedElement.dimensions?.height}px
Parent: <${selectedElement.parentTag}>

Computed styles:
${Object.entries(selectedElement.styles || {}).map(([k, v]) => `  ${k}: ${v}`).join("\n")}
${cssRulesText ? `\nCSS rules applying to this element (selector → file):\n${cssRulesText}` : ""}

HTML (truncated):
${selectedElement.outerHTML}${getTechContext()}`;

  const inspectResult = document.getElementById("inspect-result")!;
  inspectResult.innerHTML = `<div class="skeleton"></div><div class="skeleton short"></div>`;

  const apiKey = await getApiKey();
  if (!apiKey) {
    inspectResult.innerHTML = `<p style="color: var(--error-red);">API key not set.</p>`;
    return;
  }

  const apiBase = typeof __API_BASE__ !== "undefined" ? __API_BASE__ : "http://localhost:4001/api";

  try {
    const response = await fetch(`${apiBase}/decode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ errorText: prompt, mode: "inspect" }),
    });

    const json = await response.json();
    if (json.error) {
      inspectResult.innerHTML = `<p style="color: var(--error-red);">${escapeHtml(json.error.message)}</p>`;
      return;
    }

    renderMarkdown(json.data.markdown, inspectResult);
  } catch {
    inspectResult.innerHTML = `<p style="color: var(--error-red);">Failed to connect to API.</p>`;
  } finally {
    inspectAskBtn.disabled = false;
    inspectAskBtn.textContent = "Ask";
  }
});

document.getElementById("inspect-question")!.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("inspect-ask-btn")!.click();
});

// ============================================
// Render helpers
// ============================================

// Render markdown response with copy buttons on code blocks
const renderMarkdown = (markdown: string, container: HTMLElement) => {
  container.innerHTML = marked.parse(markdown) as string;

  // Add copy buttons to all code blocks
  container.querySelectorAll("pre").forEach((pre) => {
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      const code = pre.textContent || "";
      await navigator.clipboard.writeText(code);
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy"; }, 2000);
    });
    wrapper.appendChild(btn);
  });
};

// Basic markdown to HTML fallback (no external lib needed)
const basicMarkdownToHtml = (md: string): string => {
  return md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // Paragraphs (lines not already tagged)
    .replace(/^(?!<[hluop])((?!<).+)$/gm, '<p>$1</p>')
    // Clean up extra newlines
    .replace(/\n{2,}/g, '\n');
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ============================================
// Other UI
// ============================================

document.getElementById("close-panel")!.addEventListener("click", () => {
  window.parent.postMessage({ type: "ERRORDECODER_CLOSE" }, "*");
});

document.getElementById("settings-link")!.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Sidebar — tabbed debugging dashboard
// Tabs: Errors (feed) | Decode (paste + model picker) | Inspect (element AI)

import { marked } from "marked";
import DOMPurify from "dompurify";
import { escapeHtml } from "../shared/html";
import { copyToClipboard, setupResizableGrip } from "../shared/ui";
import { getApiKey } from "../shared/storage";
import { api, API_BASE, AUTH_URL, SITE_URL } from "../shared/api";
import type { CapturedError } from "@shared/types";
import { checkSensitiveData, formatSensitiveWarning } from "../shared/sensitive-check";
import { showConfirmModal } from "../shared/modal";
import { loadHistory, saveToHistory, updateHistoryFeedback, type DecodeHistoryEntry } from "./history";

type CSSRuleInfo = {
  selector: string;
  file: string;
  originalFile?: string;
  properties: string;
};

type InspectedElement = {
  tag: string;
  id?: string;
  classes?: string[];
  dimensions?: { width: number; height: number };
  styles?: Record<string, string>;
  cssRules?: CSSRuleInfo[];
  text?: string;
  parentTag?: string;
  outerHTML?: string;
};

// Resizable elements
const decodeGrip = document.getElementById("textarea-grip");
const decodeTextarea = document.getElementById("decode-input") as HTMLTextAreaElement | null;
if (decodeGrip && decodeTextarea) setupResizableGrip(decodeTextarea, decodeGrip);

const inspectGrip = document.getElementById("inspect-question-grip");
const inspectTextarea = document.getElementById("inspect-question") as HTMLTextAreaElement | null;
if (inspectGrip && inspectTextarea) setupResizableGrip(inspectTextarea, inspectGrip, 32);

const elementInfoGrip = document.getElementById("element-info-grip");
const elementInfo = document.getElementById("element-info");
if (elementInfoGrip && elementInfo) setupResizableGrip(elementInfo, elementInfoGrip, 60);

let renderedCount = 0;

// Feature 5: module-level state for history
let currentDecodeEntry: DecodeHistoryEntry | null = null;

// Feature 6: soft upgrade nudge — count decodes this session
let sessionDecodeCount = 0;

// Feature 9: store all errors for re-sorting
let allErrors: CapturedError[] = [];

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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;
  return currentTabId;
};

// Single unified storage change listener — handles all keys
chrome.storage.session.onChanged.addListener((changes) => {
  const key = getTabKey();
  if (key && changes[key]) {
    renderNewErrors((changes[key].newValue || []) as CapturedError[]);
  }

  // Right-click "Decode this error" → switch to decode tab with text filled
  if (changes.pendingText?.newValue) {
    const textarea = document.getElementById("decode-input") as HTMLTextAreaElement;
    textarea.value = changes.pendingText.newValue as string;
    switchTab("decode");
    chrome.storage.session.remove("pendingText");
  }

  // Element selected from inspector
  if (changes.selectedElement?.newValue) {
    showInspectResult(changes.selectedElement.newValue as InspectedElement);
  }

  // Inspect cancelled from page side: key present, newValue gone, oldValue was set
  if ("selectedElement" in changes && changes.selectedElement.newValue === undefined && changes.selectedElement.oldValue !== undefined) {
    if (!inspectCancelBtn.classList.contains("hidden")) {
      cancelInspect();
    }
  }

  // Tech stack updates
  if (currentTabId) {
    const techKey = `tech_tab_${currentTabId}`;
    if (changes[techKey]?.newValue) {
      renderTechBar(changes[techKey].newValue as typeof detectedTech);
    }
  }
});

// React to auth/plan changes — update sidebar in real-time
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.apiKey) {
    if (changes.apiKey.newValue) {
      document.querySelectorAll(".auth-prompt").forEach((el) => {
        el.innerHTML = `<p style="color: var(--success);">Signed in! You can now decode errors.</p>`;
      });
      // Refresh plan — enables Sonnet button, updates usage display
      loadUserPlan();
    } else {
      // Logged out — full reload resets all UI to signed-out state
      window.location.reload();
      return;
    }
  }
  if (changes.userPlan?.newValue || changes.planRefreshAt) {
    loadUserPlan();
  }
});

// Load existing on open
const init = async () => {
  await resolveTabId();
  const key = getTabKey();

  if (key) {
    const result = await chrome.storage.session.get(key);
    const errors = (result[key] || []) as CapturedError[];
    if (errors.length > 0) renderNewErrors(errors);
  }

  const pendingResult = await chrome.storage.session.get("pendingText");
  const pendingText = pendingResult["pendingText"] as string | undefined;
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

  // Feature 5: populate history dropdown on init
  await populateHistoryDropdown();
};

init();

// ============================================
// Feature 9: Error Severity Sorting
// ============================================

type SortMode = "newest" | "severity" | "source";

const SEVERITY_ORDER: Record<string, number> = { error: 0, network: 1, warning: 2 };

const getLevelClass = (err: CapturedError): string =>
  err.level === "warning" ? "warning" : err.text.startsWith("Network") ? "network" : "error";

const getSource = (err: CapturedError): string =>
  err.source === "network" || err.text.startsWith("Network") ? "network" : "console";

const sortErrors = (errors: CapturedError[], mode: SortMode): CapturedError[] => {
  const copy = [...errors];
  if (mode === "severity") {
    copy.sort((a, b) => {
      const aLevel = getLevelClass(a);
      const bLevel = getLevelClass(b);
      const aOrder = SEVERITY_ORDER[aLevel] ?? 3;
      const bOrder = SEVERITY_ORDER[bLevel] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.timestamp - a.timestamp;
    });
  } else if (mode === "source") {
    // Group by source: console errors first, then network errors
    copy.sort((a, b) => {
      const aSource = getSource(a);
      const bSource = getSource(b);
      if (aSource !== bSource) return aSource === "console" ? -1 : 1;
      return b.timestamp - a.timestamp;
    });
  }
  return copy;
};

const rerenderFeed = (errors: CapturedError[]) => {
  // Remove existing error items (keep empty-state in place)
  errorFeed.querySelectorAll(".error-item").forEach((el) => el.remove());
  renderedCount = 0;
  selectedErrors.clear();
  updateSelectionUI();
  for (let i = 0; i < errors.length; i++) {
    const err = errors[i];
    if (!err) continue;
    renderErrorItem(err, i);
  }
  renderedCount = errors.length;
};

const getSortMode = (): SortMode => {
  const select = document.getElementById("error-sort") as HTMLSelectElement;
  return (select?.value ?? "newest") as SortMode;
};

document.getElementById("error-sort")!.addEventListener("change", () => {
  const mode = getSortMode();
  const sorted = sortErrors(allErrors, mode);
  rerenderFeed(sorted);
  if (allErrors.length > 0) {
    emptyState.classList.add("hidden");
    feedActions.classList.remove("hidden");
  }
  updateCounts(allErrors.length);
});

const renderNewErrors = (errors: CapturedError[]) => {
  allErrors = errors;
  const mode = getSortMode();
  if (mode === "newest") {
    // Append-only — just render newly arrived items
    for (let i = renderedCount; i < errors.length; i++) {
      const err = errors[i];
      if (!err) continue;
      renderErrorItem(err, i);
    }
    renderedCount = errors.length;
  } else {
    // Re-sort the full set and re-render
    rerenderFeed(sortErrors(errors, mode));
  }
  updateCounts(errors.length);
};

// Track selected error indices for multi-select
const selectedErrors = new Set<number>();

const renderErrorItem = (err: CapturedError, index: number) => {
  emptyState.classList.add("hidden");
  feedActions.classList.remove("hidden");

  // Preview first 150 chars in error feed
  const firstLine = (err.text.split("\n")[0] ?? "").slice(0, 150);
  const time = new Date(err.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const levelClass = getLevelClass(err);

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
  const storedErrors = (result[key] || []) as CapturedError[];

  const selected = [...selectedErrors].sort().map((i) => storedErrors[i]).filter((e): e is CapturedError => !!e);
  if (selected.length === 0) return;

  // Paste into decode tab — user picks the model
  const textarea = document.getElementById("decode-input") as HTMLTextAreaElement;
  const [firstSelected] = selected;
  if (selected.length === 1 && firstSelected) {
    textarea.value = firstSelected.text;
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
  // Batch last 15 errors for Decode All
  const recent = ((result[key] || []) as CapturedError[]).slice(-15);
  if (recent.length === 0) return;

  const textarea = document.getElementById("decode-input") as HTMLTextAreaElement;
  textarea.value = recent.map((e: CapturedError, i: number) => `Error ${i + 1} [${e.level}]: ${e.text}`).join("\n\n");
  switchTab("decode");
});

// Clear errors
document.getElementById("clear-errors")!.addEventListener("click", async () => {
  const key = getTabKey();
  if (key) await chrome.storage.session.set({ [key]: [] });
  allErrors = [];
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
  const tech = result[key] as typeof detectedTech | undefined;
  if (tech?.length) renderTechBar(tech);
};

const renderTechBar = (tech: typeof detectedTech) => {
  detectedTech = tech;
  const bar = document.getElementById("tech-bar")!;
  if (tech.length === 0) {
    bar.classList.add("hidden");
    return;
  }

  bar.classList.remove("hidden");
  bar.innerHTML = tech
    .map((t) => `<span class="tech-badge" style="background:${escapeHtml(t.color)}" title="${escapeHtml(t.name)}${t.version ? ` v${escapeHtml(t.version)}` : ""} (${escapeHtml(t.category)})">${escapeHtml(t.name)}</span>`)
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
const haikuRemaining = document.getElementById("haiku-remaining")!;
const usageBar = document.getElementById("usage-bar")!;
const usageIndicator = document.getElementById("usage-indicator")!;

// Track current plan for nudge logic
let currentPlan: string = "free";

const updateUsageDisplay = (used: number, limit: number, plan: string, resetsAt?: string) => {
  currentPlan = plan;

  if (plan === "pro") {
    haikuRemaining.textContent = "";
    haikuBtn.disabled = false;
    usageBar.classList.add("hidden");
    usageIndicator.classList.add("hidden");
    return;
  }

  const remaining = Math.max(0, limit - used);
  haikuRemaining.textContent = `(${remaining} left)`;

  // Feature 7: header usage indicator
  usageIndicator.textContent = `${used}/${limit}`;
  usageIndicator.classList.remove("hidden", "limit-hit");

  usageBar.classList.remove("hidden");
  if (remaining === 0) {
    haikuBtn.disabled = true;
    const resetText = resetsAt ? ` Resets ${new Date(resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "";
    haikuRemaining.textContent = `(limit reached${resetText})`;
    usageBar.className = "usage-bar limit-hit";
    usageBar.innerHTML = `
      <a href="#" id="upgrade-cta" class="btn btn-primary btn-upgrade">Upgrade to Pro</a>`;
    usageBar.querySelector("#upgrade-cta")?.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: `${SITE_URL}/#pricing` });
    });
    usageIndicator.classList.add("limit-hit");
  } else {
    haikuBtn.disabled = false;
    usageBar.className = "usage-bar";
    usageBar.innerHTML = `${used} of ${limit} free decodes used today · <a href="#" id="upgrade-link">Upgrade</a>`;
    usageBar.querySelector("#upgrade-link")?.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: `${SITE_URL}/#pricing` });
    });
  }
};

const loadUserPlan = async () => {
  const apiKey = await getApiKey();
  if (!apiKey) return;

  try {
    const response = await api.usage();
    if ("data" in response) {
      const { plan, used, limit, sonnetUsed, sonnetLimit, resetsAt } = response.data;
      if (plan === "pro") {
        sonnetBtn.classList.remove("hidden");
        const remaining = sonnetLimit - sonnetUsed;
        sonnetRemaining.textContent = `(${remaining} left)`;
      }
      updateUsageDisplay(used, limit, plan, resetsAt);
      chrome.storage.local.set({ userPlan: plan });
    }
  } catch {}
};

// Loading state management — prevents double-clicks
let isDecoding = false;
const haikuBtn = document.getElementById("decode-haiku") as HTMLButtonElement;

const setDecoding = (loading: boolean, phase?: string) => {
  isDecoding = loading;
  haikuBtn.disabled = loading;
  sonnetBtn.disabled = loading;
  // Update text without destroying the haiku-remaining span reference
  const textNode = haikuBtn.firstChild;
  if (loading) {
    haikuRemaining.classList.add("hidden");
    if (textNode) textNode.textContent = phase || "Decoding...";
  } else {
    haikuRemaining.classList.remove("hidden");
    if (textNode) textNode.textContent = "Decode (Haiku) ";
  }
  decodeInput.readOnly = loading;
};

// Ask content script to resolve source maps
const resolveSourceMaps = async (errorText: string): Promise<string> => {
  if (!currentTabId) return errorText;
  try {
    return new Promise((resolve) => {
      // 5s timeout for content script source map resolution
      const timer = setTimeout(() => resolve(errorText), 5000);
      chrome.tabs.sendMessage(currentTabId!, { type: "RESOLVE_SOURCEMAP", errorText }, (response) => {
        clearTimeout(timer);
        resolve(response?.resolved || errorText);
      });
    });
  } catch {
    return errorText;
  }
};

// Decode with Haiku
haikuBtn.addEventListener("click", () => {
  const text = decodeInput.value.trim();
  if (!text || isDecoding) return;
  decodeSingle(text, "haiku");
});

// Decode with Sonnet (Pro only)
sonnetBtn.addEventListener("click", () => {
  const text = decodeInput.value.trim();
  if (!text || isDecoding) return;
  decodeSingle(text, "sonnet");
});

const decodeSingle = async (errorText: string, model: "haiku" | "sonnet") => {
  if (isDecoding) return;
  isDecoding = true;

  const apiKey = await getApiKey();
  if (!apiKey) {
    isDecoding = false;
    decodeResult.innerHTML = `
    <div class="auth-prompt">
      <p>Sign up to start decoding errors</p>
      <p class="auth-sub">Free account — 3 decodes per day</p>
      <button class="btn btn-primary auth-signup-btn">Sign Up Free</button>
      <p class="auth-fallback">Already have a key? <a href="#" class="auth-settings-link">Paste it in Settings</a></p>
    </div>`;
    decodeResult.querySelector(".auth-signup-btn")?.addEventListener("click", () => {
      chrome.tabs.create({ url: AUTH_URL });
    });
    decodeResult.querySelector(".auth-settings-link")?.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    return;
  }

  // Check for sensitive data before sending
  const sensitiveMatches = checkSensitiveData(errorText);
  if (sensitiveMatches.length > 0) {
    const proceed = await showConfirmModal({
      title: "Sensitive Data Detected",
      message: formatSensitiveWarning(sensitiveMatches),
      confirmText: "Send Anyway",
      cancelText: "Go Back & Edit",
      confirmDanger: true,
    });
    if (!proceed) {
      isDecoding = false;
      return;
    }
  }

  setDecoding(true, "Resolving source maps...");
  decodeInput.classList.remove("has-results");
  decodeResult.innerHTML = "";

  // Resolve source maps to get actual file names + source code
  const enrichedText = await resolveSourceMaps(errorText);

  setDecoding(true, "Decoding...");
  decodeResult.innerHTML = `<div class="skeleton"></div><div class="skeleton short"></div><div class="skeleton"></div>`;

  try {
    const response = await fetch(`${API_BASE}/decode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ errorText: enrichedText + getTechContext(), model }),
    });

    const json = await response.json();

    if (json.error) {
      if (response.status === 401) {
        decodeResult.innerHTML = `
          <div class="auth-prompt">
            <p>Your API key is invalid or expired.</p>
            <p class="auth-sub">Sign in again or paste a new key in Settings.</p>
            <button class="btn btn-primary auth-signup-btn">Sign In</button>
            <p class="auth-fallback"><a href="#" class="auth-settings-link">Open Settings</a></p>
          </div>`;
        decodeResult.querySelector(".auth-signup-btn")?.addEventListener("click", () => {
          chrome.tabs.create({ url: AUTH_URL });
        });
        decodeResult.querySelector(".auth-settings-link")?.addEventListener("click", (e) => {
          e.preventDefault();
          chrome.runtime.openOptionsPage();
        });
        return;
      }
      if (json.upgradeUrl) {
        decodeResult.innerHTML = `
          <div class="auth-prompt">
            <p>${escapeHtml(json.error.message)}</p>
            <a href="#" class="btn btn-primary btn-upgrade" id="upgrade-429">Upgrade to Pro</a>
          </div>`;
        decodeResult.querySelector("#upgrade-429")?.addEventListener("click", (e) => {
          e.preventDefault();
          chrome.tabs.create({ url: `${SITE_URL}/#pricing` });
        });
      } else {
        decodeResult.innerHTML = `<p class="error-msg">${escapeHtml(json.error.message)}</p>`;
      }
      return;
    }

    const { markdown, decodeId, cached } = json.data as { markdown: string; decodeId?: string; cached: boolean; model: "haiku" | "sonnet" };

    renderMarkdown(markdown, decodeResult);
    decodeInput.classList.add("has-results");

    // Feature 3: feedback buttons
    renderFeedbackButtons(decodeResult, decodeId);

    // Feature 5: save to history
    const entryId = crypto.randomUUID();
    const entry: DecodeHistoryEntry = {
      id: entryId,
      decodeId,
      errorPreview: errorText.slice(0, 80).replace(/\n/g, " "),
      markdown,
      model,
      cached,
      timestamp: Date.now(),
    };
    currentDecodeEntry = entry;
    await saveToHistory(entry);
    await populateHistoryDropdown();

    // Feature 6: soft upgrade nudge for free users
    sessionDecodeCount++;
    if (currentPlan !== "pro" && sessionDecodeCount % 3 === 0) {
      renderUpgradeNudge(decodeResult);
    }
  } catch {
    decodeResult.innerHTML = `<p class="error-msg">Failed to connect to API.</p>`;
  } finally {
    setDecoding(false);
    loadUserPlan(); // Refresh usage count after decode
  }
};

// ============================================
// Feature 3: Thumbs Up/Down Feedback
// ============================================

const renderFeedbackButtons = (container: HTMLElement, decodeId?: string, existingFeedback?: "up" | "down") => {
  if (!decodeId) return;

  const bar = document.createElement("div");
  bar.className = "feedback-bar";

  const upBtn = document.createElement("button");
  upBtn.className = "feedback-btn";
  upBtn.textContent = "👍";
  upBtn.setAttribute("aria-label", "Helpful");

  const downBtn = document.createElement("button");
  downBtn.className = "feedback-btn";
  downBtn.textContent = "👎";
  downBtn.setAttribute("aria-label", "Not helpful");

  // Pre-highlight if loaded from history
  if (existingFeedback === "up") {
    upBtn.classList.add("active-up");
    upBtn.disabled = true;
    downBtn.disabled = true;
  } else if (existingFeedback === "down") {
    downBtn.classList.add("active-down");
    upBtn.disabled = true;
    downBtn.disabled = true;
  }

  const submitFeedback = async (thumbsUp: boolean) => {
    upBtn.disabled = true;
    downBtn.disabled = true;
    if (thumbsUp) {
      upBtn.classList.add("active-up");
    } else {
      downBtn.classList.add("active-down");
    }

    // Persist in history
    if (currentDecodeEntry) {
      currentDecodeEntry.feedbackGiven = thumbsUp ? "up" : "down";
      await updateHistoryFeedback(currentDecodeEntry.id, thumbsUp ? "up" : "down");
    }

    try {
      await api.feedback({ decodeId, thumbsUp });
    } catch {
      // Feedback is best-effort — don't surface errors to user
    }
  };

  upBtn.addEventListener("click", () => submitFeedback(true));
  downBtn.addEventListener("click", () => submitFeedback(false));

  bar.appendChild(upBtn);
  bar.appendChild(downBtn);
  container.appendChild(bar);
};

// ============================================
// Feature 5: Decode History dropdown
// ============================================

const populateHistoryDropdown = async () => {
  const history = await loadHistory();
  const select = document.getElementById("history-select") as HTMLSelectElement;
  const historyBar = document.getElementById("decode-history-bar")!;

  if (history.length === 0) {
    historyBar.classList.add("hidden");
    return;
  }

  historyBar.classList.remove("hidden");
  // Reset to default option then repopulate
  select.innerHTML = `<option value="">Recent decodes...</option>`;
  history.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    option.textContent = `${time} — ${entry.errorPreview}`;
    select.appendChild(option);
  });
};

document.getElementById("history-select")!.addEventListener("change", async (e) => {
  const select = e.target as HTMLSelectElement;
  const id = select.value;
  if (!id) return;

  const history = await loadHistory();
  const entry = history.find((h) => h.id === id);
  if (!entry) return;

  currentDecodeEntry = entry;
  renderMarkdown(entry.markdown, decodeResult);
  decodeInput.classList.add("has-results");
  renderFeedbackButtons(decodeResult, entry.decodeId, entry.feedbackGiven);
});

// ============================================
// Feature 6: Soft upgrade nudge
// ============================================

const renderUpgradeNudge = (container: HTMLElement) => {
  const nudge = document.createElement("div");
  nudge.className = "upgrade-nudge";

  const text = document.createElement("span");
  text.className = "upgrade-nudge-text";
  text.innerHTML = `Liked this? Pro gives unlimited decodes + Deep Analysis. <a href="#" class="upgrade-nudge-link">Upgrade</a>`;

  const dismiss = document.createElement("button");
  dismiss.className = "upgrade-nudge-dismiss";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss");

  nudge.appendChild(text);
  nudge.appendChild(dismiss);
  container.appendChild(nudge);

  nudge.querySelector(".upgrade-nudge-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${SITE_URL}/#pricing` });
  });

  dismiss.addEventListener("click", () => {
    nudge.remove();
  });
};

// ============================================
// INSPECT TAB — element inspector
// ============================================

const inspectBtn = document.getElementById("inspect-btn") as HTMLButtonElement;
const inspectCancelBtn = document.getElementById("inspect-cancel") as HTMLButtonElement;

const startInspect = () => {
  if (!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId, { type: "START_INSPECT" });
  inspectBtn.textContent = "🔍 Click an element...";
  inspectBtn.disabled = true;
  inspectCancelBtn.classList.remove("hidden");
};

const cancelInspect = () => {
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, { type: "STOP_INSPECT" });
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

const showInspectResult = (el: InspectedElement) => {
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
  const hasResolvedFiles = el.cssRules?.some((r: CSSRuleInfo) => r.originalFile);
  const allInline = el.cssRules?.every((r: CSSRuleInfo) => r.file === "inline");
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
  const question = (document.getElementById("inspect-question") as HTMLTextAreaElement).value.trim();
  if (!question || inspectAskBtn.disabled) return;
  inspectAskBtn.disabled = true;
  inspectAskBtn.textContent = "Thinking...";

  const elementResult = await chrome.storage.session.get("selectedElement");
  const selectedElement = elementResult["selectedElement"] as InspectedElement | undefined;
  if (!selectedElement) return;

  // Build CSS rules context — include original file if resolved
  const cssRulesText = (selectedElement.cssRules || [])
    .map((r: CSSRuleInfo) => {
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

  // Check for sensitive data in element content
  const inspectSensitive = checkSensitiveData(prompt);
  if (inspectSensitive.length > 0) {
    const proceed = await showConfirmModal({
      title: "Sensitive Data Detected",
      message: formatSensitiveWarning(inspectSensitive),
      confirmText: "Send Anyway",
      cancelText: "Cancel",
      confirmDanger: true,
    });
    if (!proceed) {
      inspectAskBtn.disabled = false;
      inspectAskBtn.textContent = "Ask";
      return;
    }
  }

  const inspectResult = document.getElementById("inspect-result")!;
  inspectResult.innerHTML = `<div class="skeleton"></div><div class="skeleton short"></div>`;

  const apiKey = await getApiKey();
  if (!apiKey) {
    inspectResult.innerHTML = `
    <div class="auth-prompt">
      <p>Sign up to ask about elements</p>
      <p class="auth-sub">Free account — 3 decodes per day</p>
      <button class="btn btn-primary auth-signup-btn">Sign Up Free</button>
      <p class="auth-fallback">Already have a key? <a href="#" class="auth-settings-link">Paste it in Settings</a></p>
    </div>`;
    inspectResult.querySelector(".auth-signup-btn")?.addEventListener("click", () => {
      chrome.tabs.create({ url: AUTH_URL });
    });
    inspectResult.querySelector(".auth-settings-link")?.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    inspectAskBtn.disabled = false;
    inspectAskBtn.textContent = "Ask";
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/decode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ errorText: prompt, mode: "inspect" }),
    });

    const json = await response.json();
    if (json.error) {
      inspectResult.innerHTML = `<p class="error-msg">${escapeHtml(json.error.message)}</p>`;
      return;
    }

    renderMarkdown(json.data.markdown, inspectResult);
  } catch {
    inspectResult.innerHTML = `<p class="error-msg">Failed to connect to API.</p>`;
  } finally {
    inspectAskBtn.disabled = false;
    inspectAskBtn.textContent = "Ask";
  }
});

// Enter submits, Shift+Enter for newlines
document.getElementById("inspect-question")!.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.getElementById("inspect-ask-btn")!.click();
  }
});

// ============================================
// Render helpers
// ============================================

// Feature 4: Copy Full Result — prepend toolbar with Copy button
const renderMarkdown = (markdown: string, container: HTMLElement) => {
  container.innerHTML = DOMPurify.sanitize(marked.parse(markdown) as string);

  // Add copy buttons to all code blocks
  container.querySelectorAll("pre").forEach((pre) => {
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

  // Prepend toolbar with Copy All button (captures raw markdown)
  const toolbar = document.createElement("div");
  toolbar.className = "result-toolbar";
  const copyAllBtn = document.createElement("button");
  copyAllBtn.className = "btn btn-secondary copy-all-btn";
  copyAllBtn.textContent = "Copy";
  copyAllBtn.addEventListener("click", () => copyToClipboard(copyAllBtn, () => markdown, "Copy"));
  toolbar.appendChild(copyAllBtn);
  container.insertBefore(toolbar, container.firstChild);
};

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

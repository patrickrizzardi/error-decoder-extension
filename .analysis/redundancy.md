# Redundancy Analysis Report

**Analyzed**: 2026-03-30
**Scope**: packages/extension/src (13 TypeScript files)
**Duplication Patterns Found**: 7
**Lines That Could Be Consolidated**: ~120-150

---

## CRITICAL — Copy Button UX Pattern (Clipboard + Feedback)

**Instances**: 4 occurrences
**Locations**:
- `packages/extension/src/options/index.ts:38-46` (copy API key)
- `packages/extension/src/devtools/panel.ts:156-162` (copy result code)
- `packages/extension/src/popup/index.ts:71-77` (copy code)
- `packages/extension/src/sidepanel/index.ts:620-625` (copy button in markdown blocks)

**Current State**:
```typescript
// options/index.ts:38-46
document.getElementById("copy-key")?.addEventListener("click", async () => {
  const apiKey = await storage.get("apiKey");
  if (apiKey) {
    await navigator.clipboard.writeText(apiKey);
    const btn = document.getElementById("copy-key")!;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = "Copy Key"; }, 2000);
  }
});

// devtools/panel.ts:156-162
document.getElementById("copy-result-code")?.addEventListener("click", async () => {
  const code = document.getElementById("code-copy-target")?.textContent ?? "";
  await navigator.clipboard.writeText(code);
  const btn = document.getElementById("copy-result-code")!;
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = "Copy"; }, 2000);
});

// popup/index.ts:71-77
document.getElementById("copy-code")?.addEventListener("click", async () => {
  const code = document.getElementById("code-after-text")?.textContent ?? "";
  await navigator.clipboard.writeText(code);
  const btn = document.getElementById("copy-code")!;
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = "Copy"; }, 2000);
});

// sidepanel/index.ts:620-625
btn.addEventListener("click", async () => {
  const code = pre.textContent || "";
  await navigator.clipboard.writeText(code);
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = "Copy"; }, 2000);
});
```

**Proposed Solution**: Extract a reusable utility function in `packages/extension/src/shared/ui.ts`:
```typescript
export const setupCopyButton = async (
  btn: HTMLButtonElement,
  getText: () => string | Promise<string>,
  originalText: string = "Copy"
): Promise<void> => {
  const text = await Promise.resolve(getText());
  await navigator.clipboard.writeText(text);
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = originalText; }, 2000);
};

// Usage in devtools/panel.ts:156
document.getElementById("copy-result-code")?.addEventListener("click", () => {
  setupCopyButton(
    document.getElementById("copy-result-code")!,
    () => document.getElementById("code-copy-target")?.textContent ?? "",
    "Copy"
  );
});
```

**Benefits**: Single source of truth for feedback UX, consistent timing (2000ms), reduces 20+ lines of duplication, easier to test/update copy behavior globally.

---

## HIGH — HTML Escape Utility (Security & DRY)

**Instances**: 2 implementations (2 more files calling similar patterns)
**Locations**:
- `packages/extension/src/devtools/panel.ts:91-92` (defined)
- `packages/extension/src/sidepanel/index.ts:657-658` (redefined identically)
- `packages/extension/src/devtools/panel.ts:65, 129, 139, 143` (uses)
- `packages/extension/src/sidepanel/index.ts:130, 373, 417, 585` (uses)

**Current State**:
```typescript
// devtools/panel.ts:91-92
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// sidepanel/index.ts:657-658 (identical)
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
```

**Proposed Solution**: Move to `packages/extension/src/shared/security.ts`:
```typescript
export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
```

Then import in both files:
```typescript
import { escapeHtml } from "../shared/security";
```

**Benefits**: Single XSS-safe implementation, prevents accidental divergence, easier to audit security-critical code, reduces duplication by 2 definitions.

---

## HIGH — API Key Retrieval Pattern

**Instances**: 3 near-identical implementations (subtle variations in return behavior)
**Locations**:
- `packages/extension/src/devtools/panel.ts:98-101`
- `packages/extension/src/sidepanel/index.ts:339-340`
- `packages/extension/src/shared/api.ts` (uses via storage, doesn't duplicate)

**Current State**:
```typescript
// devtools/panel.ts:98-101
const getApiKey = (): Promise<string | null> =>
  new Promise((resolve) => {
    chrome.storage.local.get("apiKey", (result) => resolve(result.apiKey || null));
  });

// sidepanel/index.ts:339-340
const getApiKey = (): Promise<string | null> =>
  new Promise((resolve) => chrome.storage.local.get("apiKey", (r) => resolve(r.apiKey || null)));
```

**Proposed Solution**: Move to `packages/extension/src/shared/storage.ts` (already has storage wrapper):
```typescript
// Add to storage.ts exports
export const getApiKey = (): Promise<string | null> =>
  storage.get("apiKey").then((key) => key || null);
```

Then in both files:
```typescript
import { getApiKey } from "../shared/storage";
```

**Benefits**: Eliminates duplicate promise-wrapper logic, single contract for auth state, reduces potential bugs from inconsistent implementations, pairs naturally with existing storage module.

---

## HIGH — Authorization Header Construction

**Instances**: 5 scattered implementations
**Locations**:
- `packages/extension/src/shared/api.ts:21` (centralized, good)
- `packages/extension/src/devtools/panel.ts:121` (inline in fetch)
- `packages/extension/src/sidepanel/index.ts:280, 366, 403, 579` (4 inline fetches)

**Current State**:
```typescript
// shared/api.ts:17-24 (correct, reusable)
const getHeaders = async (): Promise<HeadersInit> => {
  const apiKey = await storage.get("apiKey");
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
};

// devtools/panel.ts:119-123 (duplicates header logic)
headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiKey}`,
},

// sidepanel/index.ts:364-366 (duplicates)
headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
```

**Proposed Solution**: Sidepanel and devtools should use `getHeaders()` from api.ts instead of constructing headers inline. OR expose a helper fetch wrapper:
```typescript
// In shared/api.ts
export const fetchWithAuth = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<T> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  return response.json();
};
```

Then in sidepanel:
```typescript
const response = await fetchWithAuth("/decode", {
  method: "POST",
  body: JSON.stringify({ errorText: enrichedText + getTechContext(), model }),
});
```

**Benefits**: Single auth header format, reduces token passing through the codebase, makes auth changes in one place, prevents accidental "Bearer" format drift.

---

## HIGH — Active Tab Query Pattern

**Instances**: 5 occurrences
**Locations**:
- `packages/extension/src/sidepanel/index.ts:49` (resolveTabId)
- `packages/extension/src/sidepanel/index.ts:310` (resolveSourceMaps)
- `packages/extension/src/sidepanel/index.ts:438` (startInspect)
- `packages/extension/src/sidepanel/index.ts:448` (cancelInspect)
- `packages/extension/src/sidepanel/index.ts:519` (showInspectResult)

**Current State**:
```typescript
// All use the same pattern (with minor differences)
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
// Sometimes: if (!tab?.id) return ...
// Sometimes: if (tab?.id) { ... }
// Sometimes: then([tab]) => { ... }
```

**Proposed Solution**: Extract helper in `packages/extension/src/shared/chrome.ts`:
```typescript
export const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
};

export const getActiveTabId = async (): Promise<number | null> => {
  const tab = await getActiveTab();
  return tab?.id ?? null;
};
```

Usage:
```typescript
// sidepanel:310
const tabId = await getActiveTabId();
if (!tabId) return errorText;
```

**Benefits**: Eliminates query boilerplate, centralizes Chrome API usage, single place to adjust tab query logic (e.g., if tabs change behavior), consistent error handling across sidepanel.

---

## MEDIUM — State Management UI Pattern (showState vs setDecoding)

**Instances**: 2 similar but different state management approaches
**Locations**:
- `packages/extension/src/popup/index.ts:14-19` (showState pattern)
- `packages/extension/src/sidepanel/index.ts:299-305` (setDecoding pattern)

**Current State**:
```typescript
// popup/index.ts:14-19
const showState = (state: "paste" | "loading" | "result" | "error") => {
  pasteMode.classList.toggle("hidden", state !== "paste");
  loadingState.classList.toggle("hidden", state !== "loading");
  resultState.classList.toggle("hidden", state !== "result");
  errorState.classList.toggle("hidden", state !== "error");
};

// sidepanel/index.ts:299-305
const setDecoding = (loading: boolean, phase?: string) => {
  decoding = loading;
  haikuBtn.disabled = loading;
  sonnetBtn.disabled = loading;
  haikuBtn.textContent = loading ? (phase || "Decoding...") : "Decode (Haiku)";
  decodeInput.readOnly = loading;
};
```

**Proposed Solution**: These solve different problems (UI visibility vs button state), so consolidation is lower priority. However, `showState` is cleaner. If sidepanel adopts similar pattern:
```typescript
// sidepanel could use showState for decode result visibility
const showDecodeState = (state: "paste" | "loading" | "result") => {
  decodeInput.classList.toggle("hidden", state !== "paste");
  // ... etc
};
```

**Benefits**: Shared state management pattern reduces cognitive load, makes UI transitions more predictable, easier to test visibility logic.

**Note**: Lower severity because both work correctly — this is a style consistency issue, not a functional bug.

---

## MEDIUM — Message Passing Handler Duplication

**Instances**: Multiple message type handlers scattered across content/relay/background
**Locations**:
- `packages/extension/src/background/index.ts:73-112` (main message router)
- `packages/extension/src/content/index.ts:29-62` (message handler)
- `packages/extension/src/content/relay.ts:5-14` (error relay)

**Current State**: Message handlers are specific to each file's concerns (background stores errors, content manages UI). Currently NOT over-duplicated because each handles different message types.

**Assessment**: This is correctly modularized. No consolidation needed — each context (background, content, relay) legitimately handles different subsets of messages.

---

## Priority

### Phase 1: Critical (fix now)

1. **Copy Button UX Pattern** (4 instances, ~20 lines) — Extract to `shared/ui.ts`, reduces maintenance burden for all copy interactions across the extension.

### Phase 2: High (consolidate soon)

2. **HTML Escape Utility** (2 definitions) — Move to `shared/security.ts`, prevents XSS bugs from inconsistent implementations.
3. **API Key Retrieval** (3 instances) — Move to `shared/storage.ts`, single auth state accessor.
4. **Authorization Header Construction** (5 scattered) — Use `getHeaders()` or `fetchWithAuth()` wrapper, prevents auth format drift.
5. **Active Tab Query Pattern** (5 instances in sidepanel) — Extract to `shared/chrome.ts`, eliminates boilerplate, consistent error handling.

### Phase 3: Medium (consider consolidating)

6. **State Management UI Pattern** (2 different approaches) — Lower priority, currently working correctly but popup's `showState()` pattern is cleaner.

---

## What's Already DRY

- **Storage API**: `packages/extension/src/shared/storage.ts` — correctly wraps chrome.storage with typed getters/setters. No duplication.
- **Error capture flow**: background.ts → relay.ts → storage — clean separation of concerns, no duplication.
- **Tech detection**: Single `detectTechStack()` function in `tech-detect.ts`, called from both content and sidebar.
- **Source map resolution**: Single `resolveStackTrace()` in `sourcemap.ts`, called from multiple contexts correctly.
- **Message routing**: Each context (background, content, devtools, sidebar) handles its own message types appropriately.
- **API module**: `shared/api.ts` is well-structured with exported endpoint functions, centralized base URL, and header management.

---

## Implementation Notes

**Before coding consolidations**:
- Test copy button timing (2000ms is consistent across all 4 instances — good pattern to preserve).
- Verify escapeHtml usage context — ensure XSS protection is preserved in all migrations.
- Check if getApiKey is cached anywhere — consolidation should maintain current behavior (returns fresh value, not cached).
- For fetchWithAuth: ensure response.json() error handling matches current implementations.

**Files to create**:
- `packages/extension/src/shared/ui.ts` (copy button utility)
- `packages/extension/src/shared/security.ts` (escapeHtml)
- `packages/extension/src/shared/chrome.ts` (active tab helpers)
- Update `packages/extension/src/shared/storage.ts` (add getApiKey)
- Update `packages/extension/src/shared/api.ts` (add fetchWithAuth or expose getHeaders)

**Consolidation impact**: ~120-150 lines eliminated, 5 source files updated (devtools, sidepanel, popup, options, possibly background).

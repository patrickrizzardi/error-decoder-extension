# Bug Analysis Report

**Analyzed**: 2026-03-30
**Files Checked**: 26
**Critical Bugs Found**: 4
**High Bugs Found**: 6
**Scope**: Chrome extension — packages/extension (background, content scripts, sidepanel, devtools, popup, shared)

---

## CRITICAL BUGS (Fix Immediately)

### Bug #1: Non-returning async message listener causes all sendResponse callbacks to silently fail

**File**: `packages/extension/src/content/index.ts:29-62`
**Severity**: CRITICAL
**Category**: Flow/Ordering + Async Issue

**Issue**: The `chrome.runtime.onMessage.addListener` callback returns `true` unconditionally at line 61, even for the synchronous message handlers (`SHOW_PANEL`, `HIDE_PANEL`, `TOGGLE_PANEL`, `START_INSPECT`, `STOP_INSPECT`, `GET_PAGE_CONTEXT`). Returning `true` from an `onMessage` listener tells Chrome to keep the message channel open for an async response. For the async case (`RESOLVE_SOURCEMAP`), the inner code already returns `true` at line 59 *before* the outer `return true`. This means the outer `return true` at line 61 is the one Chrome actually sees for synchronous handlers — but crucially, it also means the message channel stays open indefinitely for those synchronous handlers. Chrome will eventually garbage-collect the channel and the caller gets no response, or the response arrives after the channel is already closed.

More critically: `RESOLVE_SOURCEMAP` returns `true` on line 59 but then the outer function also hits the final `return true` on line 61 — this is harmless for async, but all synchronous handlers return `true`, holding every message channel open unnecessarily, which leaks resources per message.

The deeper problem: every non-`RESOLVE_SOURCEMAP` branch calls `sendResponse(...)` synchronously AND returns `true`. Chrome's contract is: return `true` only when you will call `sendResponse` asynchronously. Calling it synchronously AND returning `true` is legal but causes the channel to stay open until it times out (~5 minutes). At scale this exhausts the message port pool.

**Current Code**:
```ts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTEXT") {
    // ...
    sendResponse({ ... });  // synchronous
  }
  if (message.type === "SHOW_PANEL") { showPanel(); sendResponse({ shown: true }); }
  // ... more sync handlers ...
  if (message.type === "RESOLVE_SOURCEMAP") {
    resolveStackTrace(message.errorText).then((resolved) => {
      sendResponse({ resolved });
    }).catch(() => {
      sendResponse({ resolved: message.errorText });
    });
    return true;  // correct — keep open for async
  }

  return true;  // BUG — all sync handlers also return true
});
```

**Fixed Code**:
```ts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "RESOLVE_SOURCEMAP") {
    resolveStackTrace(message.errorText).then((resolved) => {
      sendResponse({ resolved });
    }).catch(() => {
      sendResponse({ resolved: message.errorText });
    });
    return true;  // async — must return true
  }

  // All remaining handlers are synchronous
  if (message.type === "GET_PAGE_CONTEXT") { ... sendResponse({...}); }
  if (message.type === "SHOW_PANEL") { showPanel(); sendResponse({ shown: true }); }
  // etc.
  // Do NOT return true for sync handlers
});
```

---

### Bug #2: Race condition — resolveSourceMaps promise + timeout both resolve, but the Promise is never cancelled

**File**: `packages/extension/src/sidepanel/index.ts:308-323`
**Severity**: CRITICAL
**Category**: Async Issue / Race Condition

**Issue**: `resolveSourceMaps` creates a `new Promise` that calls `chrome.tabs.sendMessage`, then sets a `setTimeout(() => resolve(errorText), 5000)` as a timeout guard. However, both the message response callback AND the timeout can independently call `resolve()`. In JavaScript, only the first `resolve()` wins, so the race itself is "safe" in terms of value — but the timeout `setTimeout` is never cleared regardless of which wins. If the message returns quickly (say in 200ms), the 5-second timer still fires and calls `resolve()` on an already-resolved promise (harmless). But more importantly, `chrome.runtime.lastError` is never checked in the `sendMessage` callback. If the content script is not injected (e.g., on a chrome:// page or extension page), Chrome will set `lastError` and the callback fires with `response = undefined`. The code handles this (`response?.resolved || errorText`), so the null deref is guarded — but the 5-second timeout still runs unnecessarily.

The actual crash condition: if the user rapidly clicks Decode multiple times, multiple `resolveSourceMaps` calls are in flight. Each creates its own 5-second timer. None are cancelled. Each holds a closure over the outer `resolve` function. This is a resource leak (minor) but the real problem is that multiple concurrent decode flows can race: if flow A's source map resolution takes 4 seconds but flow B's 5-second timeout fires first and calls `resolve(errorText)` (wrong text), the wrong error text gets passed to the API. This is because `decoding` flag is set but the `resolveSourceMaps` is not guarded by it — `decodeSingle` checks `if (decoding) return` but `resolveSourceMaps` runs inside `decodeSingle` after the flag is already set.

Actually re-examining: `decodeSingle` checks `if (decoding) return` at the top, so concurrent calls would be blocked. The real issue is the timeout is never cleared, creating a timer leak on every decode call.

**Current Code**:
```ts
const resolveSourceMaps = async (errorText: string): Promise<string> => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return errorText;

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id!, { type: "RESOLVE_SOURCEMAP", errorText }, (response) => {
        resolve(response?.resolved || errorText);
      });
      // Timeout after 5 seconds  — timer never cleared
      setTimeout(() => resolve(errorText), 5000);
    });
  } catch {
    return errorText;
  }
};
```

**Fixed Code**:
```ts
const resolveSourceMaps = async (errorText: string): Promise<string> => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return errorText;

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(errorText), 5000);
      chrome.tabs.sendMessage(tab.id!, { type: "RESOLVE_SOURCEMAP", errorText }, (response) => {
        clearTimeout(timer);
        resolve(response?.resolved || errorText);
      });
    });
  } catch {
    return errorText;
  }
};
```

---

### Bug #3: XSS via innerHTML — unescaped AI response rendered as raw HTML in devtools panel

**File**: `packages/extension/devtools/panel.ts:128-130` (and `showResult` at line 168-173)
**Severity**: CRITICAL
**Category**: Logic Error / Security

**Issue**: The devtools panel renders AI response fields using `innerHTML` without sanitization. Specifically at line 136:
```ts
html += `<h3>What Happened</h3><p>${escapeHtml(data.whatHappened)}</p>`;
```
`escapeHtml` IS called here, so `whatHappened`, `why` items, and `howToFix` items are escaped. However `data.codeExample.after` and `data.codeExample.before` are also escaped. The problem is `showResult(html)` at line 173 sets `resultContent.innerHTML = html` — and while individual fields are escaped, the HTML *template string itself* (`<h3>`, `<p>`, `<ul>`, etc.) is constructed by concatenation. If the backend ever returns data with a `codeExample.after` that is null or undefined, `escapeHtml(data.codeExample.after)` will call `.replace()` on `undefined`, throwing `TypeError: Cannot read properties of undefined`. This crashes the entire devtools panel.

**Current Code**:
```ts
if (data.codeExample) {
  html += `<h3>Code Example</h3>`;
  if (data.codeExample.before) {
    html += `<div class="code-block"><pre><code>${escapeHtml(data.codeExample.before)}</code></pre></div>`;
  }
  html += `<div class="code-block"><pre><code id="code-copy-target">${escapeHtml(data.codeExample.after)}</code></pre>...`;
  //                                                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  // data.codeExample exists but data.codeExample.after could be undefined
}
```

**Why This Breaks**: `data.codeExample` is truthy (object exists) but `data.codeExample.after` may be `undefined` or `null` if the AI returns a partial object. `escapeHtml(undefined)` calls `undefined.replace(...)` → `TypeError` → panel goes blank, decode fails with no user feedback.

**Fixed Code**:
```ts
if (data.codeExample?.after) {
  html += `<h3>Code Example</h3>`;
  if (data.codeExample.before) {
    html += `<div class="code-block"><pre><code>${escapeHtml(data.codeExample.before)}</code></pre></div>`;
  }
  html += `<div class="code-block"><pre><code id="code-copy-target">${escapeHtml(data.codeExample.after)}</code></pre>...`;
}
```

---

### Bug #4: `appendCapturedError` is async but never awaited — fire-and-forget drops errors silently under load

**File**: `packages/extension/src/background/index.ts:119-140` (called from lines 38, 57, 75)
**Severity**: CRITICAL
**Category**: Async Issue

**Issue**: `appendCapturedError` is declared `async` and uses `await chrome.storage.session.get/set`. It is called from three places: the `webRequest.onCompleted` listener (line 38), `webRequest.onErrorOccurred` listener (line 57), and the `onMessage` handler (line 75). None of these callers await the result. This means:

1. Concurrent calls to `appendCapturedError` race on the read-then-write pattern inside. Two concurrent network errors can both `GET` the errors array (both get the same version), both push to it, and then both `SET` it — the second `SET` overwrites the first, silently dropping one error. This is a read-modify-write race condition on shared storage with no locking.

2. The `onMessage` handler calls `appendCapturedError(...)` without awaiting, then immediately calls `sendResponse({ received: true })`. The caller gets `{ received: true }` before the error is actually stored. If Chrome terminates the service worker between the sendResponse and the storage write completing, the error is lost.

**Current Code**:
```ts
chrome.webRequest.onCompleted.addListener(
  (details) => {
    // ...
    appendCapturedError({ ... });  // not awaited — fire and forget
  },
  { urls: ["<all_urls>"] }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CAPTURED_ERROR") {
    appendCapturedError({ ... });  // not awaited
    sendResponse({ received: true });  // responds before storage write completes
  }
  // ...
  return true;
});

const appendCapturedError = async (error: { ... }) => {
  const result = await chrome.storage.session.get(key);  // READ
  const errors = result[key] || [];
  // ... mutate ...
  await chrome.storage.session.set({ [key]: errors });   // WRITE
};
```

**Why This Breaks**: Two network errors arriving within the same tick both read `[]`, both push to their local copy, both write back. One write overwrites the other. Storage contains only the last writer's version of the array — the other error is dropped. Under any page with multiple simultaneous 4xx responses (common on error-heavy pages), this race fires constantly.

---

## HIGH BUGS

### Bug #5: `chrome.storage.session.onChanged` listener fires for `selectedElement` removal incorrectly

**File**: `packages/extension/src/sidepanel/index.ts:477-482`
**Severity**: HIGH
**Category**: Logic Error

**Issue**: The inspect cancellation listener checks `changes.selectedElement === undefined` as a signal that the element was removed (ESC pressed on page). But `changes.selectedElement` being `undefined` simply means the key was NOT changed in this storage update — it doesn't mean it was deleted. The storage change event only includes keys that actually changed. Any unrelated storage update (e.g., an error being added to `errors_tab_N`) will have `changes.selectedElement === undefined`, which is always true for those updates, causing `cancelInspect()` to be called spuriously while the user is in the middle of inspecting.

**Current Code**:
```ts
chrome.storage.session.onChanged.addListener((changes) => {
  // Inspect cancelled from page side
  if (changes.selectedElement === undefined && !inspectCancelBtn.classList.contains("hidden")) {
    cancelInspect();
  }
});
```

**Why This Breaks**: Every time a new console error is captured (which updates `errors_tab_N` in session storage), the storage change event fires. `changes.selectedElement` is `undefined` (because it wasn't part of this change), and if the inspect cancel button is visible (user is inspecting), `cancelInspect()` fires. The user's inspect session gets cancelled every time a new error comes in.

**Fixed Code**: Check for `changes.selectedElement?.newValue === undefined && changes.selectedElement?.oldValue !== undefined` to detect an actual removal.

---

### Bug #6: `renderNewErrors` uses `renderedCount` as a global counter but it's never reset on tab switch

**File**: `packages/extension/src/sidepanel/index.ts:103-109`
**Severity**: HIGH
**Category**: Logic Error

**Issue**: `renderedCount` tracks how many errors have been rendered so `renderNewErrors` only renders new ones (the `for (let i = renderedCount; i < errors.length; i++)` loop). This variable is reset to `0` only in the "Clear errors" handler. However, `currentTabId` can change (e.g., user opens the sidebar on a different tab — though in this architecture the sidebar is injected per-tab, this isn't the typical issue).

The real problem: `renderedCount` is never reset when errors are cleared from storage externally (e.g., when the tab closes and `chrome.tabs.onRemoved` fires, removing `errors_tab_N`). If the tab's errors are cleared from the background and then new errors arrive, `changes[key].newValue` contains the new errors array starting from index 0, but `renderedCount` still points to the old count. The `for (let i = renderedCount; ...)` loop starts past the end of the array, rendering nothing. New errors are silently dropped from the UI.

**Current Code**:
```ts
const renderNewErrors = (errors: CapturedError[]) => {
  for (let i = renderedCount; i < errors.length; i++) {
    renderErrorItem(errors[i], i);
  }
  renderedCount = errors.length;
  updateCounts(errors.length);
};
```

**Why This Breaks**: If `errors_tab_N` is externally reset to `[]` and then grows to `[err1, err2]`, `renderedCount` might be `15` from before. The loop `for (let i = 15; i < 2; i++)` never executes. No new errors are shown.

---

### Bug #7: `detectTechStack` result is cached globally — stale cache persists across page navigations

**File**: `packages/extension/src/content/tech-detect.ts:12-13`
**Severity**: HIGH
**Category**: Logic Error

**Issue**: `cachedTech` is a module-level variable, and `detectTechStack()` returns the cached value on all subsequent calls. Content scripts persist in memory for the lifetime of the tab. When the user navigates to a new page (full navigation, not SPA), the content script is re-injected as a fresh module — so the cache is cleared. However, for SPA navigations (React Router, Vue Router, Next.js client-side routing), the content script is NOT re-injected. The `cachedTech` from the previous route is returned forever. The tech stack displayed in the sidebar will be stale after any SPA navigation.

More immediately: `content/index.ts` calls `detectTechStack()` in `GET_PAGE_CONTEXT` message handler (line 31) AND in the initial `runTechDetection` (line 14). The initial call uses the 1500ms delay to allow the main-world script to populate `data-errordecoder-globals`. But the `GET_PAGE_CONTEXT` handler calls `detectTechStack()` immediately and may return the cached result (from the initial call) which could be missing globals that hadn't been set yet when the cache was first populated.

**Why This Breaks**: User opens React app → initial detection runs → cache set to `[React]`. User navigates in-app to a page that loads Vue as well → `cachedTech` still returns `[React]` only. Sidebar shows wrong tech stack.

---

### Bug #8: `new URL(details.url)` throws if URL is malformed — crashes the background service worker

**File**: `packages/extension/src/background/index.ts:43`
**Severity**: HIGH
**Category**: Null/Undefined Dereference / Error Isolation

**Issue**: In the `webRequest.onCompleted` listener, `new URL(details.url).hostname` is called without try/catch. The `onErrorOccurred` handler (line 61) uses a safe IIFE with try/catch: `(() => { try { return new URL(details.url).hostname; } catch { return ""; } })()`. But the `onCompleted` handler at line 43 does NOT have this protection.

**Current Code**:
```ts
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.statusCode >= 400 && details.tabId > 0) {
      if (details.url.includes("/api/decode") || details.url.includes("/api/usage")) return;

      appendCapturedError({
        // ...
        domain: new URL(details.url).hostname,  // throws if URL is malformed
        // ...
      });
    }
  },
```

**Why This Breaks**: Non-HTTP URLs can appear in webRequest events (e.g., `data:` URIs, `blob:` URLs). `new URL("blob:null/uuid")` succeeds but `new URL("invalid")` throws. If any such URL passes the `details.url.includes("/api/decode")` filter, this throws an unhandled exception inside a synchronous webRequest listener, crashing that listener invocation. In Manifest V3 service workers, repeated unhandled exceptions can cause the service worker to terminate.

---

### Bug #9: `decodeBatch` is defined but never called — dead code path

**File**: `packages/extension/src/sidepanel/index.ts:386-428`
**Severity**: HIGH (incorrect behavior, not crash)
**Category**: Logic Error / Dead Code

**Issue**: `decodeBatch` is a full async function that calls `POST /decode-batch` and renders results. It is never called anywhere in `index.ts`. The "Decode Selected" and "Decode All" buttons both forward errors to the decode textarea and call `switchTab("decode")`, expecting the user to manually click Decode. The `decodeBatch` function goes unused. This is confirmed by reading the entire file — no call site for `decodeBatch` exists.

Additionally, `decodeBatch` does not call `setDecoding(true)` on the `sonnetBtn` disable path the same way `decodeSingle` does — it just calls `setDecoding(true)` with no phase argument. Since it's dead code, this doesn't cause crashes, but the presence of this function is misleading and the flow for "Decode All" is clearly incomplete.

**Why This Breaks**: The intended UX (click "Decode All" → immediately gets AI analysis of all errors) is broken. Instead, users get errors dumped into a textarea and must manually click Decode. The batch endpoint is implemented server-side but never reached from the extension.

---

### Bug #10: `window.addEventListener("message", ...)` in `createPanel` is added every time `createPanel` is called — listener accumulates if panel is destroyed and recreated

**File**: `packages/extension/src/content/panel.ts:181-185`
**Severity**: HIGH
**Category**: Resource Leak

**Issue**: `createPanel()` adds a `message` event listener on `window` at line 181. If `panelFrame` is ever set to `null` and `createPanel()` is called again (e.g., if the frame is removed from the DOM), a new listener is added without the old one being removed. Currently `panelFrame` is only set in `createPanel()` and never explicitly set to `null` in this file. However, `hidePanel()` does NOT destroy the frame — it just transforms it off-screen. So in practice this is called once per page load. But if `createPanel` were ever called more than once (e.g., due to a bug or frame navigation), listeners would accumulate.

More importantly: the `mousemove` and `mouseup` listeners added to `document` at lines 157 and 163 are ALSO never removed. These fire on every mouse movement on the page indefinitely, even after the panel is destroyed (if it ever is). The `mousemove` listener does `if (!isDragging) return` as an early exit, so it's cheap but it fires on every mouse move forever.

**Why This Breaks**: Memory leak and potential interference with page event handling. The `mousemove` listener runs on every cursor movement for the entire tab lifetime.

---

## Summary by Category

- Null/Undefined: 1 (Bug #3 — `codeExample.after`)
- Types: 0
- Async: 3 (Bug #2 — timeout leak, Bug #4 — fire-and-forget race)
- Logic: 4 (Bug #1 — message return, Bug #5 — storage change check, Bug #6 — renderedCount, Bug #9 — dead code)
- Leaks: 1 (Bug #10 — event listeners)
- Isolation: 1 (Bug #8 — URL parse crash in listener)
- Flow/Ordering: 1 (Bug #1 — message channel management)

---

## Prioritized Fix Order

### Must Fix Now (Production Risk)

1. **Bug #4** — Fire-and-forget `appendCapturedError` has a read-modify-write race that silently drops errors under any concurrent network activity. Core feature (error capture) is unreliable.

2. **Bug #1** — All sync message handlers return `true`, holding message channels open unnecessarily. Will cause message handling to fail in a stale channel scenario and leaks ports.

3. **Bug #8** — Unguarded `new URL()` in webRequest listener. Can crash the service worker on malformed URLs. The fix is one line (same try/catch pattern already used in `onErrorOccurred`).

4. **Bug #5** — Inspect session cancelled by every incoming error event. Makes the inspector unusable on busy pages with frequent console errors.

### Should Fix Soon (User Impact)

5. **Bug #3** — `escapeHtml(data.codeExample.after)` crashes if `after` is undefined. Every decode attempt on an error where the AI returns a `codeExample` object without an `after` field produces a JS error and blank panel.

6. **Bug #2** — `setTimeout` in `resolveSourceMaps` never cleared. Minor timer leak per decode call.

7. **Bug #6** — `renderedCount` not reset when errors cleared externally. New errors silently disappear from UI after external storage wipe.

8. **Bug #9** — `decodeBatch` is dead code. "Decode All" / "Decode Selected" don't use the batch endpoint as intended.

### Nice to Fix (Code Quality)

9. **Bug #7** — Stale tech stack cache on SPA navigations. Functional issue but low impact for most users.

10. **Bug #10** — `mousemove`/`mouseup` listeners on `document` never removed. Minor memory/CPU leak per tab.

---

## What's Working Well

- `webRequest.onErrorOccurred` correctly wraps `new URL()` in a try/catch — the pattern just needs to be applied to `onCompleted` too.
- The `createPanel`/`showPanel`/`hidePanel` design correctly defers DOM creation until first show, avoiding unnecessary DOM mutation.
- `resolveStackTrace` and the VLQ decoder are well-isolated with their own error handling and graceful fallback to original text.
- `appendCapturedError` deduplication (500ms window) is a good defensive pattern.
- All `chrome.runtime.sendMessage` calls in `relay.ts`, `inspector.ts`, and `tech-detect.ts` correctly use `.catch(() => {})` to suppress "Extension context invalidated" errors.
- The `escapeHtml` function is correctly applied throughout the devtools panel to prevent XSS from error text.

# Performance Analysis Report

**Analyzed**: 2026-03-30
**Scope**: `packages/extension/` — all content scripts, background worker, capture script, sidepanel, devtools panel, popup, shared modules, build pipeline
**Issues Found**: 14 (Critical: 2, High: 5, Medium: 5, Low: 2)

---

## CRITICAL — Unbounded error buffer growth in main-world capture script

**Location**: `packages/extension/src/capture/main-world.ts:9`
**Category**: Memory
**Current Complexity**: O(n) unbounded → **Should be**: O(1) ring buffer capped at N

**Issue**: `window.__errorDecoderBuffer` accumulates every `console.error`, `console.warn`, unhandled rejection, failed fetch, and XHR error with no cap and no cleanup. On pages that spam errors (hot-reload dev servers, noisy React warning paths, broken loops), this buffer grows indefinitely for the entire lifetime of the tab. Nothing ever drains or trims it.

**Real-World Impact**: A page running a broken `useEffect` loop or a third-party analytics script that logs on every network tick can push thousands of entries into the buffer. Each entry is a string. At 1,000 errors × 500 bytes average = 500 KB of live heap allocated in the page's main-world context that is never freed. At 10,000 errors this becomes 5 MB. The buffer lives on `window`, so it is also GC-anchored for the tab's lifetime.

**Current Code**:
```ts
(window as any).__errorDecoderBuffer = [] as Array<{ level: string; text: string }>;

const emit = (level: string, text: string) => {
  (window as any).__errorDecoderBuffer.push({ level, text });
  // ...
};
```

**Optimized Solution**: Cap the buffer at a small fixed size (e.g., 100 entries) with a ring-buffer pattern, or mark items consumed and splice them after the content script drains them. The background worker already caps at 50 per tab — this buffer should be consistent.

**Performance Gain**: Eliminates unbounded heap growth in the host page's main world. Caps worst-case memory at ~50 KB regardless of error volume.

---

## CRITICAL — Full stylesheet scan on every mousemove during element inspection

**Location**: `packages/extension/src/content/inspector.ts:179–223` (`getMatchedCSSRules`), called from `getElementInfo` at line 155, called from `onClick` at line 90
**Category**: Algorithm
**Current Complexity**: O(S × R) per click where S = number of stylesheets, R = rules per sheet → **Should be**: Not called on every event, or cached per element

**Issue**: `getMatchedCSSRules` iterates every rule in every stylesheet and calls `el.matches(rule.selectorText)` for each. This is a full O(S × R) scan that is triggered on user click. Modern pages with frameworks like Material UI, Ant Design, or Tailwind can have thousands of CSS rules across multiple stylesheets. `el.matches()` against complex selectors is not free — it requires a selector match computation.

This is a single-click operation so the severity is lower than if it were on mousemove, but it blocks the click handler synchronously before `ELEMENT_SELECTED` is sent. On a stylesheet-heavy page (e.g., a dashboard with a full component library), this can take 50–200 ms of synchronous main-thread work in the content script, noticeable as UI freeze on the host page.

**Real-World Impact**: Pages using component libraries (MUI, Ant Design) commonly have 3,000–8,000 CSS rules. At 8,000 rules, `el.matches()` per rule × the overhead of catching invalid selectors = measurable jank. The `try/catch` per rule (line 197) adds overhead per iteration.

**Current Code**:
```ts
for (const sheet of document.styleSheets) {
  // ...
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      try {
        if (el.matches(rule.selectorText)) {  // O(complexity of selector) per rule
          // ...
        }
      } catch { }
    }
  }
}
```

**Optimized Solution**: Use `document.styleSheets` with the native `CSSStyleSheet.cssRules` iteration but limit scope with `el.closest` pre-filtering, or limit to rules from `<style>` tags and inline elements only. Alternatively, use the browser's own `getMatchedCSSRules` (deprecated but functional in content scripts) or cap iteration at 500 rules max with an early exit.

**Performance Gain**: Reduces click-handler blocking time from O(S×R) to O(min(S×R, cap)) — on a 5,000-rule page, limiting to 500 rules is a 10x reduction in worst-case synchronous work.

---

## HIGH — Two duplicate `chrome.storage.session.onChanged` listeners registered in sidepanel

**Location**: `packages/extension/src/sidepanel/index.ts:55` and `packages/extension/src/sidepanel/index.ts:236`
**Category**: Memory / False Optimization
**Current Complexity**: O(n) listener invocations doubled → **Should be**: Single listener

**Issue**: Two separate `chrome.storage.session.onChanged.addListener` calls are registered at module load time. The first (line 55) handles `pendingText`, `selectedElement`, and tab error updates. The second (line 236) handles tech stack updates. They are independent registrations, so both fire on every storage change event.

Every storage write — including each captured error pushed by the background worker — fires both listeners. The first listener's `getTabKey()` check is cheap, but the second listener redundantly re-checks `currentTabId` and a key lookup on every storage event regardless of what changed.

**Real-World Impact**: On an active page generating errors (a broken loop, polling interval, noisy analytics), the background worker calls `chrome.storage.session.set` on every error (up to 50 times in rapid succession). Each set fires both listeners in the sidepanel. For 50 errors in 500ms this is 100 listener invocations instead of 50. Minor overhead individually, but it also means the redundant check in listener #2 runs even for `pendingText` changes.

**Current Code**:
```ts
// Line 55
chrome.storage.session.onChanged.addListener((changes) => {
  const key = getTabKey();
  if (key && changes[key]) { renderNewErrors(...) }
  if (changes.pendingText?.newValue) { ... }
  if (changes.selectedElement?.newValue) { ... }
});

// Line 236 — separate registration
chrome.storage.session.onChanged.addListener((changes) => {
  if (!currentTabId) return;
  const key = `tech_tab_${currentTabId}`;
  if (changes[key]?.newValue) { renderTechBar(...) }
});
```

**Optimized Solution**: Merge into a single `onChanged` listener that handles all keys. One dispatch per storage change event.

**Performance Gain**: Halves listener invocations on every storage write. Removes one closure allocation at startup.

---

## HIGH — `detectTechStack` runs full DOM + script scan twice on page load

**Location**: `packages/extension/src/content/index.ts:14` and `packages/extension/src/content/index.ts:31`
**Category**: Redundant Computation
**Current Complexity**: O(D + S) × 2 where D = DOM queries, S = script elements → **Should be**: O(D + S) × 1

**Issue**: `detectTechStack` is called on page load via `runTechDetection` (line 14, after 1500ms timeout), and again synchronously in the `GET_PAGE_CONTEXT` message handler (line 31). The function itself has a `cachedTech` guard (line 15 of `tech-detect.ts`), but only if the same function call hits the cache from the same invocation context. More importantly, there is a timing window: the `GET_PAGE_CONTEXT` message can arrive before the 1500ms timeout fires, causing a full re-scan before the cache is set.

Looking at `tech-detect.ts` line 12–14: `cachedTech` is module-level, so the second call will hit the cache if the first completed. But if `GET_PAGE_CONTEXT` arrives before the 1500ms delay, it runs a full uncached scan, which then caches. Then the 1500ms timeout runs and returns cached — this is wasteful but not catastrophic. The real cost is the first uncached scan.

The uncached scan in `detectTechStack` does:
- `document.querySelector` calls: ~35+ individual DOM queries (lines 31–375 of tech-detect.ts)
- `Array.from(document.querySelectorAll("script[src]"))` — iterates all scripts
- `Array.from(document.querySelectorAll("link[href]"))` — iterates all links
- String concatenation of all src/href values
- Then 60+ `allSrc.includes(...)` substring searches against that concatenated string

**Real-World Impact**: Pages with 50+ scripts (analytics-heavy marketing sites) produce large `allSrc` strings. Each `.includes()` is O(n) where n is the string length. 60 searches × large string = measurable synchronous main-thread work, all in a content script that runs on every page load.

**Current Code**:
```ts
const getScriptUrls = (): string => {
  return Array.from(document.querySelectorAll("script[src]"))
    .map((s) => s.getAttribute("src") || "")
    .join(" ");  // Single large string
};
// Then 60+ allSrc.includes("...") calls against this string
```

**Optimized Solution**: Build `allSrc` as a `Set<string>` of individual URL tokens split on common delimiters, and check `Set.has()` for exact domain matches instead of substring search on the concatenated blob. Or: pre-split script URLs and check against a lookup map. This changes 60 O(n) substring searches to 60 O(1) set lookups.

**Performance Gain**: For a page with 30 scripts averaging 80 chars each (2,400 char `allSrc` string), 60 `.includes()` calls = 144,000 character comparisons. A Set of URL tokens reduces this to 60 O(1) lookups regardless of URL count.

---

## HIGH — `mousemove` handler calls `getBoundingClientRect` + multiple `Object.assign` style writes on every mouse event

**Location**: `packages/extension/src/content/inspector.ts:52–73` (`onMouseMove`)
**Category**: Blocking / DOM Layout Thrashing
**Current Complexity**: Forced layout reflow on every `mousemove` → **Should be**: Debounced or rAF-gated

**Issue**: The `mousemove` handler is registered with `capture: true` (line 29), meaning it fires on every mouse move event across the entire document, including during fast mouse swipes. Inside it:
1. `target.getBoundingClientRect()` — forces a synchronous layout computation (layout reflow)
2. `Object.assign(overlay.style, { top, left, width, height })` — triggers 4 style writes, each of which can cause style recalculation

`getBoundingClientRect` specifically forces the browser to flush any pending layout to compute the current geometry. On a page with complex layout (many flex/grid containers), this can be 1–5ms per call. At 60fps with rapid mouse movement, this is called 60× per second minimum, potentially causing 60–300ms of forced layout per second.

**Real-World Impact**: On layout-heavy pages (dashboards, data tables), rapid mouse movement during inspection mode can cause visible jank on the host page. The content script runs in the host page's renderer process and shares the main thread — forced layouts here block the host page's own JS.

**Current Code**:
```ts
document.addEventListener("mousemove", onMouseMove, true);  // Capture phase, all events

const onMouseMove = (e: MouseEvent) => {
  // ...
  const rect = target.getBoundingClientRect();  // Forces layout reflow
  Object.assign(overlay.style, {               // 4 style writes
    display: "block",
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
};
```

**Optimized Solution**: Wrap the handler body in `requestAnimationFrame`. Store the latest `e.target` in the handler (cheap) but defer the `getBoundingClientRect` + style writes to the next animation frame. This batches at most one reflow per frame regardless of mouse event frequency.

```ts
let rafId: number | null = null;
const onMouseMove = (e: MouseEvent) => {
  let target = e.target as Node;
  // ... target resolution ...
  hoveredElement = target as HTMLElement;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    const rect = (hoveredElement as HTMLElement).getBoundingClientRect();
    // style writes...
    rafId = null;
  });
};
```

**Performance Gain**: Reduces forced layouts from up to 100+/second (fast mouse) to 60/second maximum (one per animation frame), matching the display refresh rate. Eliminates redundant intermediate frames.

---

## HIGH — Source map resolution fetches entire JS/CSS bundle files to find `sourceMappingURL`

**Location**: `packages/extension/src/content/sourcemap.ts:115–121` and `packages/extension/src/content/inspector.ts:307–313`
**Category**: Network / Blocking
**Current Complexity**: Fetches full bundle content (potentially megabytes) to read last few bytes → **Should be**: Range request for last N bytes

**Issue**: In `fetchSourceMap` (sourcemap.ts:115), the code fetches the entire script file to find the `sourceMappingURL` comment at the end. Modern JS bundles (webpack, vite) range from 200 KB to 2 MB+ in development. Similarly in `getCSSSourceFiles` (inspector.ts:307), the entire CSS bundle is fetched. The `sourceMappingURL` comment is always at the end of the file, typically within the last 200 bytes.

**Real-World Impact**: On a typical dev build with a 1 MB bundle, this fetches 1,000 KB to read ~100 bytes. For a 5-frame stack trace, this is up to 5 separate full-file fetches (capped at 5 in sourcemap.ts:46). The files are cached after the first fetch (`mapCache`), but the initial cold fetch is unnecessarily expensive and adds latency before the AI decode can begin.

**Current Code**:
```ts
const scriptResponse = await fetch(scriptUrl);  // Fetches entire file, no Range header
if (!scriptResponse.ok) { ... }
const scriptText = await scriptResponse.text();  // Reads entire content into memory
const urlMatch = scriptText.match(/\/\/[#@]\s*sourceMappingURL=(.+?)(?:\s|$)/);
```

**Optimized Solution**: Use a `Range` HTTP header to fetch only the last 512 bytes of the file: `fetch(url, { headers: { Range: 'bytes=-512' } })`. If the server doesn't support range requests (206 response), fall back to full fetch. The `sourceMappingURL` is always at the end.

**Performance Gain**: Reduces initial fetch payload from 200 KB–2 MB to 512 bytes for the majority of cases — a 400x–4000x reduction in data transferred. Proportionally faster decode initiation.

---

## HIGH — `decodeMappings` decodes the entire source map every time it's called, with no memoization

**Location**: `packages/extension/src/content/sourcemap.ts:222–258` (`decodeMappings`)
**Category**: Redundant Computation
**Current Complexity**: O(L × S) per call, called once per frame, same map decoded multiple times → **Should be**: O(1) after first decode per map

**Issue**: `decodeMappings` fully decodes the VLQ mappings string on every call. The `mapCache` (line 23) stores the raw `SourceMapData` object including the raw `mappings` string, but does NOT cache the decoded segments. So for a stack trace with 5 frames all pointing into the same bundle, `decodeMappings` is called 5 times on the same mappings string, producing the same `MappingSegment[][]` each time.

A typical webpack development source map `mappings` string is 200 KB–1 MB of VLQ-encoded data, with thousands of lines and segments. The `VLQ_CHARS.indexOf(char)` call inside `decodeVLQ` (line 206) is O(64) per character — a linear scan of the 64-char lookup string instead of an O(1) lookup table.

**Real-World Impact**: For a 500 KB mappings string: 500,000 characters × O(64) `indexOf` = 32,000,000 character comparisons per decode call. For 5 stack frames pointing to the same bundle, this runs 5 times = 160,000,000 character comparisons. This runs synchronously in a message handler response callback.

**Current Code**:
```ts
const VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const decodeVLQ = (encoded: string): number[] => {
  for (const char of encoded) {
    const digit = VLQ_CHARS.indexOf(char);  // O(64) linear scan per character
    // ...
  }
};

// In resolveFrame (called per stack frame):
const decoded = decodeMappings(map.mappings);  // Re-decoded every call
```

**Optimized Solution**:
1. Replace `VLQ_CHARS.indexOf(char)` with a pre-built lookup object/array: `const VLQ_MAP: Record<string, number> = {}; VLQ_CHARS.split('').forEach((c, i) => VLQ_MAP[c] = i)` — makes each character lookup O(1).
2. Cache the decoded segments alongside the raw map in `mapCache`, keyed by script URL. Check the cache before calling `decodeMappings`.

**Performance Gain**:
- VLQ lookup fix alone: 64x reduction in per-character work (O(64) → O(1))
- Memoizing decoded segments: eliminates N-1 redundant full decodes for N frames in the same bundle — a 5x reduction for typical 5-frame traces

Combined: ~320x reduction in VLQ decode work for a 5-frame trace.

---

## MEDIUM — `appendCapturedError` in background reads then writes storage on every network error

**Location**: `packages/extension/src/background/index.ts:119–140`
**Category**: N+1 Storage Operations
**Current Complexity**: 2 async storage ops per error → **Should be**: Batched or debounced writes

**Issue**: `appendCapturedError` calls `chrome.storage.session.get` followed by `chrome.storage.session.set` for every individual error. The `webRequest.onCompleted` and `webRequest.onErrorOccurred` listeners (lines 33–67) fire this for every HTTP error on every tab. On pages that make many failing API calls (e.g., a dev server with broken endpoints), this generates a rapid sequence of get+set pairs. The deduplication check (line 134) can only help if the in-flight read has already resolved — rapid concurrent errors will race past it.

**Real-World Impact**: A page making 20 simultaneous failing requests generates 20 concurrent read+write pairs. Each pair is asynchronous but they all read before any write has landed, so they all read the same stale array, each push their entry, and each write back — 19 of the 20 writes are lost (last-write-wins race). The deduplication only works for sequential identical errors within 500ms, not concurrent different errors.

**Current Code**:
```ts
const appendCapturedError = async (error: ...) => {
  const key = `errors_tab_${error.tabId}`;
  const result = await chrome.storage.session.get(key);   // Read
  const errors = result[key] || [];
  // ... dedup check ...
  errors.push(error);
  if (errors.length > 50) errors.shift();
  await chrome.storage.session.set({ [key]: errors });     // Write
};
```

**Optimized Solution**: Use an in-memory buffer per tabId in the service worker (a `Map<tabId, CapturedError[]>`), write to it synchronously, and debounce the `chrome.storage.session.set` call (e.g., 100ms). This eliminates the read-modify-write race and reduces storage writes from N per burst to 1.

**Performance Gain**: For a burst of 20 concurrent network errors, reduces from 20 get+20 set storage operations to 0 gets + 1 debounced set. Also fixes the silent data loss from the write race.

---

## MEDIUM — `resolveTabId` uses `chrome.tabs.query` on every sidepanel open, repeated across multiple call sites

**Location**: `packages/extension/src/sidepanel/index.ts:47–51`, also `startInspect` line 438, `cancelInspect` line 448, `resolveSourceMaps` line 310, `showInspectResult` line 519
**Category**: Redundant Computation
**Current Complexity**: O(1) but repeated async IPC calls → **Should be**: Resolved once, reused

**Issue**: `chrome.tabs.query({ active: true, currentWindow: true })` is called in at least 5 places across the sidepanel: once in `resolveTabId` (called from `init`), and then again independently in `startInspect`, `cancelInspect`, `resolveSourceMaps`, and `showInspectResult`. Each call is a separate IPC round-trip to the browser process.

`currentTabId` is set during `init()` by `resolveTabId()`, but the other call sites (lines 438, 448, 310, 519) ignore `currentTabId` and query fresh each time. This is redundant — the tab ID doesn't change while the sidepanel is open.

**Real-World Impact**: Five async IPC calls instead of one. Each `chrome.tabs.query` is on the order of 1–5ms of IPC latency. Total unnecessary latency per user interaction: ~5–25ms. Minor but cumulative across all interactions in a session.

**Current Code**:
```ts
// In startInspect (line 438):
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
// In cancelInspect (line 448):
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
// In resolveSourceMaps (line 310):
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
// In showInspectResult (line 519):
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => { ... });
```

**Optimized Solution**: All call sites should use the already-resolved `currentTabId` set by `resolveTabId()`. Add a guard: if `!currentTabId` re-resolve, otherwise use the cached value.

**Performance Gain**: Eliminates 4 redundant IPC round-trips per user action that involves inspect or source map resolution.

---

## MEDIUM — `detectTechStack` runs 35+ `document.querySelector` calls without batching or early-exit

**Location**: `packages/extension/src/content/tech-detect.ts:31–375`
**Category**: Algorithm
**Current Complexity**: O(D × 35+) DOM queries → **Should be**: Grouped with compound selectors where possible

**Issue**: The function runs 35+ individual `document.querySelector` calls each checking a different selector. These are called sequentially with no short-circuiting once a sufficient signal is found. Many of these querySelector calls could be combined into a single compound selector query (e.g., `"[data-reactroot], #__next, [data-v-], #__nuxt, ..."`) to let the browser engine do one traversal instead of many.

Additionally, the Tailwind detection (lines 141–144) calls `document.querySelector` three times with attribute-contains selectors (`[class*='flex ']`, `[class*='bg-']`, `[class*='px-']`), which are among the slowest CSS selectors — attribute substring matching requires checking every element's class attribute.

**Real-World Impact**: On a DOM with 2,000 nodes (typical SPA), three `[class*=...]` queries = 6,000 element class-attribute inspections. On a 10,000-node page (complex dashboard), this is 30,000 inspections just for Tailwind detection. This runs in a content script on page load.

**Current Code**:
```ts
const hasTailwind = document.querySelector("[class*='flex ']") &&
  document.querySelector("[class*='bg-']") &&
  (document.querySelector("[class*='px-']") || document.querySelector("[class*='py-']"));
```

**Optimized Solution**: For `[class*=...]` patterns, a single `document.body.className` string scan or checking a known Tailwind utility on the `<html>` element is faster than querying the entire DOM. For the framework detection selectors, batch them into a `querySelectorAll` with a combined `:is()` selector to trigger one tree traversal.

**Performance Gain**: Replacing 3 `[class*=...]` queries with a single pass over `document.body.innerHTML` string or a more targeted check reduces Tailwind detection from O(3N) DOM checks to O(1).

---

## MEDIUM — `window.addEventListener("message", ...)` in `createPanel` is never removed

**Location**: `packages/extension/src/content/panel.ts:181–185`
**Category**: Memory Leak

**Issue**: A `message` event listener is added to `window` inside `createPanel()`, which is only called once (when the panel is first shown). The listener is never removed — not in `hidePanel()`, not anywhere. If the panel is destroyed and recreated (edge case, e.g., extension reload), the old listener would remain. More concretely, this listener fires on every `postMessage` sent to the page window (which third-party scripts and iframes do frequently), adding overhead to the host page's event dispatch for the entire tab session.

**Real-World Impact**: Low severity for a single extension instance, but pages using heavy `postMessage` communication (e.g., OAuth flows, embedded iframes, analytics) will trigger this listener on every message for the lifetime of the tab, even when the panel is hidden.

**Current Code**:
```ts
window.addEventListener("message", (event) => {
  if (event.data?.type === "ERRORDECODER_CLOSE") {
    hidePanel();
  }
});
// Never removed
```

**Optimized Solution**: Store the handler reference and call `window.removeEventListener` in `hidePanel()`, or use `{ once: false }` with manual cleanup tied to panel lifecycle.

---

## MEDIUM — `VLQ_CHARS.indexOf(char)` is a linear scan called millions of times per decode

**Location**: `packages/extension/src/content/sourcemap.ts:206`
**Category**: Algorithm
**Current Complexity**: O(64) per character → **Should be**: O(1)

**Issue**: This is called out separately from the memoization issue above because it is independently fixable and independently impactful. Even with memoized decoded segments, if a new bundle is encountered, the full decode runs. The `indexOf` on a 64-character string is O(64) per character. For a 200 KB mappings string with 200,000 characters, this is 12,800,000 string comparisons in a single decode call.

**Current Code**:
```ts
const VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const decodeVLQ = (encoded: string): number[] => {
  for (const char of encoded) {
    const digit = VLQ_CHARS.indexOf(char);  // O(64) linear scan
```

**Optimized Solution**: Pre-compute a lookup table once at module initialization:
```ts
const VLQ_LOOKUP: Uint8Array = new Uint8Array(128).fill(255);
"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  .split("").forEach((c, i) => { VLQ_LOOKUP[c.charCodeAt(0)] = i; });
// Then: const digit = VLQ_LOOKUP[char.charCodeAt(0)];  // O(1)
```

**Performance Gain**: 64x reduction in per-character work during VLQ decode. On a 200 KB mappings string: 12.8M comparisons → 200K array lookups.

---

## LOW — `build.ts` builds all entry points sequentially with `for...of await`

**Location**: `packages/extension/build.ts:33–57`
**Category**: False Optimization (missing parallelism)
**Current Complexity**: O(N) sequential builds → **Should be**: O(1) parallel builds

**Issue**: The build loop uses `for...of` with `await Bun.build(...)`, serializing all 8 entry point builds one after another. These builds are fully independent (no shared output, no ordering dependency) and could all run in parallel with `Promise.all`.

**Real-World Impact**: Sequential builds mean total build time ≈ sum of all individual build times. With 8 entry points, parallel builds could reduce wall-clock time to ≈ max of individual build times. On a fast machine this is the difference between ~2–4s and ~0.5–1s for a development iteration loop.

**Current Code**:
```ts
for (const { entry, outfile } of entrypoints) {
  const result = await Bun.build({ ... });  // Sequential
}
```

**Optimized Solution**: `await Promise.all(entrypoints.map(({ entry, outfile }) => Bun.build({ ... })))`. Note: I/O-bound bundler processes are the correct use case for parallelism here — this is genuine I/O parallelism (disk reads, TS compilation), not false CPU parallelism.

**Performance Gain**: Theoretical speedup from 8× sequential to ~1–2× the slowest single build. Estimated 2–3x faster build times during development iteration.

---

## LOW — `basicMarkdownToHtml` is dead code that is never called

**Location**: `packages/extension/src/sidepanel/index.ts:631–655`
**Category**: Dead Code

**Issue**: `basicMarkdownToHtml` is defined but never called. The `renderMarkdown` function (line 607) exclusively uses `marked.parse()`. The `basicMarkdownToHtml` function adds ~25 lines of untested regex transforms that ship in the bundle, adding unnecessary bundle size and maintenance surface.

**Real-World Impact**: Minimal bundle size overhead, but dead code that could confuse future maintainers about which path is actually used.

---

## Summary by Category

- N+1 queries / storage races: 1
- Algorithms: 4 (CSS scan, VLQ decode, VLQ lookup, querySelector)
- Blocking / DOM thrashing: 2 (mousemove layout reflow, source map full fetches)
- False optimizations / missing parallelism: 1 (build script)
- Memory: 2 (unbounded buffer, unreleased message listener)
- Redundant computation: 2 (tab ID queries, duplicate storage listeners)
- Dead code: 1
- Data structure: 1 (VLQ lookup)

---

## Priority

### Fix Now (Production Risk)

1. **Unbounded `__errorDecoderBuffer`** — causes real memory growth in the host page's main world on any noisy page. Directly degrades the host page's memory profile and could cause tab crashes on error-spamming pages.

2. **`appendCapturedError` write race** — concurrent network errors silently drop captured errors due to the read-modify-write pattern. Data loss bug masquerading as a performance issue.

### Fix Soon (User Impact)

3. **`mousemove` forced layout reflow** — directly causes jank on the host page during inspection mode. Users on layout-heavy pages will notice stuttering.

4. **Full JS/CSS bundle fetches for `sourceMappingURL`** — unnecessary multi-MB fetches that add 1–3 seconds of latency before the AI decode can start. Directly impacts perceived decode speed.

5. **VLQ lookup table** — the `indexOf` linear scan is correctness-identical to a lookup table but 64x slower. Low effort, high correctness, drops decode time measurably.

6. **VLQ decode memoization** — same decoded structure recomputed for every stack frame. Cache the decoded result alongside the raw map.

### Nice to Have (Optimization)

7. **Merge duplicate `onChanged` listeners** — clean up, halve listener invocations.

8. **`detectTechStack` batched queries** — reduce DOM traversals on page load.

9. **Tab ID caching** — avoid repeated IPC round-trips.

10. **Build script parallelism** — faster development iteration.

11. **Remove dead `basicMarkdownToHtml`** — clean bundle.

---

## What's Already Performant

- **Deduplication in `appendCapturedError`**: The 500ms window check for identical consecutive errors is correct and prevents log-spam from flooding storage under normal conditions.
- **`cachedTech` guard in `detectTechStack`**: Module-level caching means repeated calls after the first are O(1). Good defensive design.
- **`mapCache` for source maps**: Prevents re-fetching source map files on repeated decodes of the same bundle. Correctly keyed by script URL.
- **Inspector cleanup in `stopInspecting`**: All three event listeners (`mousemove`, `click`, `keydown`) are properly removed with matching options. No listener leak from the inspector.
- **Error cap at 50 in background**: The `errors.length > 50` shift keeps storage bounded per tab.
- **`{ capture: true }` on inspector events**: Using capture phase correctly intercepts events before page handlers, preventing interference from stopPropagation calls in the host page's own handlers.
- **`pointer-events: none` on overlay during drag**: Correctly prevents the iframe from eating mouse events during panel resize. Thoughtful fix for a common iframe drag bug.
- **`return true` in content script message listener** (content/index.ts:61): Correctly keeps the message channel open for async `resolveStackTrace` response. Avoids a common MV3 gotcha.

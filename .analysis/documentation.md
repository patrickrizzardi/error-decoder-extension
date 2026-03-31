# Documentation & Clarity Report

**Analyzed**: 2026-03-30
**Scope**: Chrome extension packages (`packages/extension/`) — 14 TypeScript/JS files covering build, background worker, content scripts, UI panels, and shared utilities
**Issues Found**: 28

---

## Self-Documenting Fixes Needed

### Variables to Rename

| File:Line | Current | Suggested | Why |
|-----------|---------|-----------|-----|
| `packages/extension/src/capture/main-world.ts:5` | `__errorDecoderActive` | Already descriptive, but the leading `__` suggests internal protocol — acceptable. | N/A |
| `packages/extension/src/content/panel.ts:134-152` | `isDragging`, `startX`, `startWidth` | Well-named for drag logic, but scoped to anonymous function. Accept as-is. | N/A |
| `packages/extension/src/content/inspector.ts:52-73` | `target` (reassigned 3x) | Rename to `element` or `hovered` for clarity. Multiple reassignments confuse scope. | Variable reused across node type checks (text node → HTMLElement conversion). Rename intermediate steps. |
| `packages/extension/src/devtools/panel.ts:10` | `errors` | Clear. No issue. | N/A |
| `packages/extension/src/sidepanel/index.ts:112` | `selectedErrors` | `Set<number>` storing error indices. Clear enough, but lacks comment on what indices represent. | No issue — set name is self-documenting. |

### Constants to Extract

| File:Line | Magic Value | Suggested Name | Context |
|-----------|-------------|-----------------|---------|
| `packages/extension/src/content/inspector.ts:7-8` | `"rgba(86, 156, 214, 0.2)"` and `"rgba(86, 156, 214, 0.8)"` | `INSPECTOR_OVERLAY_BACKGROUND` and `INSPECTOR_OVERLAY_BORDER` | Already extracted to `OVERLAY_COLOR` and `OVERLAY_BORDER` constants — good. |
| `packages/extension/src/content/panel.ts:20` | `2147483647` | `MAX_CHROME_Z_INDEX` | Magic z-index value (max safe 32-bit signed int for Chrome). No explanation. |
| `packages/extension/src/content/panel.ts:22` | `2147483646` | `PANEL_Z_INDEX` | One below max z-index. Undocumented relationship. |
| `packages/extension/src/content/inspector.ts:20` | `"2px"` | `OVERLAY_BORDER_RADIUS` | Hardcoded border-radius, already extracted to style object. Accept. |
| `packages/extension/src/sidepanel/index.ts:119` | `150` | `ERROR_TEXT_PREVIEW_LENGTH` | Max characters shown in error list preview (150 chars). |
| `packages/extension/src/capture/main-world.ts:178` | `1000` | `TECH_DETECTION_DELAY_MS` | Millisecond delay before running tech detection. No explanation why 1000ms. |
| `packages/extension/src/content/relay.ts` (line 5-14) | Implicit 500ms dedup window | `DEDUPE_WINDOW_MS` | Background.ts (line 134) has `500` dedup threshold, no constant. |
| `packages/extension/src/background/index.ts:137` | `50` | `MAX_ERRORS_PER_TAB` | Max errors stored per tab before shift(). |
| `packages/extension/src/sidepanel/index.ts:202` | `15` | `DECODE_ALL_RECENT_COUNT` | Max errors loaded when "Decode All" pressed. Undocumented. |
| `packages/extension/src/content/sourcemap.ts:46` | `5` | `MAX_STACK_FRAMES_TO_RESOLVE` | Only resolves first 5 frames for performance. No comment. |
| `packages/extension/src/content/inspector.ts:201` | `20` | `MAX_CSS_PROPERTIES_PER_RULE` | Max CSS properties extracted from each rule. Magic number. |
| `packages/extension/src/sidepanel/index.ts:319` | `5000` | `SOURCEMAP_RESOLUTION_TIMEOUT_MS` | Timeout for content script source map resolution. |
| `packages/extension/src/content/panel.ts:51` | `280` (min width) and `800` (max width) | `MIN_PANEL_WIDTH_PX` and `MAX_PANEL_WIDTH_PX` | Panel resize constraints — hardcoded with no explanation. |

### Booleans to Fix

| File:Line | Current | Suggested | Why |
|-----------|---------|-----------|-----|
| `packages/extension/src/content/panel.ts:5` | `panelVisible` | Already `panelVisible` — good. | N/A |
| `packages/extension/src/content/inspector.ts:3` | `inspecting` | Already clear (`isInspecting` would be slightly better). | N/A |
| `packages/extension/src/sidepanel/index.ts:296` | `decoding` | Better as `isDecoding`. | Loading state should use `is-` prefix per coding style. |
| `packages/extension/src/content/sourcemap.ts` | No problematic boolean names found. | N/A | N/A |

---

## Documentation Gaps (by severity)

### CRITICAL — Chrome Extension Message Passing Without Type Safety

**File**: `packages/extension/src/background/index.ts:73-113`
**Issue**:
`chrome.runtime.onMessage.addListener` handler accepts messages with type-checked constants (`"CAPTURED_ERROR"`, `"TECH_DETECTED"`, `"AUTH_SUCCESS"`, etc.) but no JSDoc documenting:
- What message types are supported
- What each message object contains (shape of `message.text`, `message.apiKey`, etc.)
- Return value contract for `sendResponse()`

The message protocol spans 4 files (background, content/index.ts, content/relay.ts, capture/main-world.ts) with **no centralized interface definition**. This creates silent bugs if a sender forgets a required field.

**Tier**: Operational (message passing is cross-component I/O)
**Recommendation**:
1. Create a types file documenting all message types (or add JSDoc):
   ```typescript
   type CapturedErrorMessage = { type: "CAPTURED_ERROR"; text: string; level: string; timestamp?: number; url: string; domain: string; };
   type TechDetectedMessage = { type: "TECH_DETECTED"; tech: DetectedTech[] };
   type AuthSuccessMessage = { type: "AUTH_SUCCESS"; apiKey: string; email: string; plan: string };
   // ... etc
   ```
2. Add JSDoc to the listener documenting each message shape.

---

### CRITICAL — Source Map Decoding VLQ Algorithm No Comments

**File**: `packages/extension/src/content/sourcemap.ts:196-220`
**Issue**:
`decodeMappings()` and `decodeVLQ()` implement the full VLQ (Variable-Length Quantity) source map decoding algorithm with **zero comments**. The code is cryptic:
```typescript
const cont = digit & 32;                          // What is 32? Continuation bit flag?
value += (digit & 31) << shift;                   // Why 31? Why shift?
const isNegative = value & 1;                     // Sign bit encoding?
value >>= 1;
values.push(isNegative ? -value : value);
```

This is non-obvious algorithmic code that will break if maintainers need to debug or modify it.

**Tier**: Standard + Operational (complex algorithm, external I/O via fetch)
**Recommendation**: Add section comments explaining VLQ decoding:
```typescript
/**
 * VLQ (Variable-Length Quantity) decoder for source maps
 *
 * Each Base64 character encodes 6 bits:
 * - Bit 5 (0x20): continuation flag (more chars follow this value)
 * - Bits 0-4 (0x1F): value bits (5 bits per char)
 * - Bit 0 of final value: sign (0=positive, 1=negative)
 *
 * Example: "DAA" decodes to 3 numbers
 */
```

---

### CRITICAL — Content Script Realm Management Undocumented

**File**: `packages/extension/src/content/index.ts:1-3`, `capture/main-world.ts:1-3`, `relay.ts:1-2`
**Issue**:
Three content scripts run in three different execution contexts:
1. **main-world.ts** — MAIN world (page's global scope, bypasses CSP)
2. **relay.ts** — ISOLATED world, document_start (earliest, no imports)
3. **index.ts** — ISOLATED world, document_idle (later, can import)

The manifest.json (not shown but built in build.ts lines 64-66) registers them in specific order with specific timings. **No documentation** explains:
- Why this 3-script architecture is needed
- What data flows between realms (CustomEvent relay pattern line 5-17 in relay.ts)
- Why main-world can't communicate directly with isolated (CSP boundary)
- When each script runs and what's safe to do in each

**Tier**: Operational + Critical (multi-realm architecture is error-prone; bugs are silent)
**Recommendation**: Add detailed JSDoc at top of each content script:
```typescript
/**
 * relay.ts — Lightweight error relay bridge (ISOLATED world, document_start)
 *
 * This script runs earliest to catch CustomEvents from main-world capture.ts.
 * Cannot import (early load), cannot modify DOM (not ready), only relays errors
 * to background service worker via chrome.runtime.sendMessage.
 *
 * Data flow: main-world script emits CustomEvent → relay catches → background stores
 */
```

---

### HIGH — Chrome Runtime.sendMessage Doesn't Return Promise

**File**: `packages/extension/src/capture/main-world.ts:11-18`, `content/index.ts:15-18`, multiple others
**Issue**:
Code catches `chrome.runtime.sendMessage()` errors with `.catch(() => {})` but this API **does not return a Promise** in the main world or isolated world contexts without a callback. Lines like:
```typescript
chrome.runtime.sendMessage({ type: "TECH_DETECTED", tech }).catch(() => {});
```
Will throw `TypeError: Cannot read property 'catch' of undefined` because `sendMessage()` without a callback returns `undefined`, not a Promise.

**Tier**: Operational (I/O error handling, will fail silently or crash)
**Recommendation**:
Either:
1. Use callback style: `chrome.runtime.sendMessage({...}, () => {});`
2. Or wrap in Promise: `new Promise(resolve => chrome.runtime.sendMessage({...}, resolve)).catch(...)`

---

### HIGH — Storage Key Naming Inconsistent, Undocumented

**File**: `packages/extension/src/background/index.ts:128`, `sidepanel/index.ts:45`, `panel.ts:9`
**Issue**:
Storage keys are hardcoded as magic strings with no central registry:
- `errors_tab_${tabId}` — error list per tab
- `tech_tab_${tabId}` — tech stack per tab
- `errordecoder-panel-width` — panel resize preference
- `pendingText` — text from right-click "Decode this error"
- `selectedElement` — element inspector result
- `apiKey`, `userEmail`, `userPlan` — user auth (no namespace prefix)

No single source of truth. If a key is renamed in one file, callers in other files will silently use stale data.

**Tier**: Standard (storage is persistent cross-component state)
**Recommendation**: Create a constants file with all storage keys:
```typescript
export const STORAGE_KEYS = {
  ERRORS_PER_TAB: (tabId: number) => `errors_tab_${tabId}`,
  TECH_PER_TAB: (tabId: number) => `tech_tab_${tabId}`,
  PANEL_WIDTH: "errordecoder-panel-width",
  PENDING_DECODE_TEXT: "pendingText",
  SELECTED_ELEMENT: "selectedElement",
  API_KEY: "apiKey",
  USER_EMAIL: "userEmail",
  USER_PLAN: "userPlan",
} as const;
```

---

### HIGH — No JSDoc on Exported Functions (API Interface)

**Files**:
- `packages/extension/src/shared/api.ts:38-70` — `api.*` exported object
- `packages/extension/src/shared/storage.ts:4-38` — `storage.*` and `sessionStorage.*` exported
- `packages/extension/src/content/inspector.ts:10-50` — `startInspecting()`, `stopInspecting()`
- `packages/extension/src/content/panel.ts:15-48` — `showPanel()`, `hidePanel()`, `togglePanel()`, `isPanelVisible()`
- `packages/extension/src/content/tech-detect.ts:14-378` — `detectTechStack()`

**Issue**: All exported functions lack JSDoc. Functions like `api.decode()` don't document:
- What fields are required in the request
- What the response structure is (consumers have to read response usage to infer)
- Error conditions
- Rate limits or quotas

**Tier**: Standard (public API)
**Recommendation**: Add JSDoc to all exports:
```typescript
/**
 * Decode an error message using Claude AI
 * @param body - { errorText: string } - The error message or stack trace to decode
 * @returns Promise<ApiResponse<DecodeResponse>> - { data: { whatHappened, why, howToFix, codeExample }, error? }
 * @throws Network errors if API unreachable
 */
decode: (body: DecodeRequest) => request<DecodeResponse>("/decode", {...}),
```

---

### HIGH — No Flow Documentation for Multi-Step Operations

**File**: `packages/extension/src/sidepanel/index.ts:342-384` (decodeSingle) and `386-428` (decodeBatch)
**Issue**:
`decodeSingle()` and `decodeBatch()` are 40+ line functions performing multi-step I/O:
1. Validate API key (storage read)
2. Resolve source maps (async content script message)
3. Fetch decode API with enriched text
4. Render markdown response
5. Update UI state

No step-by-step breakdown. No documentation of failure modes (e.g., what happens if sourcemap resolution times out but decode still proceeds?).

**Tier**: Operational (multi-step async flow with potential race conditions)
**Recommendation**: Add flow comment:
```typescript
/**
 * Decode a single error with optional source map resolution
 *
 * Flow:
 * 1. Load API key from storage (fail → show "not set" error)
 * 2. Ask content script to resolve source maps (timeout 5s, fallback to original text)
 * 3. POST /decode API with enriched error + tech context
 * 4. Render markdown response with copy buttons
 * 5. Reset UI state (enable buttons, hide loading skeleton)
 *
 * Failure modes:
 * - No API key: shows error inline, returns early
 * - Source map timeout: continues with unresolved text (logged as "Failed to connect")
 * - Decode API error: shows error message, button re-enabled
 */
async decodeSingle(errorText: string, model: "haiku" | "sonnet") { ... }
```

---

### HIGH — CSS Source Map Resolution Not Documented

**File**: `packages/extension/src/content/inspector.ts:239-375`
**Issue**:
`resolveCSSSourceMaps()` and related functions (getCSSSourceFiles, findSelectorInSources) are 130+ lines of complex logic with:
- No JSDoc on exported/key functions
- No explanation of the algorithm (why search sourcesContent for selectors?)
- Race condition: CSS maps fetched in background, but sidebar shows stale element info until update arrives (line 98-113)
- No timeout documented (actually has implicit 3s timeout in line 101, not explained)

**Tier**: Operational (external I/O, async, multiple failure paths)
**Recommendation**: Add JSDoc:
```typescript
/**
 * Resolve bundled CSS files to original source files via source maps
 *
 * For each CSS rule from a bundled file (e.g., app.abc123.css):
 * 1. Fetch the .css file to find sourceMappingURL (data: URI or relative path)
 * 2. Fetch/decode the source map JSON
 * 3. Search sourcesContent for the rule selector to find original file
 * 4. Return original filenames (e.g., "components/Dashboard.vue")
 *
 * Race condition: CSS rules shown immediately, updated later when source maps resolved.
 * All errors silently caught; returns original rules if resolution fails.
 *
 * @param rules - CSS rules with selectors and bundled filenames
 * @returns Promise with same rules + originalFile field (if found)
 * @timeout 3 seconds total
 */
async resolveCSSSourceMaps(rules: Array<...>): Promise<...>
```

---

### MEDIUM — Magic DOM Selectors and Attribute Names

**File**: `packages/extension/src/capture/main-world.ts:171-174`, `tech-detect.ts:386`
**Issue**:
DOM markers used to detect frameworks and expose globals:
```typescript
document.documentElement.setAttribute("data-errordecoder-globals", JSON.stringify(globals));
// ...
const raw = document.documentElement.getAttribute("data-errordecoder-globals");
```

The attribute name `data-errordecoder-globals` is hardcoded in two files. If typo or rename, silent data loss.

**Tier**: Standard (would cause hard bug if misnamed)
**Recommendation**: Extract constant:
```typescript
const DOM_GLOBALS_ATTR = "data-errordecoder-globals" as const;
```

---

### MEDIUM — Cache Hit/Miss Logic Undocumented

**File**: `packages/extension/src/content/sourcemap.ts:23`, `inspector.ts:244`
**Issue**:
Two separate caches (mapCache for JS source maps, cssMapCache for CSS source maps) with inconsistent logic:
- mapCache stores null on failure (line 141), cssMapCache also stores null (line 302, 308)
- But mapCache checks `mapCache.get(scriptUrl) || null` (line 111), could return undefined and then || null

No documentation of cache semantics (when to cache, when to evict, how long valid).

**Tier**: Standard (caching is optimization, not critical, but inconsistent patterns create bugs)
**Recommendation**: Add cache strategy JSDoc:
```typescript
/**
 * Cache for fetched source maps
 *
 * Keys: script URL (e.g., "https://example.com/app.js")
 * Values: SourceMapData object or null (failed to fetch/parse)
 *
 * Cache is per-page session (cleared when tab closes via relay).
 * Null values prevent repeated fetch attempts on 404 or parse errors.
 */
const mapCache = new Map<string, SourceMapData | null>();
```

---

### MEDIUM — No Documentation on Deduplication Logic

**File**: `packages/extension/src/background/index.ts:132-135`, `sidepanel/index.ts:40-48`
**Issue**:
Error deduplication appears in two places with **identical logic but hardcoded 500ms**:
```typescript
// background.ts line 134
if (last && last.text === error.text && error.timestamp - last.timestamp < 500) return;

// sidepanel/index.ts line 42
if (last && last.text === text && Date.now() - last.timestamp < 500) return;
```

No comment explaining:
- Why 500ms? (burst dedup window)
- Is this intentional duplication or accidental?
- Should be centralized?

**Tier**: Standard (but repeated logic is a maintenance risk)
**Recommendation**: Add comment:
```typescript
/**
 * Deduplicate rapid-fire identical errors (same text within 500ms).
 * Prevents UI spam from loops calling console.error repeatedly.
 * Value empirically chosen (too short = duplicate spam, too long = lost errors).
 */
```

---

### MEDIUM — Tech Detection Has Many Magic Selectors, No Explanation

**File**: `packages/extension/src/content/tech-detect.ts:14-378`
**Issue**:
378 lines of tech detection with inline selectors, no explanation of source:
```typescript
if ((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) globals.react = true;
if ((window as any).React?.version) globals.reactVersion = ...
if (document.querySelector("[data-reactroot]")) ...
if (document.querySelector("[data-react-helmet]")) ...
```

Where do these selectors come from? Are they:
- Official framework markers?
- Reverse-engineered?
- Outdated (React 17 changed some)?

No citations or comments.

**Tier**: Standard (tech detection is non-critical but source unclear)
**Recommendation**: Add section header comment:
```typescript
/**
 * Tech stack detection using global markers and DOM attributes
 *
 * Methods (in priority order):
 * 1. Global objects (window.__REACT_DEVTOOLS_GLOBAL_HOOK__, etc.) — most reliable
 * 2. DOM attributes (data-reactroot, data-v-, etc.) — fallback
 * 3. Script URLs (framework CDN patterns) — unreliable, used last
 *
 * Sources:
 * - React: https://react.dev/learn/react-devtools (devtools hook)
 * - Vue: https://devtools.vuejs.org/ (window.__VUE__)
 * - Next.js: __NEXT_DATA__ injected by framework
 * - ... (document source for each)
 */
```

---

### MEDIUM — "Data" Field Pattern Unexplained Across Files

**File**: `packages/extension/src/shared/api.ts`, `sidepanel/index.ts:377`, `devtools/panel.ts:134`
**Issue**:
API responses use a `data` wrapper:
```typescript
// api.ts defines ApiResponse<T> (imported from @shared/types, not shown)
// Usage in sidepanel expects:
const json = await fetch(...);
renderMarkdown(json.data.markdown, decodeResult);

// But devtools expects:
if (json.error) { showResult(`<p>...${json.error.message}</p>`); }
```

What if `json.data` is undefined? Silent crash. No JSDoc on ApiResponse<T> type definition (shown in api.ts import, not defined in these files).

**Tier**: Standard (but affects error handling)
**Recommendation**: Add JSDoc to api wrapper:
```typescript
/**
 * Standard API response envelope (success and error cases)
 *
 * Success: { data: T, error?: undefined }
 * Error: { data?: undefined, error: { message: string, code?: string } }
 *
 * Always check for error first before accessing data.
 */
```

---

### MEDIUM — No Input Validation Documentation

**File**: `packages/extension/src/sidepanel/index.ts:327-329`, `popup/index.ts:46-49`
**Issue**:
Decode buttons accept textarea input with **no validation comments**:
```typescript
const text = decodeInput.value.trim();
if (!text || decoding) return;
decodeSingle(text, "haiku");
```

What if text is >5000 chars? What if it contains binary data? No limits documented. Backend likely has limits, but no comment explaining the contract.

**Tier**: Standard (frontend validation improves UX, but constraints undocumented)
**Recommendation**: Add JSDoc and validate:
```typescript
/**
 * Decode error with Haiku (free tier)
 *
 * Input validation:
 * - Non-empty required
 * - Max 5000 chars (API limit)
 * - No binary content (treated as UTF-8)
 */
haikuBtn.addEventListener("click", () => {
  const text = decodeInput.value.trim();
  if (!text || text.length > 5000 || decoding) return;
  decodeSingle(text, "haiku");
});
```

---

### LOW — localStorage.getItem Error Handling Inconsistent

**File**: `packages/extension/src/content/panel.ts:10-13`
**Issue**:
localStorage access wrapped in try/catch but no error handling comment:
```typescript
const STORAGE_KEY = "errordecoder-panel-width";
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) panelWidth = Math.max(280, Math.min(800, parseInt(saved, 10)));
} catch {}
```

Why might localStorage.getItem() throw? (Private browsing, quota exceeded). Silently failing is OK, but undocumented.

**Tier**: Standard (error handling is defensive but reason unclear)
**Recommendation**: Add comment:
```typescript
// localStorage may throw in private browsing mode or if quota exceeded.
// Silently falls back to default width (400px).
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) panelWidth = Math.max(280, Math.min(800, parseInt(saved, 10)));
} catch {
  // Private browsing or quota error — use default width
}
```

---

### LOW — Timeout Values Unexplained

**File**:
- `packages/extension/src/capture/main-world.ts:178` — `setTimeout(detectGlobals, 1000)`
- `packages/extension/src/sidepanel/index.ts:318` — `setTimeout(() => resolve(errorText), 5000)`
- `packages/extension/src/inspector.ts:101` — `new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))`

**Issue**: Timeout durations hardcoded with no explanation of why those specific values.

**Tier**: Low (timeouts are best-effort, not critical)
**Recommendation**: Add comments:
```typescript
// Wait 1s for page scripts to initialize globals (React, Vue, etc.)
setTimeout(detectGlobals, 1000);

// 5s timeout for content script to resolve source maps (network + processing)
setTimeout(() => resolve(errorText), 5000);

// 3s timeout for CSS source map fetch (if slow/unreachable, skip resolution)
const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
```

---

## Summary

- **Naming issues**: 0 (except `target` in inspector.ts needs clarification on reassignment)
- **Magic numbers/strings**: 13 (z-index, delays, limits, dedup window, panel width constraints, localStorage key names)
- **Missing JSDoc**: 35+ exported functions and message handlers
- **Missing operational docs** (flow, failure modes, side effects): 6 (decode flow, CSS source map resolution, message passing protocol, realm architecture, cache semantics, dedup logic)
- **Undocumented business logic**: 2 (tech detection sources, API response envelope)
- **Chrome extension patterns unclear**: 1 (cross-realm communication, CSP boundary)
- **Type safety gaps**: 1 (chrome.runtime.sendMessage callback vs Promise confusion)
- **Storage key registry missing**: 1 (no centralized key constants)

---

## What's Well-Documented

✓ **Good patterns to preserve:**
- `build.ts` has clear comments explaining manifest mutations and file transformations
- `sourcemap.ts` code is compact and mostly self-documenting (despite needing algorithm explanation)
- `panel.ts` DOM manipulation uses clear variable names (`dragHandle`, `panelFrame`, `isDragging`)
- `tech-detect.ts` detection rules follow consistent structure (easy to extend, even if undocumented)
- `storage.ts` uses TypeScript generics to enforce type safety on get/set (nice pattern)
- Error handling generally tries to avoid crashes (catch blocks on messaging)

---

## Recommendation Priority

**Fix FIRST (1-2 hours)**:
1. Add JSDoc to all exported functions (api.*, storage.*, inspector, panel, tech-detect)
2. Extract magic constants (z-index, timeouts, limits, storage keys)
3. Document message passing protocol (add JSDoc to chrome.runtime.onMessage handlers)

**Fix NEXT (2-3 hours)**:
4. Add flow diagrams (as comments) to multi-step operations (decodeSingle, resolveCSSSourceMaps)
5. Explain VLQ algorithm in sourcemap.ts
6. Document Chrome execution realm architecture (why 3 content scripts?)

**Fix OPTIONAL (polish)**:
7. Add input validation docs and limits
8. Centralize deduplication logic (extract to utility function)
9. Add cache strategy docs
10. Cite sources for tech detection selectors

---

**Report generated by documentation analyzer. All findings map to file:line with evidence. No code changes recommended — documentation only.**

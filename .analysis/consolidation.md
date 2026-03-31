# Cross-Service Consolidation Report

**Analyzed**: 2026-03-30
**Scope**: packages/extension/src — all UI surfaces and shared modules
**Services Identified**:
- `background/index.ts` — service worker (routing, network monitoring, storage)
- `capture/main-world.ts` — page-world capture script
- `content/index.ts` — content script coordinator
- `content/inspector.ts` — DOM element inspector
- `content/panel.ts` — injected iframe panel host
- `content/relay.ts` — document_start error relay
- `content/sourcemap.ts` — JS source map resolver
- `content/tech-detect.ts` — tech stack detector
- `devtools/panel.ts` — DevTools panel UI
- `options/index.ts` — options page
- `popup/index.ts` — popup UI
- `shared/api.ts` — typed API client
- `shared/storage.ts` — typed storage wrapper
- `sidepanel/index.ts` — injected sidebar UI

**Consolidation Opportunities Found**: 6

---

## HIGH — Duplicate Raw fetch() API Calls Bypassing shared/api.ts

**Type**: Shared Logic
**Services Involved**: `sidepanel/index.ts`, `devtools/panel.ts`
**Current State**:
`shared/api.ts` exists specifically to wrap `fetch` calls with auth headers, the `API_BASE` constant, and typed responses. Despite this, both `sidepanel/index.ts` and `devtools/panel.ts` bypass it entirely and issue their own raw `fetch` calls, each re-implementing the same pattern:

- `sidepanel/index.ts:278` — raw `fetch` for `/usage`
- `sidepanel/index.ts:361–384` — raw `fetch` for `/decode` (single)
- `sidepanel/index.ts:398–428` — raw `fetch` for `/decode-batch`
- `sidepanel/index.ts:574–595` — raw `fetch` for `/decode` (inspect)
- `devtools/panel.ts:115–166` — raw `fetch` for `/decode`

Each of these copies the same `typeof __API_BASE__ !== "undefined" ? __API_BASE__ : "http://localhost:4001/api"` guard and manually constructs auth headers from a locally-duplicated `getApiKey()` function. The shared client already handles all of this correctly.

**Proposed Consolidation**: Route all API calls through `shared/api.ts`. Add a `decodeBatch` method and an `inspect` mode parameter to the existing `decode` method. Delete the local `getApiKey()` definitions in both files — they are identical to what `shared/api.ts` already does via `storage.get("apiKey")`.

**Trigger Condition**: Any time the API base URL, auth header format, or error response shape changes, it must be updated in three places instead of one. This is already live debt.

**Effort**: Low — mechanical substitution. No architecture change needed.

**Benefits**: Single place to change auth, base URL, or response handling. Eliminates four copies of the `__API_BASE__` guard. Consistent error handling across all surfaces.

**Risks**: `sidepanel/index.ts` uses `marked` for markdown rendering while `devtools/panel.ts` uses manual HTML construction — the response format they expect differs slightly. The consolidation is the fetch layer only, not the rendering layer.

---

## HIGH — Duplicate getApiKey() Implementations

**Type**: Shared Logic
**Services Involved**: `sidepanel/index.ts:339–341`, `devtools/panel.ts:98–101`
**Current State**:
Both files define an identical `getApiKey` function that wraps `chrome.storage.local.get("apiKey")` in a Promise. The implementations are character-for-character identical except for the variable name in the callback:

```
// sidepanel/index.ts:339
const getApiKey = (): Promise<string | null> =>
  new Promise((resolve) => chrome.storage.local.get("apiKey", (r) => resolve(r.apiKey || null)));

// devtools/panel.ts:98
const getApiKey = (): Promise<string | null> =>
  new Promise((resolve) => {
    chrome.storage.local.get("apiKey", (result) => resolve(result.apiKey || null));
  });
```

`shared/storage.ts` already provides a typed `storage.get("apiKey")` that does exactly this, and `shared/api.ts` already calls it in `getHeaders()`.

**Proposed Consolidation**: Delete both local `getApiKey` functions. Use `storage.get("apiKey")` from `shared/storage.ts` directly, or remove the need entirely by routing through `shared/api.ts` (which already handles auth headers internally).

**Trigger Condition**: This is already worth fixing — two identical functions exist right now, both duplicating a typed wrapper that's already in shared.

**Effort**: Low — two file edits, no new code.

**Benefits**: Eliminates divergence risk if the storage key name ever changes.

**Risks**: None material. Both functions are identical to their shared equivalent.

---

## HIGH — Duplicate __API_BASE__ Guard (4+ copies)

**Type**: Shared Infrastructure
**Services Involved**: `sidepanel/index.ts` (lines 278, 361, 398, 574), `devtools/panel.ts` (line 115), `shared/api.ts` (lines 13–15)
**Current State**:
The expression `typeof __API_BASE__ !== "undefined" ? __API_BASE__ : "http://localhost:4001/api"` appears 5 times across the extension. `shared/api.ts` correctly defines this once as a module-level `API_BASE` constant. The other four occurrences in `sidepanel/index.ts` and one in `devtools/panel.ts` re-declare it inline at each call site.

**Proposed Consolidation**: Export `API_BASE` from `shared/api.ts`, or better yet, eliminate the need by routing all calls through `api.*` methods which already use the constant internally.

**Trigger Condition**: This is already a live problem — if the fallback port changes from `4001`, it must be updated in 5 places.

**Effort**: Low — falls out naturally from fixing the raw-fetch issue above.

**Benefits**: Single source of truth for the API base URL. One change affects all surfaces.

**Risks**: None. All copies are currently identical.

---

## MEDIUM — Duplicate escapeHtml() Utility

**Type**: Shared Logic
**Services Involved**: `sidepanel/index.ts:657`, `devtools/panel.ts:91`
**Current State**:
Both files define an identical `escapeHtml` utility:

```
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
```

The function is used extensively in both — 7 call sites in `devtools/panel.ts` and 5 in `sidepanel/index.ts`.

**Proposed Consolidation**: Move to `shared/` (e.g., `shared/utils.ts`). Both files import and use it.

**Trigger Condition**: Worth doing when either file next gets a meaningful edit. The risk of divergence is low since HTML escaping rarely changes, but it's a textbook shared utility.

**Effort**: Low — new file, two import changes.

**Benefits**: Eliminates copy-paste maintenance surface. If a fifth character (e.g., `'`) needs escaping, one change covers all surfaces.

**Risks**: None material.

---

## MEDIUM — Duplicate CapturedError Type Definition

**Type**: Shared Logic
**Services Involved**: `sidepanel/index.ts:6–12`, `devtools/panel.ts:4–8`, `background/index.ts` (inline in appendCapturedError)
**Current State**:
`CapturedError` is defined three times with slightly different shapes:

- `sidepanel/index.ts:6` — `{ text, level, timestamp, url?, domain? }`
- `devtools/panel.ts:4` — `{ text, level: "error" | "warning", timestamp }` (narrower union, missing url/domain)
- `background/index.ts:119` — inline object type `{ text, level, timestamp, url?, domain?, source?, tabId }` (widest, includes source and tabId)

The devtools panel's narrower definition could silently drop fields if the type were ever made stricter. The sidepanel and background versions are compatible but not unified.

**Proposed Consolidation**: Move the canonical type (background's full shape) to `@shared/types` and import it everywhere. The devtools panel can use the same type with `source` and `tabId` as optional.

**Trigger Condition**: Worth doing when adding a new field to captured errors — currently you'd need to update three type definitions.

**Effort**: Low — type-only change, no runtime impact.

**Benefits**: Single authoritative type. Compiler catches shape mismatches across all consumers.

**Risks**: None. The devtools panel would just gain optional fields it already ignores.

---

## LOW — devtools/panel.ts Bypasses Storage Abstraction

**Type**: Shared Infrastructure
**Services Involved**: `devtools/panel.ts:98–101`
**Current State**:
`devtools/panel.ts` uses the raw `chrome.storage.local.get` callback API directly while every other file that needs storage (options, popup, content scripts) uses the typed `storage` wrapper from `shared/storage.ts`. The devtools panel is the only surface that bypasses it.

**Proposed Consolidation**: Replace the raw callback call with `storage.get("apiKey")` from `shared/storage.ts`.

**Trigger Condition**: Worth including in any future devtools panel refactor. Low urgency on its own.

**Effort**: Low — one-line change.

**Benefits**: Consistent storage access pattern. If the storage key name changes, typed wrapper propagates the change automatically.

**Risks**: None.

---

## LOW — basicMarkdownToHtml Dead Code in sidepanel

**Type**: Shared Logic
**Services Involved**: `sidepanel/index.ts:631–655`
**Current State**:
`sidepanel/index.ts` defines a 25-line `basicMarkdownToHtml` function (a manual regex-based markdown converter) that is never called anywhere in the file. The file uses `marked` (imported at line 4) exclusively. The dead function appears to be a leftover from before `marked` was added.

**Proposed Consolidation**: Delete `basicMarkdownToHtml`. It is unreachable code adding noise and maintenance surface. If a fallback renderer is ever needed, it should be in `shared/` not inline.

**Trigger Condition**: Worth removing in any routine cleanup pass.

**Effort**: Trivial — delete 25 lines.

**Benefits**: Removes ~25 lines of dead code that will confuse future readers and could be mistakenly revived.

**Risks**: None — confirmed unreachable by grepping all call sites.

---

## Service Dependency Map

```
capture/main-world.ts
  └─ writes to: DOM attribute (data-errordecoder-globals)
  └─ dispatches: CustomEvent "errordecoder-error"

content/relay.ts
  └─ listens: CustomEvent "errordecoder-error"
  └─ writes to: background via chrome.runtime.sendMessage (CAPTURED_ERROR)

content/tech-detect.ts
  └─ reads from: DOM attribute (data-errordecoder-globals)
  └─ reads from: DOM (script/link tags, meta tags)

content/index.ts
  └─ calls: tech-detect, inspector, panel, sourcemap
  └─ sends: TECH_DETECTED to background

content/inspector.ts
  └─ sends: ELEMENT_SELECTED, INSPECT_CANCELLED to background (session storage)

content/panel.ts
  └─ hosts: sidepanel/index.html in iframe
  └─ bridges: postMessage ERRORDECODER_CLOSE

content/sourcemap.ts
  └─ reads from: page scripts via fetch (same-origin)
  └─ called by: content/index.ts on RESOLVE_SOURCEMAP message

background/index.ts
  └─ reads: chrome.webRequest (all URLs)
  └─ writes to: chrome.storage.session (errors_tab_*, tech_tab_*, pendingText, selectedElement)
  └─ writes to: chrome.storage.local (apiKey, userEmail, userPlan)

sidepanel/index.ts
  └─ reads from: chrome.storage.session (errors_tab_*, pendingText, selectedElement, tech_tab_*)
  └─ reads from: chrome.storage.local (apiKey) — via local getApiKey(), NOT shared/storage.ts
  └─ calls: API /usage, /decode, /decode-batch (raw fetch, bypasses shared/api.ts)
  └─ sends messages to content: RESOLVE_SOURCEMAP, START_INSPECT, STOP_INSPECT

devtools/panel.ts
  └─ reads from: chrome.storage.local (apiKey) — via local getApiKey(), NOT shared/storage.ts
  └─ calls: API /decode (raw fetch, bypasses shared/api.ts)
  └─ receives: DEVTOOLS_ERROR via port + onMessage

popup/index.ts
  └─ calls: shared/api.ts (correct)
  └─ reads from: (no direct storage reads)

options/index.ts
  └─ reads from: shared/storage.ts (correct)
  └─ calls: shared/api.ts (correct)
```

---

## Priority

### Quick Wins (low effort, clear benefit)

1. **Route devtools/panel.ts API call through shared/api.ts** — eliminates the local `getApiKey()`, the `__API_BASE__` guard copy, and the manual auth header construction in one edit.
2. **Route sidepanel/index.ts API calls through shared/api.ts** — same as above, covers 4 raw-fetch call sites. Requires adding `decodeBatch` to `shared/api.ts`.
3. **Delete `basicMarkdownToHtml` from sidepanel/index.ts** — confirmed dead code, zero risk.
4. **Move `escapeHtml` to `shared/utils.ts`** — trivial shared utility extraction.

### Strategic (medium effort, do when triggered)

5. **Unify `CapturedError` type in `@shared/types`** — do when adding a new field to captured errors; three definitions need updating currently.

### Future State (high effort, revisit later)

None of the identified opportunities require architectural changes or new services.

---

## What's Already Well-Shared

- **`shared/api.ts`** — well-designed typed API client with auth and base URL handling. The problem is it's not used by all consumers.
- **`shared/storage.ts`** — typed storage wrapper used correctly by options and popup. Content scripts and sidepanel bypass it for session storage (which is legitimate — session storage has a different key structure).
- **`content/relay.ts` + `capture/main-world.ts` split** — the two-world capture architecture (main world captures, isolated world relays) is deliberately correct and should not be consolidated.
- **`content/sourcemap.ts`** — correctly isolated as a module; it's only loaded in the content script world where same-origin fetch works.
- **Tech stack detection pipeline** — the main-world-to-DOM-attribute-to-isolated-world bridge is an intentional workaround for Chrome's context isolation and is correct as-is.

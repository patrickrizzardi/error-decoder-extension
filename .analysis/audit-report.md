# Coordinated Audit Report — packages/extension

**Date**: 2026-03-30
**Analyzers**: 8 (bugs, performance, cleanup, redundancy, consistency, consolidation, documentation, UX)
**Files Scanned**: 22 source files
**Total Raw Findings**: 120+
**After Deduplication**: 42 unique findings

---

## Coordination Notes

### Deduplication (13 merged findings)

| Finding | Flagged By | Merged Into |
|---------|-----------|------------|
| `decodeBatch` dead code | bugs #9, cleanup #2, consolidation | Single finding: dead code |
| `basicMarkdownToHtml` dead code | cleanup #3, consolidation, performance | Single finding: dead code |
| `escapeHtml` duplicate | redundancy, consolidation, consistency | Single finding: DRY violation |
| `getApiKey` duplicate | redundancy, consolidation | Single finding: DRY violation |
| `__API_BASE__` duplicate (5x) | redundancy, consolidation, consistency, cleanup | Single finding: DRY violation |
| Copy button pattern (4x) | redundancy, UX (accessibility) | Single finding: DRY + accessibility |
| `appendCapturedError` race | bugs #4, performance | Single finding: critical bug + perf |
| Event listeners never removed | bugs #10, performance | Single finding: resource leak |
| `CapturedError` type (3 defs) | consistency, consolidation | Single finding: type duplication |
| Active tab query (5x) | redundancy, performance | Single finding: DRY + perf |
| `detectTechStack` cache | bugs #7, performance | Single finding: stale cache |
| Storage access inconsistency | consistency, consolidation | Single finding: abstraction bypass |
| Boolean naming violations | consistency, documentation | Single finding: naming |

### False Positive Removed

- **Documentation #4 (HIGH)**: "chrome.runtime.sendMessage doesn't return Promise" — **INCORRECT for MV3**. In Manifest V3, `sendMessage()` without a callback returns a Promise. The `.catch(() => {})` pattern is correct. Removed from findings.

### Contradictions Resolved

1. **Consistency says `function` keyword is a violation** in `main-world.ts` — These are intentional for `this` binding (`console.error = function(...)`, `XMLHttpRequest.prototype.open = function(...)`). Arrow functions would break `this` context. **Resolution**: Document as acceptable exception, not a violation.

2. **UX wants specific error messages** vs **security wants generic** — No conflict: these are client-side extension errors, not auth responses. Specific errors improve debugging UX without exposing server internals. **Resolution**: UX wins.

### Dependency Rules Applied

1. **DRY before individual fixes**: Consolidate shared utils before fixing bugs in duplicated code
2. **Critical bugs first**: Race conditions and crashes block all other work
3. **Bugs before cleanup**: Don't remove code until bugs are fixed
4. **Consistency before documentation**: Standardize patterns before documenting them

---

## Phase 1: Critical Bugs (must fix first)

### 1.1 — `appendCapturedError` read-modify-write race condition
- **File**: `background/index.ts:119-140`
- **Agents**: bugs (CRITICAL), performance (MEDIUM)
- **Issue**: Concurrent network errors both read storage, both push, second write overwrites first. Silently drops errors.
- **Fix**: In-memory buffer per tabId + debounced write (100ms). Also fixes the fire-and-forget problem from non-awaited calls at lines 38, 57, 75.
- **Model**: sonnet (async pattern redesign)

### 1.2 — Message listener returns `true` for synchronous handlers
- **File**: `content/index.ts:29-62`
- **Agents**: bugs (CRITICAL)
- **Issue**: All sync handlers (`SHOW_PANEL`, `HIDE_PANEL`, etc.) return `true`, holding message channels open indefinitely. Resource leak.
- **Fix**: Move `RESOLVE_SOURCEMAP` handler to top with early `return true`. Remove outer `return true`.
- **Model**: haiku (mechanical restructure)

### 1.3 — Unguarded `new URL()` crashes service worker
- **File**: `background/index.ts:43`
- **Agents**: bugs (HIGH)
- **Issue**: `new URL(details.url).hostname` in `onCompleted` has no try/catch. The `onErrorOccurred` handler already has the safe pattern.
- **Fix**: Apply same try/catch IIFE pattern from `onErrorOccurred` (line 61).
- **Model**: haiku (one-line fix)

### 1.4 — `escapeHtml(undefined)` crashes devtools panel
- **File**: `devtools/panel.ts:128-142`
- **Agents**: bugs (CRITICAL)
- **Issue**: `data.codeExample` exists but `.after` may be undefined. `escapeHtml(undefined)` → TypeError.
- **Fix**: Guard with `data.codeExample?.after` before rendering.
- **Model**: haiku (null guard)

### 1.5 — Storage change listener false trigger kills inspect sessions
- **File**: `sidepanel/index.ts:477-482`
- **Agents**: bugs (HIGH)
- **Issue**: `changes.selectedElement === undefined` is always true for any unrelated storage update. Any new error arriving cancels the inspect session.
- **Fix**: Check `changes.selectedElement` exists in the changes object AND `newValue` is undefined while `oldValue` was set.
- **Model**: haiku (condition fix)

### 1.6 — `renderedCount` not reset on external storage clear
- **File**: `sidepanel/index.ts:103-109`
- **Agents**: bugs (HIGH)
- **Issue**: If errors are cleared externally, `renderedCount` stays at old value. New errors never render.
- **Fix**: In `onChanged` listener, if new array length < renderedCount, reset renderedCount and re-render.
- **Model**: haiku (guard + reset)

### 1.7 — Unbounded `__errorDecoderBuffer` in main world
- **File**: `capture/main-world.ts:9`
- **Agents**: performance (CRITICAL)
- **Issue**: Buffer grows forever. On error-spamming pages, megabytes of heap in host page.
- **Fix**: Cap at 100 entries (ring buffer or shift oldest). Background already caps at 50.
- **Model**: haiku (add length check)

### 1.8 — `setTimeout` never cleared in `resolveSourceMaps`
- **File**: `sidepanel/index.ts:308-323`
- **Agents**: bugs (CRITICAL)
- **Issue**: Timeout timer leaks on every decode call. Both timeout and callback can resolve independently.
- **Fix**: Store timer ref, `clearTimeout` in callback.
- **Model**: haiku (three-line fix)

---

## Phase 2: DRY Consolidation (before individual fixes)

### 2.1 — Extract `escapeHtml` to `shared/`
- **Files**: `devtools/panel.ts:91`, `sidepanel/index.ts:657` (identical definitions)
- **Agents**: redundancy (HIGH), consolidation (MEDIUM), consistency
- **Fix**: Create `shared/html.ts` with `escapeHtml`, import in both files.
- **Model**: haiku (mechanical move)

### 2.2 — Move `getApiKey` to `shared/storage.ts`
- **Files**: `devtools/panel.ts:98-101`, `sidepanel/index.ts:339-340` (identical)
- **Agents**: redundancy (HIGH), consolidation (HIGH)
- **Fix**: Add `getApiKey` to existing `storage` export in `shared/storage.ts`. Delete local copies.
- **Model**: haiku (mechanical move)

### 2.3 — Route all API calls through `shared/api.ts`
- **Files**: `sidepanel/index.ts` (4 raw fetch calls), `devtools/panel.ts` (1 raw fetch)
- **Agents**: redundancy (HIGH), consolidation (HIGH×3)
- **Fix**: Add missing methods to `api` object in `shared/api.ts` (usage, decodeBatch). Replace raw fetches. Eliminates 5 copies of `__API_BASE__` guard and 5 inline auth header constructions.
- **Model**: sonnet (cross-file refactor, must understand response handling differences)

### 2.4 — Unify `CapturedError` type in shared
- **Files**: `sidepanel/index.ts:6-12`, `devtools/panel.ts:4-8`, `background/index.ts` (inline)
- **Agents**: consistency (HIGH), consolidation (MEDIUM)
- **Fix**: Define canonical type in `shared/types.ts` (widest shape from background). Import everywhere.
- **Model**: haiku (type-only change)

### 2.5 — Extract copy button utility
- **Files**: `options/index.ts:38-46`, `devtools/panel.ts:156-162`, `popup/index.ts:71-77`, `sidepanel/index.ts:620-625`
- **Agents**: redundancy (CRITICAL), UX (HIGH — accessibility)
- **Fix**: Create `shared/ui.ts` with `copyToClipboard(btn, getText, originalText)`. Add `aria-live="polite"` for screen readers.
- **Model**: haiku (mechanical extraction + small a11y fix)

---

## Phase 3: High Priority Fixes

### 3.1 — mousemove handler needs rAF gating
- **File**: `content/inspector.ts:52-73`
- **Agents**: performance (HIGH)
- **Issue**: `getBoundingClientRect` + 4 style writes on every raw mousemove event. Layout thrashing at 60-100fps.
- **Fix**: Wrap in `requestAnimationFrame`, cancel previous rAF.
- **Model**: haiku (well-specified pattern)

### 3.2 — VLQ decoder: lookup table + memoization
- **File**: `content/sourcemap.ts:196-258`
- **Agents**: performance (HIGH×2, MEDIUM)
- **Issue**: `indexOf` is O(64) per char (should be O(1) lookup table). Decoded mappings re-decoded per stack frame.
- **Fix**: (1) Pre-build `Uint8Array` lookup. (2) Cache decoded segments alongside raw map in `mapCache`.
- **Model**: sonnet (algorithmic change)

### 3.3 — Source map fetch: use Range header
- **File**: `content/sourcemap.ts:115-121`, `content/inspector.ts:307-313`
- **Agents**: performance (HIGH)
- **Issue**: Fetches entire JS/CSS bundles (up to 2MB) to read last ~100 bytes of `sourceMappingURL`.
- **Fix**: `fetch(url, { headers: { Range: 'bytes=-512' } })`, fallback to full fetch if 200 (no range support).
- **Model**: sonnet (needs fallback logic)

### 3.4 — Stale tech stack cache on SPA navigation
- **File**: `content/tech-detect.ts:12-13`
- **Agents**: bugs (HIGH), performance (HIGH)
- **Issue**: Module-level cache never invalidated on SPA navigation.
- **Fix**: Listen to `popstate`/`hashchange` events to clear cache. Or set a TTL.
- **Model**: haiku (add event listener + cache clear)

### 3.5 — Full stylesheet scan on inspector click
- **File**: `content/inspector.ts:179-223`
- **Agents**: performance (CRITICAL)
- **Issue**: O(S×R) synchronous scan of all CSS rules. 3,000-8,000 rules on component library pages.
- **Fix**: Cap iteration at 500 rules with early exit. Use `getComputedStyle` for quick fallback.
- **Model**: haiku (add iteration cap)

---

## Phase 4: Cleanup & Consistency

### 4.1 — Remove dead code
- `togglePanel` export — `content/panel.ts:44` (cleanup)
- `decodeBatch` function — `sidepanel/index.ts:386-428` (bugs, cleanup, consolidation)
- `basicMarkdownToHtml` function — `sidepanel/index.ts:631-655` (cleanup, consolidation, performance)
- `#result-overlay` markup — `sidepanel/index.html:83-95` (cleanup)
- `#upgrade-link` element — `popup/index.html:69` (cleanup)
- `#manage-sub` button — `options/index.html:92` (cleanup — placeholder with no handler)
- **Model**: haiku

### 4.2 — Merge duplicate `onChanged` listeners
- **File**: `sidepanel/index.ts:55` and `sidepanel/index.ts:236`
- **Agents**: performance (HIGH)
- **Fix**: Combine into single listener that handles all storage keys.
- **Model**: haiku

### 4.3 — Use `currentTabId` instead of repeated `chrome.tabs.query`
- **File**: `sidepanel/index.ts` (lines 310, 438, 448, 519)
- **Agents**: redundancy (HIGH), performance (MEDIUM)
- **Fix**: Replace 4 redundant `chrome.tabs.query` calls with `currentTabId`.
- **Model**: haiku

### 4.4 — Boolean naming fixes
- `panelVisible` → `isPanelVisible` (content/panel.ts:5)
- `inspecting` → `isInspecting` (content/panel.ts:3, content/inspector.ts:3)
- `decoding` → `isDecoding` (sidepanel/index.ts:296)
- **Agents**: consistency (HIGH)
- **Model**: haiku (rename)

### 4.5 — Build script parallelism
- **File**: `build.ts:33-57`
- **Agents**: performance (LOW)
- **Fix**: `Promise.all(entrypoints.map(...))` instead of sequential `for...of await`.
- **Model**: haiku

### 4.6 — Event listener cleanup in panel.ts
- **File**: `content/panel.ts:157, 163, 181`
- **Agents**: bugs (HIGH), performance (MEDIUM)
- **Fix**: Store handler refs. Remove `mousemove`/`mouseup` listeners when panel destroyed. Remove `message` listener in hidePanel.
- **Model**: haiku

---

## Phase 5: Documentation (optional, low priority for MVP)

### 5.1 — Extract magic constants
- z-index values (panel.ts:20-22)
- Timeouts: 1000ms, 5000ms, 3000ms, 500ms dedup
- Limits: 50 max errors, 150 preview chars, 15 decode-all count, 5 stack frames, 20 CSS props, 280/800 panel width
- **Agents**: documentation (MEDIUM), consistency
- **Model**: haiku

### 5.2 — Create message type registry
- All message types as magic strings across 4+ files
- **Agents**: documentation (CRITICAL), consistency (Note #3)
- **Fix**: Create `shared/messages.ts` with typed message constants.
- **Model**: haiku

### 5.3 — Storage key constants
- **Agents**: documentation (HIGH)
- **Fix**: Create `STORAGE_KEYS` const object in `shared/storage.ts`.
- **Model**: haiku

### 5.4 — VLQ algorithm comments
- **File**: `content/sourcemap.ts:196-220`
- **Agents**: documentation (CRITICAL)
- **Fix**: Add section comments explaining VLQ bit structure.
- **Model**: haiku

### 5.5 — Content script realm architecture comments
- **Files**: `content/index.ts`, `capture/main-world.ts`, `content/relay.ts`
- **Agents**: documentation (CRITICAL)
- **Fix**: Add JSDoc explaining 3-script architecture and data flow.
- **Model**: haiku

---

## Phase 6: UX Improvements (backlog — not blocking launch)

### 6.1 — CRITICAL: Auth flow / onboarding
- No signup flow in extension. Dead end for new users.
- Need: "Sign Up" button in options page, inline settings link in error messages.
- **Agents**: UX (CRITICAL×2)

### 6.2 — HIGH: Add retry button to failed API requests
- Generic "Failed to connect" with no recovery path.
- **Agents**: UX (HIGH)

### 6.3 — HIGH: Simplify decode loading states
- "Resolving source maps..." → "Decoding..." is jargon. Use single "Decoding..." state.
- **Agents**: UX (HIGH)

### 6.4 — HIGH: Better empty state on Errors tab
- "Waiting for errors..." is passive. Needs action-oriented guidance.
- **Agents**: UX (HIGH)

### 6.5 — HIGH: Sonnet button refresh
- `loadUserPlan()` only runs once on init. Pro upgrade not reflected until sidebar reopen.
- **Agents**: UX (HIGH)

### 6.6 — MEDIUM: Character counter enforcement
- Counter shows limit but doesn't prevent submission.
- **Agents**: UX (MEDIUM)

### 6.7 — MEDIUM: Network error categorization
- Raw error codes shown to users. Need human-friendly categories.
- **Agents**: UX (MEDIUM)

### 6.8 — LOW: Focus indicators on tabs (WCAG)
- `.tab:focus-visible` missing.
- **Agents**: UX (LOW)

---

## Parallel Execution Groups

Fixes that touch different files and have no dependencies can run in parallel:

**Group A** (background/index.ts): 1.1 + 1.3
**Group B** (content/index.ts): 1.2
**Group C** (devtools/panel.ts): 1.4 (after Phase 2 escapeHtml move)
**Group D** (sidepanel/index.ts): 1.5 + 1.6 + 1.8 (after Phase 2 consolidation)
**Group E** (capture/main-world.ts): 1.7
**Group F** (content/inspector.ts): 3.1 + 3.5
**Group G** (content/sourcemap.ts): 3.2 + 3.3
**Group H** (content/tech-detect.ts): 3.4
**Group I** (shared/ new files): Phase 2 all (2.1-2.5)

Phase 2 (Group I) should run before Groups C and D since those files are refactored by the DRY consolidation.

---

## Findings NOT Included (intentionally skipped)

- **`function` keyword in main-world.ts**: Justified for `this` binding. Not a violation.
- **Import pattern inconsistency**: Low impact, no runtime effect.
- **State management organization**: Working correctly, style preference.
- **Type imports missing `type` keyword**: Build optimization, not breaking.
- **Documentation analyzer false positive**: `sendMessage` DOES return Promise in MV3.

---

## Summary

| Severity | Count | Phase |
|----------|-------|-------|
| Critical | 8 | Phase 1 |
| High (DRY) | 5 | Phase 2 |
| High (bugs/perf) | 5 | Phase 3 |
| Medium (cleanup) | 6 | Phase 4 |
| Medium (docs) | 5 | Phase 5 |
| Medium/Low (UX) | 8 | Phase 6 |
| **Total** | **37** | |

5 findings removed (false positive, justified exceptions, low-impact style).

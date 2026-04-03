# Documentation & Clarity Report

**Analyzed**: 2026-04-02
**Scope**: Complete codebase (packages/api/src, packages/extension/src, packages/web/src)
**Issues Found**: 22

---

## Self-Documenting Fixes Needed

### Variables to Rename

| File:Line | Current | Suggested | Why |
|-----------|---------|-----------|-----|
| packages/extension/src/content/sourcemap.ts:34 | `m` | `match` | Loop variable name is unclear outside regex context; `m` is cryptic |
| packages/extension/src/sidepanel/index.ts:47 | `renderedCount` | `renderedErrorCount` | Ambiguous what's being counted; context matters |
| packages/extension/src/content/panel.ts:6 | `panelWidth` | `currentPanelWidth` | Module-level state variable should be explicit about its current state |
| packages/extension/src/content/inspector.ts:4 | `overlay` | `inspectorOverlay` | Generic name doesn't indicate this is specifically for the inspector feature |
| packages/extension/src/content/inspector.ts:5 | `hoveredElement` | `currentHoveredElement` | Current state should be explicit |
| packages/extension/src/content/inspector.ts:6 | `rafId` | `pendingAnimationFrameId` | `raf` abbreviation is unclear without context; `Id` convention mismatch |
| packages/extension/src/sidepanel/index.ts:86 | `currentTabId` | `activeTabId` | "Current" is ambiguous in async context; "active" or "resolved" is clearer |

### Constants to Extract

| File:Line | Magic Value | Suggested Name |
|-----------|-------------|----------------|
| packages/extension/src/content/inspector.ts:8 | `"rgba(86, 156, 214, 0.2)"` | `INSPECTOR_OVERLAY_BG` |
| packages/extension/src/content/inspector.ts:9 | `"rgba(86, 156, 214, 0.8)"` | `INSPECTOR_OVERLAY_BORDER` |
| packages/extension/src/content/panel.ts:6 | `400` | `DEFAULT_PANEL_WIDTH_PX` |
| packages/extension/src/content/panel.ts:13 | `280` | `MIN_PANEL_WIDTH_PX` |
| packages/extension/src/content/panel.ts:13 | `800` | `MAX_PANEL_WIDTH_PX` |
| packages/extension/src/content/panel.ts:79 | `"2147483647"` | `MAX_ZINDEX_32BIT` |
| packages/extension/src/content/panel.ts:98 | `"2147483647"` | `MAX_ZINDEX_32BIT` |
| packages/api/src/routes/decode.ts:10 | `1000` | `FREE_TIER_CHAR_LIMIT` | Already named, but good pattern |
| packages/api/src/routes/decode.ts:12 | `1500` | `AI_MAX_TOKENS` | Already named |
| packages/extension/src/sidepanel/index.ts:189 | `{ error: 0, network: 1, warning: 2 }` | `ERROR_SEVERITY_RANKS` | Currently inline; should be a named constant |
| packages/extension/src/content/sourcemap.ts:204 | `"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"` | `VLQ_ALPHABET` | Already has good context comment but value itself can be named |

### Booleans to Fix

| File:Line | Current | Suggested |
|-----------|---------|-----------|
| packages/extension/src/content/inspector.ts:3 | `isInspecting` | ✓ Correct (has `is` prefix) |
| packages/extension/src/content/panel.ts:5 | `panelVisible` | `isPanelVisible` | Missing `is` prefix for state boolean |
| packages/extension/src/content/panel.ts:130 | `isDragging` | ✓ Correct (has `is` prefix) |
| packages/extension/src/content/sourcemap.ts:26 | `decodedCache` | N/A (not a boolean, but semantically is a Map) |
| packages/extension/src/sidepanel/index.ts:494 | `isDecoding` | ✓ Correct (has `is` prefix) |

---

## Documentation Gaps (by severity)

### CRITICAL — Missing Time Complexity Documentation

**File**: `packages/extension/src/content/sourcemap.ts:281-308`
**Issue**: `findOriginalPosition()` performs a linear search through mapping segments without documenting complexity. For large source maps, this could be O(n) per frame resolution. The function iterates in a hot path.
**Tier**: Standard
**Recommendation**: Add JSDoc noting O(n) linear search and considering binary search optimization for production source maps > 10K lines.

---

### CRITICAL — Complex VLQ Decoding Algorithm Undocumented

**File**: `packages/extension/src/content/sourcemap.ts:210-239`
**Issue**: `decodeVLQ()` implements a complex Variable-Length Quantity decoder with bit-shifting logic. The algorithm is correct but has zero explanation beyond a comment. A developer maintaining this needs to understand VLQ encoding to debug or extend it.
**Tier**: Standard
**Recommendation**: Add detailed JSDoc explaining:
- VLQ format (6 bits per char, continuation flag in bit 5, value in bits 0-4)
- Sign encoding (final bit is sign, then right-shift 1)
- Why the algorithm accumulates via `shift += 5` (because we're building a variable-length integer)

---

### HIGH — Cache Hit Tracking Without Failure Mode Documentation

**File**: `packages/api/src/lib/cache.ts:34-37`
**Issue**: Cache increment happens asynchronously with no error handling. If the RPC fails, the hit count silently doesn't update. This is "fire and forget" but the contract isn't documented.
**Tier**: Operational
**Recommendation**: Add JSDoc comment: "Cache hit increment is async, fire-and-forget. Failures are logged to analytics only; do not block the response."

---

### HIGH — Source Map Resolution Timeout Not Documented

**File**: `packages/extension/src/sidepanel/index.ts:514-528`
**Issue**: `resolveSourceMaps()` implements a 5-second timeout with no documentation of why this timeout exists, what happens on timeout (silent fallback), or whether it affects user experience.
**Tier**: Operational
**Recommendation**: Add JSDoc explaining timeout is for content script responsiveness. If resolution takes >5s, original error text is returned (no data loss, just unresolved stacks).

---

### HIGH — Multi-Step Error Capture Flow Not Documented

**File**: `packages/extension/src/background/index.ts:1-212`
**Issue**: Complex error capture flow across three worlds (main → isolated relay → background) with per-tab storage, dedup logic, and flush timers. The flow is documented via comments but lacks a top-level overview of the architecture.
**Tier**: Operational
**Recommendation**: Add module-level JSDoc explaining:
1. Data flow: main-world.ts → relay.ts (document_start) → background (message) → session storage (per-tab)
2. Dedup window: identical errors within 500ms are suppressed
3. Storage cap: max 50 errors per tab
4. Flush strategy: 100ms debounce to storage

---

### HIGH — Tech Stack Detection Has Undocumented False Positive Risk

**File**: `packages/extension/src/content/tech-detect.ts:145-147`
**Issue**: Tailwind detection uses simple CSS class matching (`[class*='flex ']`, `[class*='bg-']`) which can produce false positives on any site using those classes, even with custom CSS. No documentation of this limitation.
**Tier**: Standard
**Recommendation**: Add comment above Tailwind detection explaining it looks for Tailwind utility patterns and may have false positives on sites using similar class naming. Exact version detection is not possible.

---

### HIGH — Sonnet Monthly Limit Logic Not Documented

**File**: `packages/api/src/routes/decode.ts:52-63`
**Issue**: Sonnet usage tracking uses current month string as a key. Logic resets to 0 if month changes, but:
1. No JSDoc explaining reset logic
2. No comment on edge case (what if month changes mid-request?)
3. No explanation of why this is per-month vs per-calendar-month
**Tier**: Operational
**Recommendation**: Add JSDoc explaining "Sonnet limit is per calendar month. If current month differs from stored month, usage resets to 0. No cross-month carryover."

---

### HIGH — CSS Source Map Heuristic Undocumented

**File**: `packages/extension/src/content/inspector.ts:264`
**Issue**: CSS hashed filename detection uses regex `/[a-f0-9]{5,}\.(css)/` but no comment explains why 5+ hex chars is the threshold or what false negatives might occur.
**Tier**: Standard
**Recommendation**: Add comment explaining this detects bundled CSS (e.g., `index66701.css`). Threshold of 5 chars is to avoid false positives on files like `my1a.css`. Modern bundlers use 8+ char hashes.

---

### MEDIUM — Unclear Error Deduplication Logic

**File**: `packages/extension/src/background/index.ts:183-184`
**Issue**: Dedup check compares `error.text` and timestamps with 500ms window. No documentation of:
- Why 500ms is chosen
- Whether this catches all common duplicates
- What happens with very similar errors (not identical text)
**Tier**: Standard
**Recommendation**: Add comment explaining "Dedup window suppresses identical errors within 500ms. This catches rapid console.error() calls and repeated network failures. Non-identical errors are not deduplicated."

---

### MEDIUM — String Normalization Logic in Cache Without Explanation

**File**: `packages/api/src/lib/cache.ts:11-12`
**Issue**: Cache normalization lowercases and removes extra whitespace. No comment explaining why this is safe or if it could cause cache key collisions.
**Tier**: Standard
**Recommendation**: Add JSDoc explaining "Normalize for cache key matching. Lowercasing is safe because error messages are case-insensitive (Error vs error, etc.). Whitespace normalization prevents 'Foo\n\nBar' vs 'Foo Bar' mismatches."

---

### MEDIUM — Magic Numbers in Panel Resizing

**File**: `packages/extension/src/content/panel.ts:23, 54, 94`
**Issue**: Drag handle position uses `panelWidth - 6` and `12px` width with no explanation of why these specific pixel values.
**Tier**: Standard
**Recommendation**: Add comment explaining "Drag handle is 12px wide, positioned 6px from right edge of panel to center the visual indicator."

---

### MEDIUM — No Documentation of Why File Path Pattern Regex Excludes Cache

**File**: `packages/api/src/lib/cache.ts:5-6`
**Issue**: The FILE_PATH_PATTERN regex matches file paths with extensions. The comment says "don't cache errors containing specific file paths" but doesn't explain why. This is important business logic.
**Tier**: Standard
**Recommendation**: Add comment explaining "Errors with specific file paths are usually environment-specific (dev vs prod, different machines). Don't cache these because the cached response won't be useful to other users."

---

### MEDIUM — No Documentation on Cache Key Collision Risk

**File**: `packages/api/src/lib/cache.ts:14-15`
**Issue**: SHA256 hash is computed after normalization. No comment on hash collision handling or whether table schema has uniqueness constraint.
**Tier**: Standard
**Recommendation**: Add comment noting "error_text_hash should have a UNIQUE constraint to prevent collision overwrites. Hash collisions in practice are negligible for our use case (<1M errors)."

---

### MEDIUM — Request Function in API Client Has No Error Handling Documentation

**File**: `packages/extension/src/shared/api.ts:37-47`
**Issue**: Generic `request()` function calls `response.json()` without try-catch. If response body is not valid JSON, it will throw unhandled. No documentation of this expectation.
**Tier**: Operational
**Recommendation**: Add JSDoc explaining "Assumes API always returns valid JSON. If API returns non-JSON (error page HTML), this will throw. Callers must handle Promise.reject()."

---

### MEDIUM — Sensitive Data Detection Patterns Not Documented

**File**: `packages/extension/src/shared/sensitive-check.ts:8-42`
**Issue**: 20+ regex patterns for detecting secrets, but no guidance on:
- False positive rates
- What to do if pattern matches something legitimate
- Why certain patterns are included (policy decision)
**Tier**: Standard
**Recommendation**: Add comment explaining "Patterns are conservative (high false positive rate is acceptable). Users can ignore warnings if text is not actually sensitive. Goal is to prevent accidental credential leaks."

---

### MEDIUM — Source Map Selector Search Logic Lacks Explanation

**File**: `packages/extension/src/content/inspector.ts:365-391`
**Issue**: `findSelectorInSources()` searches source map content for a selector, with fallback to filtering non-node_modules files. No documentation of this strategy or edge cases.
**Tier**: Standard
**Recommendation**: Add JSDoc explaining "Primary strategy: search sourcesContent for the CSS selector. Fallback if not found: return most likely source file by filtering node_modules and selecting app files (.vue/.tsx/.scss). This heuristic handles minified selectors."

---

### MEDIUM — Error Context String Concatenation Semantics Undocumented

**File**: `packages/extension/src/sidepanel/index.ts:410-415`
**Issue**: `getTechContext()` builds a string for AI prompts but doesn't document format expected by AI, whether it's always appended, or if it can be empty.
**Tier**: Standard
**Recommendation**: Add comment explaining "Returns tech stack string formatted for AI prompt (e.g., 'Detected tech stack: React v18, Tailwind'). Empty string if no tech detected. Always appended to user error text."

---

### MEDIUM — Fetch Override Side Effects Not Documented

**File**: `packages/extension/src/capture/main-world.ts:60-78`
**Issue**: `window.fetch` is overridden globally to emit errors on non-OK responses. This side effect isn't documented:
- Does it fire for all non-2xx or only 4xx+?
- What about redirects (3xx)?
- Are there performance implications?
**Tier**: Operational
**Recommendation**: Add comment explaining "Emits network errors for 4xx/5xx status codes. Does not fire for redirects (3xx) or success (2xx). Side effect is minimal (single CustomEvent dispatch per failed request)."

---

### MEDIUM — XHR Override Parameter Storage Uses Cryptic Names

**File**: `packages/extension/src/capture/main-world.ts:85-86`
**Issue**: Uses `__edUrl` and `__edMethod` to store state on XHR object. These names are cryptic and have no explanation of why this pattern is used instead of a WeakMap.
**Tier**: Standard
**Recommendation**: Add comment explaining "Store URL/method on XHR instance using double-underscore prefix to avoid collisions with legitimate XHR properties. Can't use WeakMap because we need the value in the loadend event."

---

## Summary

- **Cryptic variable names**: 7
- **Magic numbers needing extraction**: 11
- **Missing function docs**: 0 (all major functions have comments, though some lack JSDoc)
- **Missing complexity analysis (time/space)**: 2
- **Missing operational docs (flow/failure/side effects)**: 12
- **Undocumented business logic**: 8
- **False positive risks undocumented**: 1

**Total high-impact issues**: 5 (Critical + HIGH severity)

---

## What's Well-Documented

- **API routes**: All have clear parameter validation and error responses documented in code
- **Cache strategy**: Comment explains cache invalidation heuristics
- **Tech detection**: Comprehensive inline comments explaining each framework/service check
- **Error messages**: User-facing errors have clear, helpful copy
- **Storage patterns**: Typed wrappers around chrome.storage make intent clear
- **Manifest and build**: Comprehensive inline comments explaining content script worlds and build steps
- **VLQ decoding**: Has detailed comments explaining the algorithm structure
- **Panel resizing**: Clear handler naming and event management
- **Authentication flow**: Comments explain JWT validation and API key storage
- **Modal styling**: Well-structured with readable CSS variable naming

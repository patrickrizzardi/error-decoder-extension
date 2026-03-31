# Cleanup Report

**Analyzed**: 2025-03-30
**Scope**: Chrome extension codebase (packages/extension)
**Dead Code Found**: 9 instances

---

## Findings by Category

### Unused Exports (High Confidence)

#### 1. `togglePanel()` - Never Imported
- **File**: `packages/extension/src/content/panel.ts:44`
- **Evidence**: Exported function, but grep search shows only defined in this file, never imported anywhere in codebase
- **Why**: Likely vestigial from earlier architecture where this was intended for external control. Now only `showPanel()` and `hidePanel()` are used by content/index.ts
- **Severity**: HIGH
- **Recommendation**: Safe to remove. No external callers.

### Unused Functions (High Confidence)

#### 2. `decodeBatch()` - Defined but Never Called
- **File**: `packages/extension/src/sidepanel/index.ts:386-428`
- **Evidence**: Function declared at line 386 with full implementation, but never invoked in this file or any other file in codebase. Grep shows single match (definition only)
- **Why**: Likely planned feature for batch processing multiple errors at once. Implementation exists but UI never triggers it.
- **Severity**: MEDIUM
- **Lines**: 386-428
- **Recommendation**: Either wire up UI button (if feature desired) or remove. Currently dead weight.

#### 3. `basicMarkdownToHtml()` - Defined but Never Called
- **File**: `packages/extension/src/sidepanel/index.ts:631-655`
- **Evidence**: Function declared but unused. The codebase uses `marked.parse()` at line 608 instead. This is a manual fallback never invoked.
- **Why**: Fallback markdown parser that became obsolete when `marked` library was added (recent commit: "refactor(sidepanel): use markdown rendering")
- **Severity**: LOW
- **Lines**: 631-655
- **Recommendation**: Remove. Dead fallback code. `marked` library is the active implementation.

### Orphaned HTML Elements (No JavaScript Wiring)

#### 4. `#upgrade-link` - Element Exists, Never Referenced
- **File**: `packages/extension/src/popup/index.html:69`
- **Evidence**: `<a id="upgrade-link" href="#" class="hidden">` exists in HTML, but no JavaScript event listener or state management touches it. Always hidden (`class="hidden"`)
- **Why**: Upgrade logic implemented elsewhere (in sidepanel for Pro plan display). Popup never triggers upgrade flow.
- **Severity**: LOW
- **Recommendation**: Remove unused element. Not user-visible.

#### 5. `#manage-sub` Button - Element Exists, No Event Handler
- **File**: `packages/extension/src/options/index.html:92`
- **Evidence**: `<button id="manage-sub">Manage Subscription</button>` defined in HTML, but `packages/extension/src/options/index.ts` has no event listener for this button. Zero references in JavaScript.
- **Why**: Stripe Customer Portal integration mentioned in product spec but not yet implemented in extension.
- **Severity**: MEDIUM
- **Recommendation**: Either implement the handler or remove the button. Currently a non-functional placeholder.

#### 6. Result Overlay Elements - HTML Only, No Logic
- **File**: `packages/extension/src/sidepanel/index.html:83-95`
- **Evidence**: Full `#result-overlay` div with `#result-title` and `#back-from-result` button defined in HTML, but zero JavaScript references. These IDs appear nowhere in `packages/extension/src/sidepanel/index.ts`
- **Why**: Leftover from earlier UI design. Current architecture renders results inline within tabs, not in overlay.
- **Severity**: LOW
- **Recommendation**: Remove unused overlay markup. Architecture shows results embedded in tabs (see lines 56, 270, 464 in index.ts where results render to inline elements)

### Console Logging Left in Production Code

#### 7. Console.warn Intercept
- **File**: `packages/extension/src/capture/main-world.ts:37-44`
- **Evidence**: Lines 37-44 intercept `console.warn` to capture warnings as errors via custom event dispatch
- **Why**: Valid instrumentation, not dead code. Intentional warning capture for sidebar display
- **Severity**: NOT AN ISSUE (intentional code)
- **Note**: This is not debug code; it's core error capture functionality

### Dead Code Paths (Low Risk)

#### 8. Duplicate API Base Resolution
- **Files**: Multiple locations
- **Evidence**:
  - `packages/extension/src/sidepanel/index.ts:278, 361, 398, 574` (4x)
  - `packages/extension/src/devtools/panel.ts:115` (1x)
  - `packages/extension/src/shared/api.ts:13-14` (shared)
- **Pattern**: Every file repeats: `typeof __API_BASE__ !== "undefined" ? __API_BASE__ : "http://localhost:4001/api"`
- **Why**: Build-time define set in build.ts. Not dead code, but boilerplate could be centralized.
- **Severity**: LOW (code duplication, not dead code)
- **Recommendation**: Extract to shared util if pattern becomes problematic. Current instances: 5 direct + 1 shared.

### Unused Variables (Low Confidence)

#### 9. `char-limit` Element Never Updated
- **File**: `packages/extension/src/popup/index.html:21`
- **Evidence**: HTML element `<span id="char-limit">1,000</span>` exists, but `packages/extension/src/popup/index.ts` only updates `#char-current` at line 43. Never sets `#char-limit`.
- **Why**: Fixed constant "1,000" in HTML. JavaScript only tracks current count.
- **Severity**: LOW
- **Impact**: Non-functional detail. User sees current count update but limit is static text.
- **Recommendation**: Either remove or implement limit checking logic to validate textarea size.

---

## Priority Cleanup

### Must Clean (High Confidence)
1. **Remove `togglePanel()` export** — packages/extension/src/content/panel.ts:44
   - Evidence: Never imported, exported but unreferenced
   - Safe to remove: No external consumers

2. **Remove `decodeBatch()` function** — packages/extension/src/sidepanel/index.ts:386-428
   - Evidence: Defined but never called
   - Wiring needed first if feature is desired (not currently triggered by UI)

3. **Remove `basicMarkdownToHtml()` fallback** — packages/extension/src/sidepanel/index.ts:631-655
   - Evidence: Unused after marked library adoption
   - Safe to remove: marked.parse() is active implementation

### Verify First (Medium Confidence)
1. **`#manage-sub` button** — packages/extension/src/options/index.html:92
   - Verify: Is Stripe portal integration planned for this sprint?
   - If not: Remove placeholder button
   - If yes: Implement handler referencing portal API

2. **Result overlay markup** — packages/extension/src/sidepanel/index.html:83-95
   - Verify: Was this replaced by inline tab rendering or is it fallback?
   - If replaced: Remove orphaned markup
   - If fallback: Add event handlers for #back-from-result button

### Low Priority (Cosmetic)
1. Remove `#upgrade-link` from popup (always hidden, never used)
2. Remove `#char-limit` span or implement validation logic

---

## Summary Statistics

| Category | Count | Severity |
|----------|-------|----------|
| Unused Exports | 1 | HIGH |
| Unused Functions | 2 | MEDIUM/LOW |
| Orphaned Elements | 3 | LOW |
| Duplicate Patterns | 5+ instances | LOW |
| **Total Cleanup Items** | **9** | Mixed |

**Estimated cleanup time**: 5-10 minutes (removals + verification)

**No architectural issues detected.** Extension is well-structured. Cleanup is primarily removing unused features from refactoring and UI design iterations.

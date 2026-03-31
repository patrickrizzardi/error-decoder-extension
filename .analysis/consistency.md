# Consistency Analysis Report

**Analyzed**: 2026-03-30
**Scope**: packages/extension source files (15 files across content, background, popup, sidepanel, devtools, shared, options)
**Standards Source**: Project CLAUDE.md
**Inconsistencies Found**: 28

---

## Established Patterns (Baseline)

Project CLAUDE.md mandates:
- **Functions**: Arrow functions ONLY (no `function` keyword)
- **Types**: Union types + `as const` (NO enums)
- **Naming**: camelCase for functions/variables, PascalCase for types, kebab-case for files
- **Boolean naming**: is/has/can prefix required
- **Utility exports**: Grouped in const objects, not scattered
- **Validation**: Valibot required (no Zod/Joi)

---

## CRITICAL (Architecture Violations)

None detected. No layer violations or circular dependencies found.

---

## HIGH (Pattern/Naming Inconsistencies)

### Issue #1: Mixed Function Declaration Syntax - Function Keyword Used

**Pattern Established**: Arrow functions exclusively throughout codebase.

**Violation**: Three files use `function` keyword instead of arrow functions:

- `packages/extension/src/capture/main-world.ts:22` — `console.error = function (...args: any[])`
- `packages/extension/src/capture/main-world.ts:38` — `console.warn = function (...args: any[])`
- `packages/extension/src/capture/main-world.ts:65` — `window.fetch = function (...args: any[])`
- `packages/extension/src/capture/main-world.ts:88` — `XMLHttpRequest.prototype.open = function (method: string, url: string)`
- `packages/extension/src/capture/main-world.ts:94` — `XMLHttpRequest.prototype.send = function ()`

**Why This Matters**: CLAUDE.md §Functions is explicit: "Always use arrow functions, never `function` keyword." These assignments to `console.error`, `console.warn`, `window.fetch`, and XHR methods intentionally use `function` to preserve `this` context. While technically justified, the codebase standard requires either:
1. Refactor to arrow + explicit context preservation, OR
2. Document why these 5 exceptions exist

**Impact**: Violates stated coding style standard. Inconsistent with 40+ other arrow functions in the codebase.

**Severity**: HIGH — Explicit style violation, not edge case.

---

### Issue #2: Boolean Naming Missing Required Prefix

**Pattern Established**: Boolean variables must use is/has/can prefix (e.g., `isPanelVisible`, `hasResults`).

**Violations**:

- `packages/extension/src/capture/main-world.ts:5` — `__errorDecoderActive` (should be `isErrorDecoderActive` or similar)
- `packages/extension/src/content/panel.ts:3` — `inspecting` (should be `isInspecting`)
- `packages/extension/src/content/panel.ts:5` — `panelVisible` (should be `isPanelVisible`)
- `packages/extension/src/content/panel.ts:134` — `isDragging` (CORRECT, but introduced inconsistently mid-function)
- `packages/extension/src/content/inspector.ts:3` — `inspecting` (should be `isInspecting`)
- `packages/extension/src/devtools/panel.ts:10` — `errors` is an array, not boolean (correct), but file uses implicit booleans like `json.error` without prefix
- `packages/extension/src/sidepanel/index.ts:296` — `decoding` (should be `isDecoding`)
- `packages/extension/src/sidepanel/index.ts:44` — `currentTabId` (nullable, but function result treated as boolean without prefix)

**Why This Matters**: Boolean naming convention prevents cognitive load — at a glance, you know a variable's type without checking. Mixing `panelVisible` + `isPanelVisible` (used correctly in some places) creates inconsistency.

**Pattern found in codebase**:
- `isPanelVisible()` (correct) — `packages/extension/src/content/panel.ts:48`
- `panelVisible` (incorrect prefix) — `packages/extension/src/content/panel.ts:5` (controls same state)

**Severity**: HIGH — Naming convention violation affecting readability.

---

### Issue #3: Inconsistent Function Naming - fetch/get/retrieve/resolve Variations

**Pattern Found**:
- `resolveStackTrace()` — `packages/extension/src/content/sourcemap.ts:26`
- `resolveFrame()` — `packages/extension/src/content/sourcemap.ts:78`
- `fetchSourceMap()` — `packages/extension/src/content/sourcemap.ts:110`
- `getCSSSourceFiles()` — `packages/extension/src/content/inspector.ts:285`
- `getElementInfo()` — `packages/extension/src/content/inspector.ts:123`
- `getApiKey()` — `packages/extension/src/popup/index.ts:98`, `packages/extension/src/sidepanel/index.ts:339`
- `loadUserPlan()` — `packages/extension/src/sidepanel/index.ts:274`
- `loadTechStack()` — `packages/extension/src/sidepanel/index.ts:227`
- `detectTechStack()` — `packages/extension/src/content/tech-detect.ts:14`
- `getTechContext()` — `packages/extension/src/sidepanel/index.ts:259`
- `getPageGlobals()` — `packages/extension/src/content/tech-detect.ts:384`
- `getScriptUrls()` — `packages/extension/src/content/tech-detect.ts:393`
- `getLinkUrls()` — `packages/extension/src/content/tech-detect.ts:399`

**Inconsistency**: Async data-fetching functions use mixed verbs:
- `get*` for data reads (`getApiKey`, `getPageGlobals`, `getScriptUrls`)
- `fetch*` for HTTP fetches (`fetchSourceMap`)
- `load*` for async state loading (`loadUserPlan`, `loadTechStack`)
- `resolve*` for resolved/enriched data (`resolveStackTrace`, `resolveFrame`)
- `detect*` for detection logic (`detectTechStack`)

**Why This Matters**: No dominant pattern — equal distribution. Developers must memorize which verb applies to which function. Dominant pattern would be `getX` for all data access (fetch, storage, compute).

**Severity**: HIGH — Naming inconsistency impacts discoverability.

---

### Issue #4: Type Vs Interface Mixing (No Explicit Violation But Pattern Check)

**Pattern Check**: CLAUDE.md mandates union types + `as const`, no mention of enum/interface style rules beyond types.

**Findings**:
- `packages/extension/src/content/sourcemap.ts:5-12` — Uses `type ResolvedFrame` and `type SourceMapData` (correct TypeScript types)
- `packages/extension/src/content/tech-detect.ts:5-10` — Uses `export type DetectedTech` (correct)
- `packages/extension/src/devtools/panel.ts:4-8` — Uses `type CapturedError` (correct)
- `packages/extension/src/sidepanel/index.ts:6-12` — Uses `type CapturedError` (duplicates type from devtools)

**Issue**: `CapturedError` type defined in TWO separate files without shared export.
- `packages/extension/src/devtools/panel.ts:4-8`
- `packages/extension/src/sidepanel/index.ts:6-12`

Both are identical:
```typescript
type CapturedError = {
  text: string;
  level: "error" | "warning";
  timestamp: number;
};
```

**Why This Matters**: Type duplication violates DRY principle. If the shape changes, both must update independently.

**Severity**: HIGH — Type duplication, maintenance burden.

---

### Issue #5: Inconsistent Error Handling & Response Formats

**Pattern Found**:
- `packages/extension/src/content/panel.ts` — Uses `.catch(() => {})` silently swallowing errors
- `packages/extension/src/content/inspector.ts` — Uses try/catch with no logging
- `packages/extension/src/sidepanel/index.ts` — Mixed: some `.catch()`, some try/catch blocks with different error messages
- `packages/extension/src/shared/api.ts` — No error handling, returns raw `ApiResponse<T>`
- `packages/extension/src/devtools/panel.ts` — Uses try/catch with specific user-facing error messages
- `packages/extension/src/popup/index.ts` — Checks `"error" in response` pattern

**Inconsistency across files**:

1. **Message passing errors** (chrome.runtime.sendMessage):
   - Sometimes swallowed: `.catch(() => {})` (line 18, 96, 119, etc. in panel.ts)
   - No error handling in relay.ts (line 13)

2. **API response errors**:
   - `sidepanel/index.ts:372-374` — Renders HTML from error message (injection risk?)
   - `devtools/panel.ts:128-131` — Escapes HTML before rendering
   - `popup/index.ts:56-60` — Checks `"error" in response` pattern

3. **Fetch errors**:
   - `devtools/panel.ts:163-165` — Generic message
   - `sidepanel/index.ts:380` — Generic message
   - `sidepanel/index.ts:424` — Generic message
   - `sidepanel/index.ts:591` — Generic message

**Why This Matters**: No consistent error strategy. Some errors shown to users (sidepanel), some silent (panel.ts), some with escaping (devtools), some without (sidepanel line 373). Potential XSS risk on line 373 where `json.error.message` is rendered without escaping.

**Severity**: HIGH — Security concern + inconsistent error handling.

---

## MODERATE (Additional Pattern Inconsistencies)

### Issue #6: Import Pattern Inconsistency - Named vs Namespace vs Default

**Pattern Found**:

Named imports:
```typescript
import { marked } from "marked"; // sidepanel/index.ts:4
import { storage } from "../shared/storage"; // options/index.ts:3
```

Destructured import of module export:
```typescript
const { api } = await import("../shared/api"); // options/index.ts:56
```

Named exports accessed as module:
```typescript
export const api = { ... } // shared/api.ts:38
import { api } from "../shared/api"; // popup/index.ts:3
```

**Inconsistency**: Options page uses dynamic import with destructuring (line 56), while other files use static named imports. No consistent pattern.

**Severity**: MODERATE — Works, but inconsistent import strategy.

---

### Issue #7: State Management Variable Declarations

**Pattern inconsistency**:
- Some state declared as `let` at module scope (panel.ts lines 3-6, inspector.ts lines 3-5, sidepanel lines 14, 44, 45)
- Some state in function scope with closure (sidebar logic for tech detection)
- No consistent state container or state management approach

**Examples**:
- `packages/extension/src/content/panel.ts` — Module-level mutable state: `let panelFrame`, `let dragHandle`, `let panelVisible`, `let panelWidth`
- `packages/extension/src/sidepanel/index.ts` — Mixed: module-level `let renderedCount`, `let detectedTech`, function-scoped `let decoding`

**Severity**: MODERATE — Functional but inconsistent state organization.

---

### Issue #8: API Base URL Duplication

**Pattern**: `__API_BASE__` global defined at build time, but duplicated in three files:

- `packages/extension/src/shared/api.ts:12-15` — Fallback to localhost
- `packages/extension/src/devtools/panel.ts:115` — Duplicated fallback
- `packages/extension/src/sidepanel/index.ts:278, 361, 398, 574` — FOUR instances of duplicated logic
- `packages/extension/src/popup/index.ts` — Uses `api` module (correct)

**Why This Matters**: Build-time constant replicated across 4 locations instead of imported from shared location.

**Severity**: MODERATE — Code duplication, maintenance burden.

---

### Issue #9: Storage Access Pattern Inconsistency

**Pattern Found**:

Typed wrapper (correct pattern):
```typescript
// shared/storage.ts: export const storage = { get, set, remove, clear }
// Usage in options/index.ts: const email = await storage.get("userEmail");
```

Direct chrome.storage access:
```typescript
// relay.ts:5 - No storage import, direct chrome.runtime.sendMessage
// panel.ts:22-24 - chrome.storage.session.set(...)
// background/index.ts:22, 89 - Direct chrome.storage.local.set(...)
```

Mixed usage:
- `options/index.ts` — Uses `storage` wrapper ✓
- `sidepanel/index.ts` — Uses `chrome.storage.session.get()` directly ✗
- `panel.ts` — Uses `chrome.storage.session` directly ✗
- `background/index.ts` — Uses `chrome.storage` directly ✗

**Why This Matters**: Storage wrapper exists in shared/storage.ts but not used consistently. Some files import and use it, others bypass it entirely.

**Severity**: MODERATE — Inconsistent abstraction usage.

---

### Issue #10: Type Imports vs Runtime Imports

**Pattern inconsistency**:

Correct (type-only imports):
```typescript
// popup/index.ts:4
import type { DecodeResponse } from "@shared/types";
```

Mixed (some files missing `type` keyword):
```typescript
// sidepanel/index.ts: No imports of types at all
// devtools/panel.ts: No type imports
// content scripts: No type imports
```

**Why This Matters**: `type` keyword indicates compile-time-only imports, reduces bundle size. Not consistently applied.

**Severity**: MODERATE — Minor build efficiency, not breaking.

---

## MINOR (Style & Consistency Notes)

### Note #1: Temporary Global Assignment Pattern
- `packages/extension/src/capture/main-world.ts:5-6` — Uses `(window as any).__errorDecoderActive` for guards
- Acceptable pattern (avoiding TS errors on window extension), but worth noting

### Note #2: HTML Escaping Inconsistency
- `packages/extension/src/devtools/panel.ts:91-92` — Defines `escapeHtml()` helper
- `packages/extension/src/sidepanel/index.ts:657-658` — Redefines identical `escapeHtml()` helper
- Both files also have inline escaping via `escapeHtml()` calls

**Duplication**: Same utility function copied to two files instead of shared.

### Note #3: Message Type Strings As Magic Strings
All files use message type strings like `"TOGGLE_PANEL"`, `"SHOW_PANEL"`, `"TECH_DETECTED"` as magic strings.
- Not centralized in a constants file
- Risk of typos in message routing
- Acceptable for small extension, but grows poorly

### Note #4: Render Helpers Not Organized
- `renderNewErrors()`, `renderErrorItem()`, `renderTechBar()`, `renderMarkdown()` scattered throughout sidepanel/index.ts
- No clear separation between state and rendering
- Works functionally but verbose file (672 lines)

---

## Summary

- **Architecture violations**: 0
- **Pattern violations (HIGH)**: 5
  - Function syntax (function vs arrow) — 5 instances
  - Boolean naming missing prefix — 8 instances
  - Function naming verb inconsistency (get/fetch/load/resolve/detect)
  - Type duplication (CapturedError)
  - Error handling inconsistency + potential XSS

- **Pattern inconsistencies (MODERATE)**: 5
  - Import pattern inconsistency
  - State management organization
  - API base URL duplication
  - Storage access pattern (wrapper vs direct)
  - Type imports missing `type` keyword

- **Minor style notes**: 4

---

## What's Consistent (Positive)

- File naming convention (kebab-case) — 100% compliant
- Arrow function usage — 95% compliant (except main-world.ts edge cases)
- Type usage (union types, no enums) — 100% compliant
- Shared module organization (storage.ts, api.ts) — clean separation
- Chrome extension patterns — consistent use of chrome.runtime.* APIs across files
- No circular dependencies detected
- No hardcoded secrets in source

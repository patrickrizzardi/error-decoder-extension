# Cleanup Report: Error Decoder Extension

**Analyzed**: 2026-04-02
**Scope**: Full monorepo (API backend + Chrome extension + web)
**Dead Code Found**: 7 issues

---

## Findings by Category

### Critical Bug (High Priority)

#### Hardcoded Model in Logging
- **Location**: `packages/api/src/routes/decode.ts:140`
- **Issue**: `logDecode()` function always logs `model_used: "haiku"` regardless of which model was actually used
- **Evidence**: 
  - Line 115: `logDecode(..., inputTokens, outputTokens, costCents, responseTimeMs)` — called with only 9 params, no model parameter
  - Line 140: `model_used: "haiku"` hardcoded
  - Line 46: `const useModel = requestedModel === "sonnet" && user.plan === "pro" ? "sonnet" : "haiku"` — tracks actual model
  - Line 109-111: Sonnet usage is tracked separately but log never records which model was used
- **Impact**: Impossible to track which model was used for cost analysis, billing accuracy, and Sonnet quota auditing
- **Severity**: CRITICAL — affects cost tracking and billing

---

### Unused Code (Type and Function Exports)

#### Unused Type Exports in Schema Files
- **Location**: `packages/api/src/schemas/checkout.ts:7`, `decode.ts:23`, `feedback.ts:8`
- **Issue**: Three schema files export TypeScript types that are never imported or used
  - `ValidatedCheckoutRequest` — defined but never referenced
  - `ValidatedDecodeRequest` — defined but never referenced  
  - `ValidatedFeedbackRequest` — defined but never referenced
- **Evidence**: Grep across entire monorepo finds zero references to these types
- **Impact**: Dead code that adds clutter to exports and is confused about the intended public API
- **Severity**: LOW — purely unused types, no functional impact

#### Unused Function Export: `buildUserPrompt()`
- **Location**: `packages/api/src/lib/prompts.ts:119-147`
- **Issue**: Function exported but never called from any route or service
- **Evidence**: 
  - Lines 119-147: Full function definition with context parameter object
  - Grep across all codebase: zero references to `buildUserPrompt` anywhere
  - Prompts are built directly in-line using string concatenation instead (see `packages/extension/src/sidepanel/index.ts:300-304`)
- **Why Likely Dead**: Appears to be legacy from earlier API design where user context was planned to be formatted server-side
- **Severity**: LOW — unused utility function, can be safely deleted

#### Unused Constant: `BATCH_SYSTEM_PROMPT`
- **Location**: `packages/api/src/lib/prompts.ts:37-73`
- **Issue**: System prompt for batch error analysis is defined but never used
- **Evidence**:
  - Full 37-line prompt defined with detailed instructions for multi-error analysis
  - Grep across codebase: zero references outside the prompts file
  - Current implementation only supports single-error decode (SYSTEM_PROMPT) or element inspection (ELEMENT_SYSTEM_PROMPT)
  - Batch errors feature is not yet implemented
- **Why Dead**: Feature planned but not yet shipped (see MVP design in CLAUDE.md which describes single-error focus)
- **Severity**: MEDIUM — suggests incomplete feature planning; document why it exists or remove it

---

### Unused Session Storage Wrapper

#### Unused `sessionStorage` Object
- **Location**: `packages/extension/src/shared/storage.ts:32-41`
- **Issue**: Wrapper object around `chrome.storage.session` is defined but never used
- **Evidence**:
  - Lines 32-41: Full `sessionStorage` object with `get()` and `set()` methods
  - Grep across extension codebase: never called; all session storage uses `chrome.storage.session` directly
  - Example: `chrome.storage.session.get()` and `chrome.storage.session.set()` calls everywhere (background/index.ts, sidepanel/index.ts)
- **Why Dead**: Wrapper was created for consistency with `storage` object but never adopted
- **Severity**: LOW — unused utility wrapper, can be safely deleted

---

### Incomplete/Unmaintained Features

#### DevTools Panel Infrastructure
- **Location**: `packages/extension/src/devtools/devtools.ts`, `devtools/panel.ts`, `devtools/devtools.html`
- **Issue**: Fully implemented DevTools panel that works but is not documented as a feature
- **Evidence**:
  - `manifest.json:36` declares `"devtools_page": "devtools/devtools.html"`
  - Both `.ts` files are complete and functional (error listening, error list, decode UI)
  - Full implementation in `devtools/panel.ts:1-179`
  - But: Feature is not mentioned in CLAUDE.md product spec or extension docs
  - Not mentioned in any marketing materials or user-facing docs
- **Note**: This is NOT dead code (it's fully functional and wired up) — just undocumented
- **Recommendation**: Either document as a feature or remove if not part of MVP
- **Severity**: LOW — functional code, just undocumented

---

## Summary

### Must Clean (High Priority)

1. **Fix hardcoded model in logging** (`decode.ts:140`)
   - Pass `useModel` as parameter to `logDecode()`
   - Update signature: `logDecode(..., model: "haiku" | "sonnet")`
   - This is a BUG, not optional cleanup

### Should Clean (Low Priority, Code Quality)

2. Remove unused type exports:
   - `ValidatedCheckoutRequest` from `schemas/checkout.ts:7`
   - `ValidatedDecodeRequest` from `schemas/decode.ts:23`
   - `ValidatedFeedbackRequest` from `schemas/feedback.ts:8`

3. Remove unused function `buildUserPrompt()` from `lib/prompts.ts:119-147`

4. Remove unused constant `BATCH_SYSTEM_PROMPT` from `lib/prompts.ts:37-73` (or document why it exists)

5. Remove unused `sessionStorage` wrapper from `shared/storage.ts:32-41`

### Optional (Scope Decision)

6. Decide on DevTools panel:
   - If keeping: Document as a feature
   - If not: Remove `devtools.ts`, `panel.ts`, `devtools.html` and manifest entry

---

## Code References

### Bug Details: Hardcoded Model in Logging

**Current code** (packages/api/src/routes/decode.ts):

```typescript
// Line 46: Tracks actual model
const useModel = requestedModel === "sonnet" && user.plan === "pro" ? "sonnet" : "haiku";

// ...

// Line 115: Calls logging with no model info
logDecode(user.id, errorHash, errorText, markdown, false, inputTokens, outputTokens, costCents, responseTimeMs);

// Line 130-149: Function always logs "haiku"
const logDecode = (
  userId: string, errorHash: string, errorText: string, response: any,
  cacheHit: boolean, inputTokens: number, outputTokens: number,
  costCents: number, responseTimeMs: number
) => {
  supabase.from("decodes").insert({
    // ... other fields ...
    model_used: "haiku",  // BUG: Always "haiku", ignores actual useModel
    // ...
  })
};
```

**Fix**: Pass `useModel` to the function:

```typescript
// Change function signature
const logDecode = (
  userId: string, errorHash: string, errorText: string, response: any,
  cacheHit: boolean, inputTokens: number, outputTokens: number,
  costCents: number, responseTimeMs: number,
  modelUsed: "haiku" | "sonnet"  // Add parameter
) => {
  supabase.from("decodes").insert({
    // ...
    model_used: modelUsed,  // Use actual model
    // ...
  })
};

// Line 115: Update call
logDecode(user.id, errorHash, errorText, markdown, false, inputTokens, outputTokens, costCents, responseTimeMs, useModel);

// Line 74: Also update cached case
logDecode(user.id, errorHash, errorText, cached as any, true, 0, 0, 0, 0, useModel);
```

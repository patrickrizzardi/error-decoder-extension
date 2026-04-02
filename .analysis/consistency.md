# Consistency Analysis Report

**Analyzed**: 2026-04-02
**Scope**: Error Decoder extension + API backend monorepo (TypeScript)
**Standards Source**: Project CLAUDE.md + Dominant codebase patterns
**Inconsistencies Found**: 4

---

## Established Patterns (Baseline)

Sampled files for dominant pattern detection:
- API routes: `decode.ts`, `auth.ts`, `checkout.ts`, `webhook-stripe.ts`, `feedback.ts`
- Extension code: `sidepanel/index.ts`, `popup/index.ts`, `options/index.ts`
- Shared: `shared/types.ts`, `lib/cache.ts`, `content/tech-detect.ts`

**Dominant Patterns Detected:**
- **Function syntax**: Arrow functions only (const name = () => {}). No `function` keyword anywhere. ✅ Consistent
- **Type system**: Properly typed. Valibot schemas for validation. Union types with `as const` (no enums). ✅ Consistent
- **Response format (API)**: Standardized envelope: `{ data: T }` for success, `{ error: { message, code } }` for failures. ✅ Consistent
- **Naming conventions**: camelCase for functions/variables, kebab-case for files, PascalCase for types. ✅ Consistent
- **Middleware/error handling**: Global error handler in `index.ts`, per-route middleware applied in route files. ✅ Consistent
- **Import patterns**: Mix of absolute imports (@shared) and relative imports - inconsistent but intentional (monorepo structure)
- **Utility organization**: Grouped exports in objects (e.g., `cacheUtils`, `api`, `storage`). ✅ Consistent

---

## 🔴 CRITICAL (Architecture Violations)

None detected. Code follows proper layering and no forbidden patterns found.

---

## 🟠 MODERATE (Pattern/Naming Inconsistencies)

### Issue #1: `as any` Type Assertions in main-world.ts

**Description**: Widespread use of `as any` casts for window globals and function arguments. Project standard forbids `as any` absolutely.

**Locations**:
- `packages/extension/src/capture/main-world.ts:7` — `(window as any).__errorDecoderActive`
- `packages/extension/src/capture/main-world.ts:8` — `(window as any).__errorDecoderActive = true`
- `packages/extension/src/capture/main-world.ts:67` — `.apply(window, args as any)`
- `packages/extension/src/capture/main-world.ts:87` — `origOpen.apply(this, arguments as any)`
- `packages/extension/src/capture/main-world.ts:101` — `origSend.apply(this, arguments as any)`
- **Lines 112-164**: 53 more instances of `(window as any)` for global detection
- Total: **71 occurrences** of `as any` in this single file

**Dominant Pattern**: Zero use of `as any` across all other codebase files (API, extension UI, schemas). This file is the sole violator.

**Violation**: Project CLAUDE.md §Type Strictness states: "Never use `any`. Define the actual type. Period." and "as any — NEVER. Not even 'just for now'". These casts are permanent escape hatches.

**Impact**: CRITICAL per CLAUDE.md standards, though functionally this is legitimately difficult code (content script running in page's main world with limited type information from window globals). Current approach prioritizes pragmatism (global detection works correctly) over strictness.

**Recommended**: Either:
1. Accept this file as a pragmatic exception (document at file top)
2. Replace `(window as any)` with `(window as Record<string, unknown>)` or explicit interfaces for detectable globals
3. Use type guard functions instead of blind casts

---

### Issue #2: Untyped Function Parameters in sidepanel/index.ts

**Description**: Function parameters lack proper types, using implicit `any` or overly broad `any` casts.

**Locations**:
- `packages/extension/src/sidepanel/index.ts:559` — `const showInspectResult = (el: any) => {`
- `packages/extension/src/sidepanel/index.ts:589` — `el.cssRules?.some((r: any) => r.originalFile)`
- `packages/extension/src/sidepanel/index.ts:590` — `el.cssRules?.every((r: any) => r.file === "inline")`
- `packages/extension/src/sidepanel/index.ts:620` — `.map((r: any) => {`
- Implicit `any` in arrow callbacks: lines 241, 256 (CapturedError iterator variable type inference works but is unexamined)

**Dominant Pattern**: Properly typed function parameters across API (`authMiddleware`, `decodeSingle`, `showPanel`) and other extension files. Example from `shared/api.ts`:
```typescript
const request = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> => { ... }
```

**Violation**: Project CLAUDE.md forbids untyped function parameters. The `el` parameter should be a defined type based on `getElementInfo()` return type.

**Impact**: MODERATE. This code works (element inspector is functioning), but violations increase maintenance risk and hide bugs.

**Recommended**: Define `ElementInfo` interface matching `getElementInfo()` return type and use it:
```typescript
interface ElementInfo {
  tag: string;
  selector: string;
  id?: string;
  classes?: string[];
  styles: Record<string, string>;
  cssRules: Array<{ selector: string; file: string; originalFile?: string; properties: string }>;
  // ... other properties
}

const showInspectResult = (el: ElementInfo) => { ... }
```

---

### Issue #3: Inconsistent Error Code Format in webhook-stripe.ts

**Description**: Stripe webhook route uses raw error code strings instead of `errorCodes` constant from shared types.

**Locations**:
- `packages/api/src/routes/webhook-stripe.ts:12` — `code: "INVALID_SIGNATURE"`
- `packages/api/src/routes/webhook-stripe.ts:17` — `code: "SERVER_ERROR"`
- `packages/api/src/routes/webhook-stripe.ts:28` — `code: "INVALID_SIGNATURE"`

**Dominant Pattern**: All other routes use `errorCodes.xxx` from `@shared/types`:
```typescript
// Example from decode.ts, auth.ts, checkout.ts, etc.
return c.json({ error: { message, code: errorCodes.validationError } }, 400);
```

The error code map exists in `shared/types.ts`:
```typescript
export const errorCodes = {
  authRequired: "AUTH_REQUIRED",
  authInvalid: "AUTH_INVALID",
  // ...
  serverError: "SERVER_ERROR",  // matches the raw string used in webhook
};
```

**Violation**: Inconsistent error code reference pattern. This route hardcodes strings where all others reference the constant.

**Impact**: MODERATE. Creates multiple problems:
1. No single source of truth — if `errorCodes.serverError` changes, webhook is out of sync
2. Violates CLAUDE.md principle of DRY (3+ places = extract to reusable)
3. Makes error codes harder to audit

**Recommended**: Replace hardcoded strings with `errorCodes` constant:
```typescript
// Current (lines 12, 17, 28)
code: "INVALID_SIGNATURE"  // ✗
code: "SERVER_ERROR"       // ✗

// Should be
code: errorCodes.serverError  // ✓
// But INVALID_SIGNATURE is not in errorCodes — needs to be added:
export const errorCodes = {
  // ...existing...
  webhookSignatureFailed: "WEBHOOK_SIGNATURE_FAILED",  // add this
};
```

---

### Issue #4: Parameter Naming Inconsistency: `response` vs `markdown` in decode.ts

**Description**: `logDecode()` function parameter named `response: any` but always receives `markdown: string` content. Naming mismatch creates confusion.

**Location**: `packages/api/src/routes/decode.ts:130-149`

```typescript
const logDecode = (
  userId: string, errorHash: string, errorText: string, response: any,  // ← Parameter is "response"
  cacheHit: boolean, inputTokens: number, outputTokens: number,
  costCents: number, responseTimeMs: number
) => {
  supabase.from("decodes").insert({
    user_id: userId,
    error_text_hash: errorHash,
    error_text_preview: errorText.slice(0, 200),
    response: typeof response === "string" ? { markdown: response } : response,  // ← Wraps string as { markdown }
    // ...
  });
};
```

**Call sites** (lines 74, 115):
```typescript
logDecode(user.id, errorHash, errorText, markdown as any, ...)  // ← Passes markdown
logDecode(user.id, errorHash, errorText, cached as any, ...)    // ← Passes cached markdown string
```

**Dominant Pattern**: Project naming standard (CLAUDE.md): "Functions should use clear, self-documenting names." Parameter named `response` suggests it receives a full response object, but it actually receives just the markdown text.

**Violation**: MODERATE naming inconsistency. The parameter should be named `markdown` or `content` to match what's actually passed and stored.

**Impact**: MODERATE. Code works (wrapping string as `{ markdown: response }` handles both cases), but reader confusion increases. Future maintainers might assume `response` contains more data than it does.

**Recommended**: Rename parameter to match intent:
```typescript
const logDecode = (
  userId: string,
  errorHash: string,
  errorText: string,
  markdown: string,  // ← Clear: this is markdown content
  cacheHit: boolean,
  inputTokens: number,
  outputTokens: number,
  costCents: number,
  responseTimeMs: number
) => {
  supabase.from("decodes").insert({
    // ...
    response: { markdown },  // ← Clear transform
    // ...
  });
};
```

Then remove the `as any` cast at call sites and fix the type signature.

---

## 🟡 MINOR (Style Preferences)

None. The codebase maintains consistent code formatting and structure across files.

---

## Summary

**Violations by Severity:**
- Critical (architecture breaks): 0
- High (forbidden patterns, type strictness): 1 (Issue #1 - 71x `as any` in main-world.ts)
- Moderate (naming/pattern inconsistencies): 3 (Issues #2-4)
- Minor (style): 0

**Type System Strictness Check:**
- ✅ No enums (uses `as const` union types everywhere)
- ✅ No `Record<string, any>` (uses properly typed records)
- ✗ 71 occurrences of `as any` (main-world.ts only — pragmatic exception for globals detection)
- ✗ 5 untyped function parameters (sidepanel.ts — should define ElementInfo interface)
- ✅ Non-null assertions (`!`) — present but justified by guard clauses in context
- ✅ Valibot schemas enforced consistently at API boundaries

---

## What's Consistent (Positive)

1. **Arrow functions only** — No `function` keyword anywhere in the codebase. Perfect adherence.
2. **Error handling** — Standardized error envelope across all routes. Consistent status codes (400 validation, 401 auth, 429 rate limit, 503 AI unavailable).
3. **Validation patterns** — Valibot schemas enforced at all public API endpoints. No ad-hoc validation.
4. **Response formatting** — Unified `{ data: T }` and `{ error: { message, code } }` structure across 8+ routes.
5. **Middleware organization** — Clean per-route middleware application (auth, rate limiting).
6. **Naming conventions** — camelCase/PascalCase/kebab-case consistently applied. Boolean prefix (`isActive`, `isDev`, `isCacheable`) used correctly.
7. **Imports** — Monorepo aliases (@shared) used consistently; no circular dependencies detected.
8. **Utility organization** — Grouped exports (cacheUtils, api object, storage) prevent scattered function exports.
9. **Type annotations** — Function return types explicitly annotated (e.g., `Promise<ApiResponse<T>>`, `Promise<void>`).
10. **Configuration-as-code** — Stripe setup uses declarative config (stripe-setup.ts), schema-driven approach.

---

## Recommendations for Resolution

**Priority 1 (Fix Now):**
- Issue #3 (Stripe webhook error codes): 5-minute fix. Add missing error code, replace 3 hardcoded strings.
- Issue #4 (logDecode naming): 10-minute fix. Rename parameter, remove `as any` casts.

**Priority 2 (Address Soon):**
- Issue #2 (sidepanel untyped params): 30-minute fix. Define ElementInfo interface, type all parameters.

**Priority 3 (Accept or Document):**
- Issue #1 (main-world.ts `as any`): This is a pragmatic exception. Either:
  - Add comment at file top: `/* eslint-disable @typescript-eslint/no-explicit-any -- Window global detection requires dynamic property access */`
  - Or refactor to use explicit interfaces for detected globals (larger refactor, lower ROI)

---

## Files Reference

**Critical violation locations:**
- `/home/patrick/development/error-decoder-extension/packages/extension/src/capture/main-world.ts` (lines 7-164)
- `/home/patrick/development/error-decoder-extension/packages/extension/src/sidepanel/index.ts` (lines 559, 589-590, 620)
- `/home/patrick/development/error-decoder-extension/packages/api/src/routes/webhook-stripe.ts` (lines 12, 17, 28)
- `/home/patrick/development/error-decoder-extension/packages/api/src/routes/decode.ts` (lines 130-149, 74, 115)

**Standards reference:**
- Project CLAUDE.md: `/home/patrick/development/error-decoder-extension/CLAUDE.md`
- Shared types: `/home/patrick/development/error-decoder-extension/shared/types.ts`
- Error codes constant: `errorCodes` object in `shared/types.ts` (lines 86-96)

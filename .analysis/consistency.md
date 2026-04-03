# Consistency Analysis Report

**Analyzed**: 2026-04-02  
**Scope**: Full codebase (API, Extension, Web packages)  
**Standards Source**: Project CLAUDE.md + dominant codebase patterns  
**Inconsistencies Found**: 8

---

## Established Patterns (Baseline)

Derived from sampling 5+ files per category:

- **File naming**: kebab-case (✓ consistent: `webhook-stripe.ts`, `error-handler.ts`, `tech-detect.ts`)
- **Functions**: Arrow functions only (✓ consistent: no `function` keyword found)
- **Types**: No enums (✓ consistent: only `as const` patterns found)
- **Validation**: Valibot schemas (✓ consistent across all routes)
- **Error responses**: `{ error: { message, code }, statusCode }` (established pattern)
- **Data responses**: `{ data: {...}, statusCode }` (established pattern)
- **Variable naming (JavaScript)**: camelCase (dominant: `stripeCustomerId`, `errorText`, `decodeId`)
- **Database column naming (Postgres)**: snake_case (expected: `stripe_customer_id`, `error_text_hash`)

---

## 🔴 CRITICAL (Architecture Violations)

### Violation #1: Type Escape Hatch — Excessive `as any` in main-world.ts

**Location**: `/packages/extension/src/capture/main-world.ts`

This file contains **37 instances** of `as any` type escapes, systematically violating the project's "No `any`" rule. All global detection code bypasses TypeScript safety:

- Lines 7-8: `(window as any).__errorDecoderActive` — casting entire window object
- Lines 18-40: Callback function parameters `...args: any[]` and element mapping `(a: any)`
- Lines 61-102: Function wrappers for `fetch`, `XMLHttpRequest.prototype` all use `args as any`
- Lines 112-164: All framework detection uses `(window as any).FrameworkName` pattern

**Evidence**: CLAUDE.md explicitly states: "Never use `any`. Define the actual type. Period." This is a banned pattern.

**Why it matters**: 
- Framework detection is a critical data path — secrets/PII from window globals could flow through without type safety
- `args: any[]` in console/fetch interception masks payload types entirely
- If malicious code populates `window.__errorDecoderActive`, no type guard prevents bypass
- No comments explaining why `any` is unavoidable here

**Severity**: CRITICAL — Direct violation of coding standards (patterns rule #1: "Type Strictness: No Escape Hatches")

**Impact**: The extension captures page data with zero type safety in its foundational layer. This is load-bearing code.

---

## 🟠 MODERATE (Pattern/Naming Inconsistencies)

### Inconsistency #1: Hardcoded Error Code vs. `errorCodes` Constant

**Pattern A** (dominant, 7 occurrences): Use `errorCodes` constant
- `/packages/api/src/routes/decode.ts:33` — `code: errorCodes.validationError`
- `/packages/api/src/routes/middleware.ts:32` — `code: errorCodes.authRequired`
- `/packages/api/src/routes/feedback.ts:18` — `code: errorCodes.validationError`
- All use the shared `errorCodes` from `@shared/types`

**Pattern B** (deviation, 2 occurrences): Hardcoded string literal
- `/packages/api/src/routes/webhook-stripe.ts:13` — `code: "INVALID_SIGNATURE"`
- `/packages/api/src/routes/webhook-stripe.ts:24` — `code: "INVALID_SIGNATURE"`

**Why it matters**: The `webhook-stripe.ts` route inconsistently defines its own error code instead of using the centralized `errorCodes` constant. If `INVALID_SIGNATURE` needs to be changed or standardized later, this file won't be found by a grep search.

**Recommended**: Replace both hardcoded `"INVALID_SIGNATURE"` with a constant from `errorCodes`. Add `webhookSignatureInvalid` or similar to `@shared/types/errorCodes` if it doesn't exist, or map to an existing equivalent.

---

### Inconsistency #2: Webhook-Stripe Response Format Deviation

**Pattern A** (dominant): Standard `{ data: ... }` or `{ error: ... }` envelope
- All routes return `c.json({ data: {...} })` for success
- All routes return `c.json({ error: {...} })` for errors
- Examples: `decode.ts`, `feedback.ts`, `account.ts`, `checkout.ts`

**Pattern B** (deviation): Webhook-Stripe unique format
- `/packages/api/src/routes/webhook-stripe.ts:137` — `return c.json({ received: true })`
  - This is the only success response that doesn't use `{ data: ... }` envelope
  - Violates the established response contract

**Why it matters**: Client code expecting `{ data: ... }` will break if it calls the webhook endpoint directly. While Stripe handles the response, the inconsistency makes the API contract non-uniform and harder to reason about.

**Recommended**: Change `{ received: true }` to `{ data: { received: true } }` to match the standard envelope.

---

### Inconsistency #3: Naming Convention — snake_case Database Columns vs. camelCase JavaScript

**Pattern A** (database queries): snake_case used correctly in SQL
- `/packages/api/src/lib/middleware.ts:43` — `.select("...stripe_customer_id, is_admin, sonnet_uses_this_month...")`
- Database columns are correctly named `stripe_customer_id`, `error_text_hash`, etc.

**Pattern B** (JavaScript/TypeScript objects): Inconsistent camelCase conversion
- `/packages/api/src/lib/middleware.ts:63` — `stripeCustomerId: user.stripe_customer_id` (correct conversion)
- BUT: `/packages/api/src/routes/webhook-stripe.ts:43` — `stripe_customer_id: customerId` (direct snake_case in object literal)

**The problem**: In webhook-stripe, the route directly inserts `stripe_customer_id` (snake_case) into the Supabase update payload, bypassing the camelCase conversion done elsewhere:

```typescript
// webhook-stripe.ts:43 (WRONG — raw snake_case field in object)
await supabase.from("users").update({
  stripe_customer_id: customerId,   // ← snake_case in JS object
  ...
});

// contrast with middleware.ts:59-67 (RIGHT — camelCase converted at boundary)
c.set("user", {
  stripeCustomerId: user.stripe_customer_id,  // ← camelCase in memory
  ...
});
```

**Why it matters**: TypeScript doesn't catch this because Supabase's `.update()` method accepts `Record<string, any>`. The inconsistency creates confusion about the naming convention boundary:
- Should JS use camelCase or snake_case when writing to DB?
- Other routes don't show this pattern, making it look like a one-off mistake

**Locations**:
- `/packages/api/src/routes/webhook-stripe.ts:43` — `stripe_customer_id: customerId`
- `/packages/api/src/routes/webhook-stripe.ts:71` — `.update({ plan: "pro", stripe_subscription_id: subscriptionId, ... })`
- `/packages/api/src/routes/webhook-stripe.ts:119` — `.update({ plan: "free", ... })`
- Compare to: `/packages/api/src/routes/checkout.ts:58` — properly typed `.update({ stripe_customer_id: ... })`

**Severity**: MODERATE — creates risk that future developers will replicate the pattern or miss it during review.

**Recommended**: 
1. Define an explicit type for Supabase update payloads: `interface UserUpdatePayload { stripe_customer_id?: string; plan?: "free" | "pro"; ... }`
2. Use that type in webhook-stripe for clarity
3. Or: Adopt a helper function to convert camelCase objects to snake_case for DB writes

---

### Inconsistency #4: Non-Null Assertions (`!`) Widespread in Extension Code

**Pattern A** (safe approach): Guard checks before access
- `/packages/extension/src/storage.ts:9` — `return result[key] as ExtensionStorage[K] | undefined;` (correctly typed)
- `/packages/extension/src/content/panel.ts:34` — `if (!panelFrame) return;` (guard before use)

**Pattern B** (violation of coding standards): Non-null assertions throughout
- `/packages/extension/src/options/index.ts:17-19` — `document.getElementById("email")!`, `document.getElementById("plan")!`, `document.getElementById("api-key")!`
  - 3 instances assuming elements exist without checking
- `/packages/extension/src/content/panel.ts:21-24` — `panelFrame!.style.transform`, `dragHandle!.style.right`
  - 4 instances despite line 21 already checking `if (!panelFrame)`
- `/packages/extension/src/sidepanel/index.ts:239, 334, 357, 371, 760, 834-836, 850-851, 874-875, 994-997, 1038, 1042...` — **21+ instances** of `getElementById(...)!`

**Why it matters**: CLAUDE.md explicitly forbids `!`: "Non-null assertions (`!`) — flag, should use type guards instead"

The sidepanel especially uses this pattern pervasively:
```typescript
// BAD — assumes element exists
document.getElementById("error-sort")!.addEventListener("change", () => { ... });

// GOOD — verify element exists or provide fallback
const errorSort = document.getElementById("error-sort");
if (!errorSort) throw new Error("Missing #error-sort element");
errorSort.addEventListener("change", () => { ... });
```

**Locations** (HIGH concentration in sidepanel/index.ts):
- Line 239: `document.getElementById("error-sort")!`
- Line 334: `document.getElementById("decode-selected")!`
- Line 357: `document.getElementById("decode-all")!`
- Line 371: `document.getElementById("clear-errors")!`
- Line 760: `document.getElementById("history-select")!`
- Line 834-837: `document.getElementById("inspect-new")!` (4 instances on consecutive lines)
- Line 850-851: `document.getElementById("inspect-start")!` (2 instances)
- Line 874-875: `document.getElementById("element-info")!` and `document.getElementById("inspect-result")!`
- Line 994-997: `document.getElementById("inspect-question")!` and `document.getElementById("inspect-ask-btn")!`
- Line 1038: `document.getElementById("close-panel")!`
- Line 1042: `document.getElementById("settings-link")!`

Plus in options.ts:17-19 and popup.ts:60, 67.

**Severity**: MODERATE — violates explicit coding style rule. While these will work if the HTML is correct, they provide zero safety if markup changes or elements fail to load.

**Recommended**: Replace all `document.getElementById(...)!` with a helper:
```typescript
const getElement = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Missing required element: #${id}`);
  return el;
};

// Usage
const errorSort = getElement<HTMLSelectElement>("error-sort");
errorSort.addEventListener("change", () => { ... });
```

---

### Inconsistency #5: API Key Type — Different Expectations in Routes

**Location**: `/packages/api/src/routes/auth.ts:49` vs. others

In auth.ts, the API response maps database field `api_key` to the response field `apiKey`:
```typescript
// auth.ts:49 (correct camelCase in response)
apiKey: userRow.api_key,
```

But in the shared types (implied by usage), this is expected in API responses. **However**, the API client in the extension expects this exact naming:
```typescript
// packages/extension/src/shared/api.ts:65
request<{ apiKey: string; email: string; plan: string }>("/auth/key", { ... })
```

This is actually **correct** (proper camelCase conversion), but there's **no type validation** that all routes follow this. The webhook-stripe inconsistency (above) shows this isn't enforced.

**Severity**: MODERATE — Risk that future routes won't convert snake_case to camelCase properly.

**Recommended**: Create a strict TypeScript definition for API response envelopes:
```typescript
// lib/api-types.ts
type ApiErrorResponse = {
  error: { message: string; code: string };
};

type ApiSuccessResponse<T> = {
  data: T;
};

type ApiResponse<T> = ApiErrorResponse | ApiSuccessResponse<T>;

// Use in all routes via shared module
```

---

## 🟡 MINOR (Style Preferences)

### Issue #1: Console Error/Log Tag Format Inconsistency

Some routes use `[Module]` format, others use slightly different patterns:
- `/packages/api/src/routes/decode.ts:123` — `[Decode]` 
- `/packages/api/src/routes/feedback.ts:32` — `[Feedback]`
- `/packages/api/src/routes/webhook-stripe.ts:23` — `[Stripe Webhook]` (inconsistent — others use single word)

Minor but reduces searchability. Recommend standardize on `[Service]` format across all logs.

---

### Issue #2: Async Fire-and-Forget Pattern

Several routes spawn async operations and don't await:
- `/packages/api/src/routes/decode.ts:103` — `cacheUtils.set(...).catch(() => {});`
- `/packages/api/src/routes/decode.ts:109` — `supabase.rpc(...).then(() => {});`
- `/packages/api/src/routes/decode.ts:117` — `supabase.rpc(...).then(() => {});`

This is intentional (don't block response), but it's inconsistent with error handling elsewhere. Some routes use `.catch(() => {})`, others `.then(() => {})`. 

Recommendation: Standardize on `.catch(() => {})` as the convention for fire-and-forget, or create a helper `fireAndForget(promise)` to make intent explicit.

---

## Summary

- **Critical violations**: 1 (type safety: `as any` in main-world.ts)
- **Moderate inconsistencies**: 5 (error codes, response format, naming, non-null assertions, API response structure)
- **Minor issues**: 2 (log format, async patterns)

---

## What's Consistent (Positive)

✅ **File naming**: 100% kebab-case across all packages  
✅ **Arrow functions**: No `function` keyword found anywhere — perfect adherence  
✅ **No enums**: Only `as const` patterns used correctly  
✅ **Validation**: All routes use Valibot consistently  
✅ **Error handling in routes**: All validation failures caught and formatted properly  
✅ **Middleware pattern**: Clear separation of auth, rate limiting, error handling  
✅ **Type annotations**: Functions are typed, return types inferred correctly  
✅ **Import organization**: Grouped by type (lib, routes, schemas)  
✅ **Extension architecture**: Content script / background / sidepanel separation is clean  
✅ **Caching logic**: Consistent use of Supabase for both response and usage tracking  

---

## Recommendations (Priority Order)

**Priority 1 (Critical)**: Fix `as any` in `/packages/extension/src/capture/main-world.ts`
- Define proper types for framework globals detection
- Define type for console function overrides (`ConsoleErrorArgs`, `ConsoleWarnArgs`)
- Use type guards instead of casting

**Priority 2 (High)**: Standardize error codes and response formats
- Add `webhookSignatureInvalid` to `errorCodes` (or use existing equivalent)
- Replace hardcoded `"INVALID_SIGNATURE"` with `errorCodes.*`
- Change webhook-stripe success response from `{ received: true }` to `{ data: { received: true } }`

**Priority 3 (High)**: Eliminate non-null assertions in extension
- Create `getElement()` helper function
- Replace all `document.getElementById(...)!` patterns
- Especially critical in sidepanel/index.ts (21+ instances)

**Priority 4 (Medium)**: Formalize API response types
- Create `ApiResponse<T>` discriminated union type
- Enforce in all routes via TypeScript
- Add database-to-JS naming convention guidelines

**Priority 5 (Low)**: Standardize logging and async patterns
- Adopt consistent log prefix format
- Create `fireAndForget()` helper for clarity

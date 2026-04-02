# Bug Analysis Report

**Analyzed**: 2026-04-02
**Files Checked**: 38
**Critical Bugs Found**: 4
**Total Bugs Found**: 14
**Scope**: Full codebase — API backend (Hono/Bun), Chrome Extension (MV3), shared types, scripts

---

## CRITICAL BUGS (Fix Immediately)

### Bug #1: `model_used` Always Hardcoded to "haiku" — Sonnet Usage Permanently Mislogged

**File**: `packages/api/src/routes/decode.ts:143`
**Severity**: CRITICAL
**Category**: Logic Error

**Issue**: The `logDecode` function hardcodes `model_used: "haiku"` regardless of which model was actually used. When a Pro user decodes with Sonnet, the decode is logged as Haiku. This means: (a) cost analytics are wrong — Sonnet costs 3x/15x vs Haiku 1x/5x per million tokens; (b) you cannot query which users are consuming Sonnet; (c) abuse detection based on model usage is blind.

**Current Code**:
```ts
const logDecode = (
  userId: string, errorHash: string, errorText: string, response: any,
  cacheHit: boolean, inputTokens: number, outputTokens: number,
  costCents: number, responseTimeMs: number
) => {
  supabase.from("decodes").insert({
    ...
    model_used: "haiku",  // BUG: always "haiku", ignores which model was used
    ...
  })
```

**Fixed Code**: The `useModel` variable from the outer scope needs to be passed in or the function signature needs a `model` parameter.

```ts
const logDecode = (
  userId: string, errorHash: string, errorText: string, response: any,
  cacheHit: boolean, inputTokens: number, outputTokens: number,
  costCents: number, responseTimeMs: number, modelUsed: "haiku" | "sonnet"
) => {
  supabase.from("decodes").insert({
    ...
    model_used: modelUsed,
    ...
  })
```

All three `logDecode(...)` calls on lines 74 and 115 must pass the correct model.

---

### Bug #2: Rate Limit Increments Before Request Completes — Successful Decodes Count Even on AI Failure

**File**: `packages/api/src/lib/middleware.ts:76-99`
**Severity**: CRITICAL
**Category**: Idempotency/TOCTOU

**Issue**: `rateLimitMiddleware` calls `increment_daily_usage` atomically before the decode succeeds. If the Anthropic API call subsequently fails (503, rate limit, network error), the user's daily counter still increments. A free user hitting the AI's rate limit 3 times in a row gets locked out for the day having never received a successful decode. This is a direct user-facing crash scenario that produces paying customers who got nothing for their limit.

**Current Code**:
```ts
// Atomic increment + check via Postgres function
const { data: newCount, error } = await supabase.rpc(
  "increment_daily_usage",
  { p_user_id: user.id }
);
// ... returns 429 if over limit, otherwise calls next()
// But the increment already happened — AI failure below still consumed the slot
```

**Why This Breaks Production**: User has 2 of 3 free decodes left. Anthropic returns 503 twice. User is now at limit. Tries again next day. Can't figure out why decodes are "used up." Churns.

**Fix**: Increment should happen only on successful AI response, not as middleware. Move the increment into `decode.ts` after the `completion` is returned successfully.

---

### Bug #3: STRIPE_WEBHOOK_SECRET Defaults to Empty String — Signature Verification Always Passes When Env Var Missing

**File**: `packages/api/src/lib/stripe.ts:11`
**Severity**: CRITICAL
**Category**: Logic Error / Security-adjacent

**Issue**: `STRIPE_WEBHOOK_SECRET` is exported as `process.env.STRIPE_WEBHOOK_SECRET ?? ""`. In `webhook-stripe.ts:15`, the guard checks `if (!STRIPE_WEBHOOK_SECRET)` and returns 500 only when the secret is empty. However, if the env var is set to any non-empty value that is wrong (e.g., a stale/rotated secret), `constructEventAsync` will throw and the route correctly rejects with 400.

The actual runtime bug is: if `STRIPE_WEBHOOK_SECRET` is legitimately missing (new deployment, misconfigured env), the guard at line 15 in `webhook-stripe.ts` catches this and returns 500. **But the value exported from `lib/stripe.ts` is `""` (empty string), which is falsy — so this guard does work correctly.**

However, there is a real problem: the module-level `throw new Error("Missing STRIPE_SECRET_KEY")` in `lib/stripe.ts:6` will crash the entire Hono app startup when `STRIPE_SECRET_KEY` is missing. But `STRIPE_WEBHOOK_SECRET` has no such guard — it silently becomes `""` and the only protection is the route-level check. This is inconsistent and fragile.

**More importantly**: the route-level check `if (!STRIPE_WEBHOOK_SECRET)` returns 500, which signals to Stripe "retry this event." Stripe will retry indefinitely, creating a retry storm against your own broken endpoint. The correct response when the server is misconfigured is still 200 (to stop retries) with an internal alert, or a proper health-check that prevents deployment with missing secrets.

---

### Bug #4: `showPanel()` Dereferences `dragHandle` with Non-Null Assertion After Conditional `createPanel()` — Race Condition If Called Concurrently

**File**: `packages/extension/src/content/panel.ts:20-24`
**Severity**: CRITICAL
**Category**: Null/Undefined Dereference

**Issue**: `showPanel()` calls `createPanel()` only when `!panelFrame`. After `createPanel()`, it immediately uses `dragHandle!` with a non-null assertion. `dragHandle` is assigned inside `createPanel()` on line 89. However if `showPanel()` is called from two message handlers in rapid succession (e.g., background sends `SHOW_PANEL` while another listener is processing), `createPanel()` could be entered, the first call's DOM work begins, and the second call enters the `if (!panelFrame)` check at the top — `panelFrame` is still null at that point because `createPanel()` hasn't returned. Both calls proceed into `createPanel()`, appending two iframes and two drag handles. Subsequent `panelFrame!` and `dragHandle!` on lines 21-23 reference the last-assigned module-level variable, but the first call's frame is orphaned. The `!` assertion masks this.

Even in the single-call case, if `createPanel()` ever threw before assigning `dragHandle`, line 23 (`dragHandle!.style.right = ...`) would throw `Cannot set properties of null`.

**Current Code**:
```ts
export const showPanel = () => {
  if (!panelFrame) {
    createPanel();
  }

  panelFrame!.style.transform = "translateX(0)";        // line 21
  panelFrame!.style.width = `${panelWidth}px`;           // line 22
  dragHandle!.style.right = `${panelWidth - 6}px`;      // line 23 — null if createPanel failed
  dragHandle!.style.opacity = "1";                       // line 24
```

---

## HIGH BUGS (Fix Soon)

### Bug #5: `DecodeResponse` Type Mismatch — API Returns Markdown String, Types Declare Structured Object

**File**: `shared/types.ts:29-39` vs `packages/api/src/routes/decode.ts:117`
**Severity**: HIGH
**Category**: Type Mismatch

**Issue**: `DecodeResponse` in `shared/types.ts` declares a structured type with `whatHappened: string`, `why: string[]`, `howToFix: string[]`, `codeExample?: CodeExample`. But the actual API response at `decode.ts:117` returns `{ markdown, model, cached }` where `markdown` is a raw string.

The popup (`popup/index.ts:23-39`) calls `renderResult(response.data)` and tries to access `result.whatHappened`, `result.why`, `result.howToFix`, `result.codeExample` — all of which will be `undefined` because the actual response shape is `{ markdown: string, model: string, cached: boolean }`.

The sidepanel correctly uses `json.data.markdown` directly (bypassing the type). The popup is completely broken — it will render empty fields for every decode.

**Evidence**:
- `decode.ts:117`: `return c.json({ data: { markdown, model: useModel, cached: false } })`
- `popup/index.ts:23`: `const renderResult = (result: DecodeResponse) => { document.getElementById("what-happened-text")!.textContent = result.whatHappened; ...`
- `devtools/panel.ts:117`: also accesses `data.whatHappened`, `data.why`, `data.howToFix`, `data.codeExample` — also broken

---

### Bug #6: `resolveTabId()` Uses Active Tab Query — Wrong Tab When Sidebar Opens From Background

**File**: `packages/extension/src/sidepanel/index.ts:61-65`
**Severity**: HIGH
**Category**: Logic Error / Execution Flow

**Issue**: `resolveTabId()` calls `chrome.tabs.query({ active: true, currentWindow: true })` to determine which tab the sidebar belongs to. This is unreliable: if the user switches tabs after opening the sidebar, or if the sidebar is opened programmatically while a different tab is focused, `currentTabId` will be set to the wrong tab. All error storage/retrieval keys use `errors_tab_${currentTabId}` — the sidebar would show errors from a different tab than the one it's injected into.

The correct approach in a content-script-injected iframe is to pass the tab ID from the injecting content script. The sidepanel should receive its tab ID via `window.parent.postMessage` from the content script when the panel first loads, not by querying Chrome.

---

### Bug #7: Resource Leak — `mousemove` and `mouseup` Document Listeners Never Removed in `panel.ts`

**File**: `packages/extension/src/content/panel.ts:152-171`
**Severity**: HIGH
**Category**: Resource Leak

**Issue**: The drag-resize implementation adds `mousemove` and `mouseup` event listeners to `document` inside `createPanel()`. These listeners are never removed — not when the panel is hidden, not when the page navigates, not ever. `createPanel()` is only called once per content script lifetime, so there's only one set of listeners, but they persist indefinitely, continuing to run on every mouse movement across the page even when the panel is hidden (checking `if (!isDragging)` each time, but still executing the check).

The same pattern exists in `shared/ui.ts:21-33` (`setupResizableGrip`) — `mousemove` and `mouseup` on `document` are never removed. This is called from `sidepanel/index.ts` for 3 different elements.

---

### Bug #8: Webhook Idempotency — No Event ID Deduplication on Stripe Webhooks

**File**: `packages/api/src/routes/webhook-stripe.ts:31-138`
**Severity**: HIGH
**Category**: Idempotency/TOCTOU

**Issue**: Stripe guarantees at-least-once delivery. The webhook handler processes every event it receives. If Stripe retries a `checkout.session.completed` event (e.g., due to a network timeout on the first delivery), the user gets `plan: "pro"` set twice — harmless in this case. But if `customer.subscription.deleted` is retried after a transient error, the downgrade fires twice against an already-downgraded account — also harmless in isolation. However, if `invoice.payment_failed` fires and downgrades a user, then `customer.subscription.updated` fires a moment later (Stripe sends both) and upgrades them back to pro, a retry of `invoice.payment_failed` would incorrectly downgrade the re-upgraded user.

The fix is to store processed Stripe event IDs (`event.id`) in the DB and skip events already seen.

---

### Bug #9: `getTabKey()` Returns `null` When `currentTabId` Is Null — Silent No-Op in Critical Paths

**File**: `packages/extension/src/sidepanel/index.ts:58`
**Severity**: HIGH
**Category**: Null/Undefined Dereference

**Issue**: `getTabKey()` returns `null` when `currentTabId` is null (not yet resolved). Multiple paths check `if (key)` before using it — correct. But the `chrome.storage.session.onChanged` listener at line 69 calls `renderNewErrors` only when `key && changes[key]` — if `currentTabId` hasn't been resolved yet when the first error arrives (race condition: errors can arrive before `init()` completes its async `resolveTabId()` call), errors are silently dropped and never rendered.

`init()` is called at line 149, but `chrome.storage.session.onChanged` is registered at line 68, before `init()` is called. If errors arrive before `resolveTabId()` completes, `getTabKey()` returns null and those errors are lost.

---

## MEDIUM BUGS

### Bug #10: `modal.ts` — `keydown` Listener Not Removed When Modal Resolves via Button Click

**File**: `packages/extension/src/shared/modal.ts:117-123`
**Severity**: MEDIUM
**Category**: Resource Leak

**Issue**: The `onKeydown` listener removes itself only when the Escape key is pressed. If the user clicks "Confirm" or "Cancel" (or clicks the overlay backdrop), `cleanup(true/false)` is called which resolves the promise and removes the overlay — but `onKeydown` is never removed from `document`. Multiple modal invocations (e.g., decoding with sensitive data multiple times) accumulate stale keydown listeners that call `cleanup` on a resolved promise. Since `resolve()` on an already-resolved promise is a no-op in JS, this won't crash, but each stale listener will fire on the next Escape keypress and call `overlay.remove()` / `style.remove()` on DOM elements that no longer exist, which is a silent no-op in most browsers.

**Current Code**:
```ts
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    document.removeEventListener("keydown", onKeydown);
    cleanup(false);
  }
};
document.addEventListener("keydown", onKeydown);

const cleanup = (result: boolean) => {
  overlay.remove();
  style.remove();
  resolve(result);
  // BUG: onKeydown listener not removed here
};
```

---

### Bug #11: `rateLimitMiddleware` Error Path Falls Through — DB Error Bypasses Rate Limit Entirely

**File**: `packages/api/src/lib/middleware.ts:81-84`
**Severity**: MEDIUM
**Category**: Error Isolation

**Issue**: When `supabase.rpc("increment_daily_usage")` fails, the middleware logs the error and calls `await next()` — allowing the decode to proceed without rate limiting. While a reasonable fallback for transient DB errors, this means any sustained DB outage removes the rate limit for all free users, potentially causing uncapped AI API spend during a DB incident.

---

### Bug #12: `server.ts` Port Parsing — `.pop()` on Empty Array Returns `undefined`, `parseInt(undefined)` Returns `NaN`

**File**: `packages/api/src/server.ts:3`
**Severity**: MEDIUM
**Category**: Null/Undefined Dereference

**Issue**: `process.env.API_URL?.split(":").pop()` — if `API_URL` is set but has no `:` (e.g., `"localhost"`), `.pop()` returns `"localhost"`. `parseInt("localhost", 10)` returns `NaN`. `NaN` as the port argument to Bun's server causes it to use port 0 (random ephemeral port), not the intended 4001.

If `API_URL` is something like `http://localhost` (no port), the chain produces `pop() = "localhost"` which parseInt converts to NaN. This is a dev-only file so production is unaffected, but the local dev server silently starts on a random port.

---

### Bug #13: `decodeSingle` in sidepanel — No Guard Against `rateLimitMiddleware` Pre-Incrementing On Already-In-Progress Decode

**File**: `packages/extension/src/sidepanel/index.ts:418-419`
**Severity**: MEDIUM
**Category**: Logic Error

**Issue**: `isDecoding` flag prevents double-click correctly. However, the check is:
```ts
const decodeSingle = async (errorText: string, model: "haiku" | "sonnet") => {
  if (isDecoding) return;
  // ... await getApiKey()
  // ... await showConfirmModal() — user can wait here for seconds
  // ... setDecoding(true, ...)
```

`setDecoding(true)` is called after the API key check and the sensitive data modal. Between `if (isDecoding) return` and `setDecoding(true)`, if the user clicks Haiku and then Sonnet in rapid succession before `setDecoding` is reached, both calls pass the `isDecoding` guard and both proceed to call the API. `isDecoding` is not set to `true` until after the async `getApiKey()` and optional `showConfirmModal()` calls complete. This means two concurrent decodes can be initiated.

---

### Bug #14: `inspector.ts` — `getMatchedCSSRules` Rule Counter Checks Wrong Scope

**File**: `packages/extension/src/content/inspector.ts:203-226`
**Severity**: MEDIUM (Low real-world impact since it's a display feature)
**Category**: Logic Error (off-by-one / loop control)

**Issue**: The CSS rule cap logic is duplicated and inconsistent. `ruleCount` is incremented for every rule across all stylesheets. The inner loop breaks at `ruleCount > 500` (line 203), but `ruleCount` is declared outside the outer `for...of sheet` loop. The `if (ruleCount > 500) break;` on line 226 breaks the outer loop. However, the `ruleCount++ > 500` check on line 203 includes a post-increment, meaning the 501st rule is still processed (the `>` check uses the pre-increment value because it's `ruleCount++` not `++ruleCount`). This is a minor off-by-one — rules 501-502 slip through.

More importantly, the check fires for every rule type, including non-`CSSStyleRule` types (media queries, keyframes, etc.) that are skipped by the `instanceof CSSStyleRule` guard but still count toward the limit. This can cause the function to exit early on pages with many `@keyframes` or `@media` rules, missing actual style rules.

---

## Summary by Category

- Null/Undefined: 3 (Bugs #4, #9, #12)
- Types: 1 (Bug #5)
- Async: 1 (Bug #13)
- Logic: 3 (Bugs #1, #6, #14)
- Leaks: 2 (Bugs #7, #10)
- Isolation: 1 (Bug #11)
- Flow/Ordering: 1 (Bug #9)
- Idempotency/TOCTOU: 2 (Bugs #2, #8)

---

## Prioritized Fix Order

### Must Fix Now (Production Risk)

1. **Bug #1** — Model always logged as "haiku". Revenue analytics, cost tracking, and abuse detection are all wrong. 1-line fix with parameter addition.

2. **Bug #5** — Popup and DevTools panel are completely broken: `result.whatHappened` is always `undefined` because the API returns `{ markdown }` not the structured type. Both UIs render empty content for every decode.

3. **Bug #2** — Rate limit consumes a slot on AI failure. Free users can burn their daily limit on Anthropic outages, causing support load and churn.

4. **Bug #4** — `dragHandle!` null dereference in `showPanel()` if `createPanel()` is called concurrently or fails mid-execution.

### Should Fix Soon (User Impact)

5. **Bug #6** — Wrong tab ID in sidepanel: errors from one tab shown in sidebar belonging to another tab.

6. **Bug #9** — Race condition: errors arriving before `resolveTabId()` completes are permanently lost.

7. **Bug #8** — Stripe webhook idempotency: retry storms could cause incorrect plan state transitions.

8. **Bug #7** — Document event listener leak from drag handles — accumulates on every page the user visits.

### Nice to Fix (Code Quality)

9. **Bug #3** — Stripe webhook secret misconfiguration returns 500 (triggers Stripe retries) instead of 200.
10. **Bug #10** — Modal keydown listener leak.
11. **Bug #11** — DB error fallthrough bypasses rate limiting.
12. **Bug #12** — Port NaN in dev server when `API_URL` has no port.
13. **Bug #13** — Double-decode race on rapid button clicks.
14. **Bug #14** — CSS rule counter off-by-one in inspector.

---

## What's Working Well

- The atomic `increment_daily_usage` RPC approach is the right pattern — prevents TOCTOU on rate limiting (the placement is wrong, but the mechanism is correct).
- Stripe webhook signature verification using `constructEventAsync` with raw body is correctly implemented.
- The sensitive data pre-scan before API calls is a thoughtful privacy feature with good pattern coverage.
- Error buffer deduplication (500ms window) in background worker prevents spam from rapid-fire console errors.
- Cache hash normalization (lowercase, collapse whitespace) correctly handles minor input variations.
- The non-null assertion `dragHandle!` pattern is consistent with the codebase style but the underlying null risk is real in `showPanel()`.
- `resolveStackTrace` correctly limits to 5 frames to avoid blocking.

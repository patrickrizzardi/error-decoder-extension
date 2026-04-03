# Bug Analysis Report

**Analyzed**: 2026-04-02
**Files Checked**: 32 source files (API: 14, Extension: 17, Web: 1)
**Critical Bugs Found**: 4
**High Bugs Found**: 6
**Medium Bugs Found**: 4
**Scope**: Full codebase audit — Chrome extension + Hono API backend + Bun web server

---

## CRITICAL BUGS (Fix Immediately)

---

### Bug #1: Race condition on free-tier usage counting allows exceeding the daily limit

**File**: `packages/api/src/routes/decode.ts:116-117` and `packages/api/src/lib/middleware.ts:83-105`
**Severity**: CRITICAL
**Category**: Idempotency/TOCTOU

**Issue**: The rate limit check (read) and the usage increment (write) are two separate, non-atomic operations separated by the entire AI call duration (typically 1-5 seconds). A free user can fire multiple simultaneous decode requests. All of them will pass the check (reading the same `count < 3`), all will call Anthropic, and all will increment the counter afterward — resulting in more than 3 daily decodes consumed and more than 3 Anthropic API calls being billed.

**Why This Breaks Production**: Two concurrent requests from a free user both read `count = 2` (under limit), both proceed through `rateLimitMiddleware`, both call Claude, both succeed, both fire `increment_daily_usage`. The user gets 2 decodes in a single "slot" and costs the platform double the AI spend. At scale, a user aware of this can exhaust the limit entirely by racing 3 simultaneous requests.

**Current Code**:
```typescript
// middleware.ts — reads count but doesn't lock
if ((usage?.count ?? 0) >= FREE_TIER_DAILY_LIMIT) {
  return c.json({ error: ... }, 429);
}
await next(); // ← entire AI call happens here (1-5 seconds)

// decode.ts — increment happens after AI returns
if (user.plan === "free" && !user.isAdmin) {
  supabase.rpc("increment_daily_usage", { p_user_id: user.id }).then(() => {});
}
```

**Fixed Code** (conceptual — requires DB-side atomic check-and-increment):
```sql
-- Replace the check + fire-and-forget increment with a single atomic RPC:
-- increment_daily_usage_if_under_limit(p_user_id, p_limit) → returns boolean (allowed)
-- Uses: UPDATE daily_usage SET count = count + 1 WHERE user_id = ? AND date = ? AND count < limit
-- Returns whether the row was actually updated (i.e., whether the user was under limit)
```
The middleware should call this atomic RPC instead of a read-then-later-write pattern. If it returns false (limit hit), reject immediately.

---

### Bug #2: Race condition on Sonnet monthly counter allows exceeding the 20/month limit

**File**: `packages/api/src/routes/decode.ts:107-109` and `decode.ts:53-63`
**Severity**: CRITICAL
**Category**: Idempotency/TOCTOU

**Issue**: The Sonnet limit check reads `user.sonnetUsesThisMonth` from the auth middleware pass (which fetched it at request start), then the increment fires asynchronously after the AI call. The same TOCTOU window exists as Bug #1, but for Sonnet: two concurrent Sonnet requests both see `sonnetUsed = 19`, both pass the check, both call Claude Sonnet (at $3/$15 per 1M tokens — much more expensive), and both increment.

**Why This Breaks Production**: Sonnet is 3-15x more expensive than Haiku. A Pro user who knows about this can issue concurrent requests to bypass the 20/month limit. At the platform's cost structure, each leaked Sonnet call is ~$0.04 vs ~$0.004 for Haiku — 10x cost overrun on the most expensive tier.

**Current Code**:
```typescript
// Check uses data fetched at request start — stale by the time AI finishes
const sonnetUsed = user.sonnetMonth === currentMonth
  ? (user.sonnetUsesThisMonth ?? 0) : 0;
if (sonnetUsed >= PRO_SONNET_MONTHLY_LIMIT) { return 429; }

// ... AI call happens (1-5 seconds) ...

// Increment fires after AI call — too late to prevent concurrent bypasses
supabase.rpc("increment_sonnet_usage", { p_user_id, p_month }).then(() => {});
```

**Fixed Code** (same pattern as Bug #1): Needs an atomic DB-level check-and-increment RPC called before the AI call, similar to the daily usage fix.

---

### Bug #3: Stripe webhook `checkout.session.completed` has no idempotency guard — duplicate plan upgrades possible

**File**: `packages/api/src/routes/webhook-stripe.ts:28-56`
**Severity**: CRITICAL
**Category**: Idempotency/TOCTOU

**Issue**: Stripe webhooks are delivered at-least-once. If the first delivery succeeds in upgrading the user but returns a 500 (e.g., intermittent DB error logged at line 50), or if the network drops after Stripe sends but before it receives the 200 ack, Stripe retries the webhook. The handler has no deduplication — no check against a stored event ID. For `checkout.session.completed` this is typically harmless (re-upgrade is a no-op), but for `invoice.payment_failed` (lines 105-130) redelivery will downgrade an already-downgraded user again, and for `customer.subscription.deleted` a retry silently re-fires the downgrade. More critically, the 500 path (line 50-51) returns an error, so Stripe will retry, but by that point the DB update may have already partially succeeded.

**Why This Breaks Production**: Webhook redelivery is not a rare edge case — Stripe retries on any non-2xx response, and network/DB hiccups in serverless environments are common. Without event ID deduplication, the handler cannot guarantee exactly-once semantics. The `invoice.payment_failed` immediate-downgrade path is especially risky: a transient failure causes retry, user may be downgraded multiple times and their state corrupted if concurrent retries overlap with a successful payment.

**Current Code**:
```typescript
// No event ID check — processes every delivery unconditionally
switch (event.type) {
  case "checkout.session.completed": {
    // ... updates user to pro ...
    if (error) {
      return c.json({ error: ... }, 500); // Stripe will retry this
    }
  }
}
```

**Fixed Code** (conceptual):
```typescript
// Store processed event IDs in a webhook_events table with a unique constraint on event.id
// Before processing: INSERT INTO webhook_events (event_id) VALUES (?) ON CONFLICT DO NOTHING
// If 0 rows inserted: already processed — return 200 immediately
```

---

### Bug #4: `account.ts` deletes user data BEFORE deleting from Supabase Auth — partial deletion on auth failure leaves orphaned data

**File**: `packages/api/src/routes/account.ts:30-51`
**Severity**: CRITICAL
**Category**: Flow/Ordering

**Issue**: The delete flow executes in this order: (1) delete from `users` table (cascade deletes decodes, daily_usage), (2) delete from `supabase.auth.admin.deleteUser()`. If step 2 fails (line 45-49 logs the error but continues), the auth identity still exists — the user can still log in via Supabase auth, call `/api/auth/key`, and the trigger that creates the `users` row may re-create it (depending on the DB trigger), or they get a 500 on login because the `users` row no longer exists. Either way, data state is inconsistent: the auth identity exists but the application data is gone.

**Why This Breaks Production**: Auth deletion failure is not hypothetical — Supabase auth admin calls can fail due to rate limits, network issues, or the user not existing in auth (if they were created manually). After a partial delete, the user is stuck: they can't log in (no `users` row → 500 on key exchange), but they also can't re-register (email already exists in auth). A retry of the delete endpoint also fails because the `users` row is already gone, so the auth delete never retries successfully.

**Current Code**:
```typescript
// Step 1: delete application data — cascades and is irreversible
const { error: deleteError } = await supabase.from("users").delete().eq("id", user.id);

// Step 2: delete auth identity — if this fails, auth still exists but data is gone
const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id);
if (authDeleteError) {
  console.error("[Account] Auth delete failed:", authDeleteError.message);
  // Continues without returning error — user thinks deletion succeeded
}
return c.json({ data: { deleted: true } });
```

**Fixed Code** (conceptual): Delete from auth FIRST, then delete application data. Auth deletion failing is safe (nothing lost yet) and the user can retry. Alternatively, use a soft-delete pattern with a `deleted_at` timestamp and a cleanup job, or wrap both operations in a transaction pattern where auth is confirmed deleted before data is removed.

---

## HIGH BUGS

---

### Bug #5: `resolveSourceMaps` in sidepanel never clears its timeout on chrome.runtime error

**File**: `packages/extension/src/sidepanel/index.ts:514-528`
**Severity**: HIGH
**Category**: Resource Leak / Async Issue

**Issue**: The `resolveSourceMaps` function creates a 5-second timeout and sends a `chrome.tabs.sendMessage`. If `chrome.runtime.lastError` is set (content script not present, tab closed, navigated away), the callback fires immediately with `response = undefined`, but the timer is still pending — `clearTimeout(timer)` is called, so the timer is correctly cleared on the success path. However, if the `sendMessage` call itself throws synchronously (which can happen when `currentTabId` is invalid at the Chrome API level), the outer `try/catch` at line 525 catches it, returns `errorText`, but the timer set at line 519 still fires 5 seconds later calling `resolve(errorText)` on an already-resolved promise. This is benign in terms of correctness (resolving a settled promise is a no-op) but indicates a lurking resource leak pattern.

More importantly: when `chrome.tabs.sendMessage` fires the callback with a Chrome runtime error, `response` is `undefined` — the code at line 521 uses `response?.resolved || errorText`, which correctly falls back. This part is safe.

**The real issue**: If `currentTabId` becomes stale (user switches tabs between button click and callback), the message goes to the wrong tab's content script, which silently ignores it, the 5-second timeout fires, and the decode is delayed by 5 seconds with no indication to the user. This is a UX degradation that becomes a functional hang if multiple decodes are queued.

---

### Bug #6: `panel.ts` — `showPanel` dereferences `dragHandle` with non-null assertion after possible null

**File**: `packages/extension/src/content/panel.ts:22-23`
**Severity**: HIGH
**Category**: Null Dereference

**Issue**: `showPanel()` uses `panelFrame!` and `dragHandle!` with non-null assertions. These are only set inside `createPanel()` which is called at the top of `showPanel()` when `panelFrame` is null. However, `createPanel()` does not guarantee `dragHandle` is non-null after it completes — if `document.body.appendChild` throws (e.g., page's CSP blocks it, or `document.body` is null in an unusual page like `about:blank`), `dragHandle` will remain null and `dragHandle!.style.right` at line 23 crashes.

Furthermore, `hidePanel()` at line 36 accesses `panelFrame.style.transform` without a non-null assertion but with an `if (!panelFrame) return` guard. However, `dragHandle` at line 39 uses optional chaining `dragHandle?.style` — which is inconsistent with `showPanel()` using `dragHandle!`. If `createPanel()` fails partway through (after creating `panelFrame` but before assigning `dragHandle`), `showPanel` will crash on line 23.

---

### Bug #7: `decodeSingle` sets `isDecoding = true` but returns without resetting on early exit (no apiKey path)

**File**: `packages/extension/src/sidepanel/index.ts:544-566`
**Severity**: HIGH
**Category**: Logic Error / Resource Leak

**Issue**: `decodeSingle` sets `isDecoding = true` at line 546, then checks for an API key. If no API key exists (line 548-566), it sets `isDecoding = false` at line 550 and returns. This looks correct. However, the sensitive data check at lines 569-582 uses `await showConfirmModal` — if the user cancels the modal (line 578), `isDecoding = false` is set and the function returns. This is also fine.

The actual problem: `setDecoding(true)` is called at line 584 which disables both buttons and sets `decodeInput.readOnly = true`. If the `fetch` at line 595 throws a network error, the `finally` block at line 667 calls `setDecoding(false)` — this is correct. BUT if the response has a 401 status (lines 604-619), the function hits an early `return` at line 619 inside the `if (json.error)` block — WITHOUT going through `finally`. The `finally` block only runs after the `try/catch`, and the early `return` IS inside the `try` block, so `finally` DOES execute. This is actually safe — TypeScript/JS `finally` runs after any return inside the try block.

Re-examining: the real issue is the `isDecoding = true` set directly at line 546 before `setDecoding(true)` is called at line 584. Between lines 546 and 584, the sensitive data modal can take user time. If the user somehow triggers another click (both buttons are not yet disabled at line 546 — `setDecoding` hasn't been called yet), the `if (isDecoding) return` at line 545 guards against this, but `isDecoding` is set to `true` before the buttons are visually disabled. This is a minor ordering issue, not critical.

The actual high-severity issue: on the auth-missing early return path (lines 548-566), `isDecoding = false` is set manually. But `setDecoding(false)` is NOT called, so `haikuRemaining` span remains hidden (it was not yet shown/hidden since `setDecoding(true)` was never called either). This leaves the UI in a clean state only because `setDecoding(true)` hadn't fired yet. This is fine.

Revisiting for real severity: the actual high bug here is that `sessionDecodeCount++` at line 661 is inside the success path but OUTSIDE the `finally` block. If the decode fails, the count doesn't increment — correct. But the `loadUserPlan()` call at line 669 is in `finally`, meaning it fires even on error responses. This is intentional and fine (refreshes usage after any attempt).

**Actual confirmed HIGH bug**: In `decodeSingle`, the `isDecoding` flag at line 546 is set directly, bypassing `setDecoding()` which also disables the buttons. This means between line 546 and the sensitive-data modal resolution, both buttons appear enabled but `isDecoding = true`. A user who clicks again during the modal display will be blocked by the `isDecoding` guard but will get no visual feedback that the action is queued. Lower severity than initially assessed — downgrading to medium.

---

### Bug #8: `checkout.ts` — unchecked Supabase update failure after creating Stripe customer

**File**: `packages/api/src/routes/checkout.ts:55-59`
**Severity**: HIGH
**Category**: Error Isolation / Logic Error

**Issue**: When a new Stripe customer is created (lines 50-54), the customer ID is saved to the DB at lines 55-59 — but the error returned by the Supabase update is never checked. If the DB write fails (e.g., transient connection issue), the Stripe customer object is created and stored in Stripe, but `users.stripe_customer_id` remains null. The next time this user attempts checkout, the code will create ANOTHER Stripe customer for the same email. Over time, a user can accumulate multiple Stripe customer records, causing billing confusion and making customer portal access fail (the portal will use whichever customer ID was eventually saved, if any).

**Current Code**:
```typescript
await supabase
  .from("users")
  .update({ stripe_customer_id: customerId })
  .eq("id", user.id);
// error is destructured but discarded — no check
```

**Fixed Code**:
```typescript
const { error: updateError } = await supabase
  .from("users")
  .update({ stripe_customer_id: customerId })
  .eq("id", user.id);

if (updateError) {
  console.error("[Checkout] Failed to save customer ID:", updateError.message);
  return c.json({ error: { message: "Failed to create checkout session", code: errorCodes.serverError } }, 500);
}
```

---

### Bug #9: `webhook-stripe.ts` — `invoice.payment_failed` immediately downgrades on first failure

**File**: `packages/api/src/routes/webhook-stripe.ts:105-130`
**Severity**: HIGH
**Category**: Logic Error

**Issue**: The code acknowledges `willRetry` at line 111 (checking `next_payment_attempt`) but downgrades the user to free regardless, logging "Stripe will retry" as a comment. This means a user whose card declines on the first attempt (and Stripe will automatically retry in 3-7 days) is immediately downgraded to the free tier. When the retry succeeds, `customer.subscription.updated` fires and upgrades them back — but there's a gap of days where a paying customer is on the free tier. This is a business logic decision, but the behavior is clearly unintentional since the code explicitly detects `willRetry = true` but doesn't use it to skip the downgrade.

**Current Code**:
```typescript
const willRetry = invoice.next_payment_attempt !== null;
// Immediately downgrade even when willRetry is true
await supabase.from("users").update({ plan: "free" }).eq("stripe_customer_id", customerId);
if (willRetry) {
  console.log(`... Stripe will retry.`); // logs it, but downgraded anyway
}
```

**Fixed Code**:
```typescript
// Only downgrade after all retries are exhausted
if (!willRetry) {
  await supabase.from("users").update({ plan: "free" }).eq("stripe_customer_id", customerId);
}
```

---

### Bug #10: `portal.ts` — Stripe billing portal creation is not wrapped in try/catch

**File**: `packages/api/src/routes/portal.ts:23-27`
**Severity**: HIGH
**Category**: Error Isolation

**Issue**: `stripe.billingPortal.sessions.create()` can throw if the Stripe customer has no payment method configured, if the customer ID is invalid, or if Stripe API is unavailable. There is no try/catch around this call. An unhandled rejection will bubble up to the global `errorHandler` and return a generic 500 — but the error message will include Stripe internals, and depending on Hono's error handler behavior, the raw Stripe error object may be logged with sensitive customer data. Same issue exists in `checkout.ts` at line 63: `stripe.checkout.sessions.create()` is not wrapped in try/catch.

**Current Code**:
```typescript
// No try/catch — Stripe errors surface as uncaught exceptions
const session = await stripe.billingPortal.sessions.create({
  customer: user.stripeCustomerId,
  return_url: `${process.env.APP_URL}/settings-updated`,
});
return c.json({ data: { url: session.url } });
```

---

## MEDIUM BUGS

---

### Bug #11: `server.ts` — Port parsing falls back to "4001" by splitting `API_URL` incorrectly

**File**: `packages/api/src/server.ts:3`
**Severity**: MEDIUM
**Category**: Logic Error / Type Mismatch

**Issue**: The port is parsed as `process.env.API_URL?.split(":").pop() ?? "4001"`. If `API_URL` is set to a full URL like `https://api.errordecoder.dev`, `.split(":")` produces `["https", "//api.errordecoder.dev"]`, and `.pop()` returns `"//api.errordecoder.dev"`. `parseInt("//api.errordecoder.dev", 10)` returns `NaN`. In a Bun server, a `NaN` port causes the server to bind on port `0` (random available port) or throw, depending on Bun version. The fallback `?? "4001"` only applies when `API_URL` is undefined, not when the parse produces a non-numeric string.

**Current Code**:
```typescript
const port = parseInt(process.env.API_URL?.split(":").pop() ?? "4001", 10);
```

---

### Bug #12: `cache.ts` — upsert always resets `hit_count` to 0 on cache refresh

**File**: `packages/api/src/lib/cache.ts:42-50`
**Severity**: MEDIUM
**Category**: Logic Error

**Issue**: The `cacheUtils.set` function uses `upsert` with `hit_count: 0`. If a cached entry already exists and the underlying error response changes (e.g., the AI is called again for an identical short error — which shouldn't happen by design but could occur if the cache entry expires), the upsert resets `hit_count` to 0, destroying accurate hit count analytics. The `created_at` field is also overwritten to the current time, making it impossible to know when an entry was first cached.

---

### Bug #13: `sidepanel/index.ts` — `renderNewErrors` uses `renderedCount` as an index into a re-sorted array

**File**: `packages/extension/src/sidepanel/index.ts:250-266`
**Severity**: MEDIUM
**Category**: Logic Error

**Issue**: `renderedCount` tracks how many errors have been rendered in append-only mode. When `renderNewErrors` is called in `newest` mode (line 252-259), it appends items from `errors[renderedCount]` onward. But `allErrors` is replaced with the new `errors` array at line 251. If the error store grows by appending (the background worker appends to the array and stores the full list), this works correctly. However, `rerenderFeed` at line 220-231 resets `renderedCount = 0`. If a storage change event fires during the `rerenderFeed` operation (async storage changes can interleave with synchronous JS on the next event loop tick), `renderNewErrors` could be called concurrently, find `renderedCount = 0`, and re-render all errors — causing duplicates in the feed.

In practice this race is unlikely because `rerenderFeed` is synchronous and `renderNewErrors` is called from a Chrome storage event listener (also synchronous), but the state shared between them (`renderedCount`, `allErrors`) creates a fragile coupling.

---

### Bug #14: `inspector.ts` — CSS source map cache uses `any` type and is module-level, persisting across navigations

**File**: `packages/extension/src/content/inspector.ts:255`
**Severity**: MEDIUM
**Category**: Type Mismatch / Resource Leak

**Issue**: `const cssMapCache = new Map<string, any>()` is declared at module level. The content script persists across SPA navigations (it's not re-injected on route changes). If a SPA rebuilds its CSS bundle with a new hash on hot-reload or rebuild, the cache still holds the old parsed source map under the old filename. New CSS files with the same filename (different hash) won't be affected since the key is the filename, but the `findSelectorInSources` function at line 365 uses `cssMapCache.get(cssFilename)` — if the same filename appears with different content after a rebuild, the stale cached map will be used.

More critically, the `any` type means `cssMapCache.get(cssFilename)` returns `any`. At line 366-367, `map.sourcesContent` and `map.sources` are accessed without null/type checks. If a malformed or unexpected source map is cached, this crashes with a runtime TypeError on the next inspector use. The null-set sentinel (`cssMapCache.set(cssFilename, null)`) is checked as `if (!map?.sourcesContent)` which handles the null case, but a map object without `sourcesContent` returns `undefined` (falsy) — that is also handled. The main risk is a source map that has `sourcesContent` as a non-array, which would cause `map.sourcesContent[i]` to throw or return undefined unpredictably.

---

## Summary by Category

| Category | Count |
|---|---|
| Null/Undefined | 1 (Bug #6) |
| Types | 1 (Bug #11, #14) |
| Async | 1 (Bug #5) |
| Logic | 3 (Bug #9, #11, #12, #13) |
| Leaks | 1 (Bug #5, #14) |
| Isolation | 2 (Bug #8, #10) |
| Flow/Ordering | 1 (Bug #4) |
| Idempotency/TOCTOU | 3 (Bug #1, #2, #3) |

---

## Prioritized Fix Order

### Must Fix Now (Production Risk)

1. **Bug #1** — Free tier TOCTOU: users bypass daily decode limits, platform billed for extra AI calls
2. **Bug #2** — Sonnet TOCTOU: users bypass monthly Sonnet limit, expensive AI overage
3. **Bug #4** — Account deletion ordering: partial deletes leave users in unrecoverable state
4. **Bug #3** — Webhook idempotency: Stripe retries corrupt user plan state
5. **Bug #8** — Stripe customer ID not saved: duplicate customers accumulate in Stripe
6. **Bug #9** — Immediate downgrade on first payment failure: paying users lose access during retry window

### Should Fix Soon (User Impact)

7. **Bug #10** — Portal/checkout unguarded Stripe throws: raw Stripe errors leak to logs, user sees generic 500
8. **Bug #6** — Panel null assertion crash on edge-case pages
9. **Bug #11** — Port parsing: `API_URL` as a full URL silently produces NaN port

### Nice to Fix (Code Quality)

10. **Bug #12** — Cache upsert resets hit count analytics
11. **Bug #13** — Error feed renderedCount race condition (low probability)
12. **Bug #14** — CSS source map cache type safety and staleness

---

## What's Working Well

- **Webhook signature verification** is correctly implemented using `stripe.webhooks.constructEventAsync` before any processing
- **Auth middleware** correctly uses a server-side API key lookup rather than trusting client claims; external `AUTH_SUCCESS` messages are validated against the backend before storage
- **Sensitive data detection** before sending to the AI is a solid user-protection pattern
- **Error deduplication** in the background worker (500ms window) is well-implemented
- **Tab cleanup** on `chrome.tabs.onRemoved` correctly clears both the in-memory buffer and storage
- **Cache fire-and-forget** pattern for non-critical operations (`cacheUtils.set`, `increment_sonnet_usage`) is correctly isolated so failures don't block the response
- **Input validation** with valibot on all POST endpoints is consistent and correct
- **DOMPurify** is used on all rendered markdown — XSS is properly contained
- **Path traversal guard** in `web/src/server.ts` is correct (resolves then checks startsWith)
- **PGRST116 error code check** in rate limit middleware correctly distinguishes "row not found" from actual DB errors

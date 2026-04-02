# Performance Analysis Report

**Analyzed**: 2026-04-02
**Scope**: Full codebase — API backend (Hono/Bun/Vercel), Chrome Extension (MV3), shared types
**Issues Found**: 12 (Critical: 1, High: 5, Medium: 5, Low: 1)

---

## [CRITICAL] — Triple sequential DB round-trips on every decode request

**Location**: `packages/api/src/routes/decode.ts:22-77` + `packages/api/src/lib/middleware.ts:21-63`
**Category**: N+1 Query / Blocking
**Current Complexity**: 3 serial DB round-trips per request before the AI call
**Should be**: 1 DB round-trip (or 2 at most, with parallelism)

**Issue**: Every call to `POST /api/decode` executes three sequential Supabase round-trips before the AI call starts:

1. `authMiddleware` — `SELECT id, email, plan, ... FROM users WHERE api_key = ?` (middleware.ts:38)
2. `rateLimitMiddleware` — `supabase.rpc("increment_daily_usage", ...)` (middleware.ts:76)
3. Sonnet limit check — `SELECT sonnet_uses_this_month, sonnet_month FROM users WHERE id = ?` (decode.ts:52)

Steps 1 and 3 hit the `users` table twice for the same user. The `authMiddleware` already fetches the user row but deliberately selects only `id, email, plan, stripe_customer_id, is_admin` — the sonnet fields are excluded. So decode.ts re-queries for `sonnet_uses_this_month` and `sonnet_month` separately.

**Real-World Impact**: At Supabase's typical 5-15ms per query over HTTPS, this adds 15-45ms of serialized DB latency before the AI call even starts. With 500 users at peak, every single decode request pays this overhead. The fix is to add the sonnet columns to the `authMiddleware` select and pass them through context, eliminating the third query entirely. The rate limit RPC call must remain separate (it's an atomic increment), but the auth + sonnet queries can be merged.

**Current Code**:
```ts
// middleware.ts — fetches user WITHOUT sonnet fields
const { data: user } = await supabase
  .from("users")
  .select("id, email, plan, stripe_customer_id, is_admin")
  .eq("api_key", apiKey)
  .single();

// decode.ts — re-fetches the SAME user row for sonnet fields
const { data: userRow } = await supabase
  .from("users")
  .select("sonnet_uses_this_month, sonnet_month")
  .eq("id", user.id)
  .single();
```

**Optimized Solution**: Add `sonnet_uses_this_month, sonnet_month` to the `authMiddleware` select. Extend `AuthUser` to carry those fields. The decode route reads them from `c.get("user")` directly.

**Performance Gain**: Eliminates 1 full DB round-trip (5-15ms) on every sonnet-eligible decode request. At 500 decodes/day that's 2.5-7.5 seconds of cumulative latency saved daily with no code complexity increase.

---

## [HIGH] — `GET /api/usage` makes two sequential DB queries that could be parallel

**Location**: `packages/api/src/routes/usage.ts:8-47`
**Category**: Blocking / Parallelism
**Current Complexity**: 2 serial awaits
**Should be**: 2 parallel awaits via `Promise.all`

**Issue**: The usage endpoint executes two `await supabase.from(...)` calls back-to-back. These are completely independent reads against different tables (`daily_usage` and `users`). There is no reason they run sequentially.

**Current Code**:
```ts
const { data: usage } = await supabase
  .from("daily_usage")
  .select("count")
  .eq("user_id", user.id)
  .eq("date", today)
  .single();

const { data: userRow } = await supabase
  .from("users")
  .select("sonnet_uses_this_month, sonnet_month")
  .eq("id", user.id)
  .single();
```

**Optimized Solution**:
```ts
const [{ data: usage }, { data: userRow }] = await Promise.all([
  supabase.from("daily_usage").select("count").eq("user_id", user.id).eq("date", today).single(),
  supabase.from("users").select("sonnet_uses_this_month, sonnet_month").eq("id", user.id).single(),
]);
```

**Performance Gain**: Cuts the `/api/usage` response time roughly in half for the DB portion. The sidebar calls this on every decode and on page load. At 10ms per query, serial = 20ms minimum DB wait; parallel = 10ms.

---

## [HIGH] — `logDecode` always hardcodes `model_used: "haiku"` regardless of actual model

**Location**: `packages/api/src/routes/decode.ts:130-149`
**Category**: Algorithm (data correctness with performance implication)

**Issue**: The `logDecode` function hardcodes `model_used: "haiku"` on line 143 regardless of which model was actually used. This is not a performance issue in the traditional sense, but it means cost analytics queries against the `decodes` table will always undercount Sonnet costs, potentially causing the operator to miss abuse patterns or cost overruns. The `useModel` variable is available in scope but not passed to `logDecode`.

**Current Code**:
```ts
const logDecode = (
  userId: string, errorHash: string, errorText: string, response: any,
  cacheHit: boolean, inputTokens: number, outputTokens: number,
  costCents: number, responseTimeMs: number
) => {
  supabase.from("decodes").insert({
    // ...
    model_used: "haiku",  // <-- always "haiku", even for Sonnet calls
```

**Real-World Impact**: Silent misattribution of all Sonnet decodes to Haiku in the analytics table. The cost_cents calculation is correct (it uses the real rates), but the `model_used` column is wrong for every Sonnet call. Operators relying on `GROUP BY model_used` to audit costs will see incorrect data.

---

## [HIGH] — `checkSensitiveData` runs 27 independent regex passes per call, called in hot decode path

**Location**: `packages/extension/src/shared/sensitive-check.ts:49-62`
**Category**: Algorithm
**Current Complexity**: O(27 * n) where n = text length — 27 sequential `.match()` calls
**Should be**: Acceptable for the use case, but there is a flag: this is called on every decode, including large (up to 15,000 char) inputs.

**Issue**: `checkSensitiveData` iterates through an array of 27 regex patterns and calls `text.match(regex)` on the full input for each one. None of the regexes are anchored or have early-exit opportunities. On a 15,000 character input (the maximum allowed), this is 27 full string scans.

This is called synchronously in the extension's main thread before every decode request (`sidepanel/index.ts:441-450`, `sidepanel/index.ts:641-651`). Because this is in an extension popup/sidepanel context (single-threaded JS), it blocks the UI thread while scanning.

**Real-World Impact**: For a typical 500-char stack trace this is negligible (< 1ms). For a 15,000-char input, 27 regex scans can take 5-20ms synchronously, creating a noticeable UI freeze during the "Resolving source maps..." phase. Low-severity for typical use but worth noting for the max input size.

**Performance Gain**: Combining all patterns into a single `RegExp` with named groups (`(?<aws_key>AKIA[A-Z0-9]{16})|(?<stripe>...)...`) reduces 27 passes to 1, cutting scan time by ~26x for large inputs. The JS engine can then short-circuit after the first match per group.

---

## [HIGH] — `panel.ts` registers `mousemove` and `mouseup` listeners on `document` permanently during drag and never removes them

**Location**: `packages/extension/src/content/panel.ts:152-170`
**Category**: Memory Leak / Content Script Performance

**Issue**: Inside `createPanel()`, two event listeners are added to `document` — `mousemove` and `mouseup` — for drag-to-resize functionality. These listeners are added once and **never removed**, even when the panel is hidden or when `isDragging` is false. They fire on every mouse event on the host page forever.

```ts
// These are added once and never cleaned up
document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;  // early exit when not dragging, but listener always fires
  // ...
});

document.addEventListener("mouseup", () => {
  if (!isDragging) return;
  // ...
});
```

The `mousemove` handler fires on every pixel of mouse movement across the entire host page for the lifetime of the tab. The handler has a `if (!isDragging) return` guard, so it's cheap per call, but it still invokes a function and does a boolean check on every `mousemove` event. On pages with their own heavy `mousemove` handlers, this creates listener stacking.

The same issue exists in `packages/extension/src/shared/ui.ts:21-32` (`setupResizableGrip`), where `mousemove` and `mouseup` are added to `document` and never cleaned up. This function is called three times for three different grips in `sidepanel/index.ts:17-25`, so there are 3 permanent document-level `mousemove` listeners in the sidepanel iframe.

**Real-World Impact**: Continuous event listener overhead on the host page for the duration of the session. Minor per call, but the content script runs on every page the user visits. On mouse-intensive pages (design tools, maps, games), these listeners fire thousands of times per second.

---

## [HIGH] — `getMatchedCSSRules` in inspector iterates all stylesheet rules synchronously on click, O(N * M) where N = rules, M = elements

**Location**: `packages/extension/src/content/inspector.ts:185-234`
**Category**: Algorithm / Blocking DOM Operation
**Current Complexity**: O(N) CSS rules traversal with O(M) `el.matches()` calls per rule, capped at 500
**Should be**: Capped is fine — but the synchronous blocking nature on the main thread is the concern

**Issue**: When a user clicks an element, `getElementInfo` is called synchronously, which calls `getMatchedCSSRules`. This iterates up to 500 CSS rules across all stylesheets and calls `el.matches(rule.selectorText)` for each. `el.matches()` triggers selector matching in the browser engine — not a trivial operation for complex selectors.

Additionally, `window.getComputedStyle(el)` is called (line 133), which forces a style recalculation. Then `el.getBoundingClientRect()` is called (line 134), which forces a layout flush. These two calls together on an element in a heavy page cause a forced synchronous layout (style + layout reflow), which can be expensive on complex documents.

**Real-World Impact**: On a page using Material UI or Ant Design (thousands of CSS rules), the 500-rule cap may still mean 500 selector matches + a forced layout reflow happening synchronously on the main thread at click time. On a slow device this could produce a 50-200ms freeze on the host page. The cap at 500 was clearly added to mitigate this (good), but the reflow is still unavoidable.

---

## [MEDIUM] — `detectTechStack` makes ~30 `document.querySelector` calls on every invocation — not memoized on SPA navigations that do `pushState`

**Location**: `packages/extension/src/content/tech-detect.ts:18-381`
**Category**: Algorithm / Content Script Performance

**Issue**: `detectTechStack` makes approximately 30+ `document.querySelector` calls, 2 `Array.from(document.querySelectorAll(...))` calls for script/link URLs (assembled into large concatenated strings), and reads/parses a JSON DOM attribute. The result is cached in `cachedTech` — but the cache is only invalidated on `popstate` and `hashchange` events (lines 15-16), not on `pushState`-based navigation (which is how React Router, Vue Router, Next.js, etc. navigate).

This means on a React/Next.js SPA, the cache never invalidates naturally and `detectTechStack` returns stale data after any client-side navigation that doesn't trigger `popstate`. The first call is the expensive one (30+ queries), but subsequent calls are cached. The real issue is the cache invalidation gap.

Also, `detectTechStack` is called a second time synchronously inside the `GET_PAGE_CONTEXT` message handler (`content/index.ts:46`) — bypassing the cache only if `cachedTech` happens to be null. If a `GET_PAGE_CONTEXT` message arrives before tech detection runs, it triggers the full expensive scan inline in the message handler.

**Real-World Impact**: 30+ DOM queries is fast (< 2ms on most pages), but it happens on every page load (delayed 1500ms in `index.ts:22`), every `GET_PAGE_CONTEXT` message, and on `popstate`. The issue is not performance cost per call but correctness of cached results after SPA navigation that uses `history.pushState`.

---

## [MEDIUM] — `resolveCSSSourceMaps` in inspector fetches CSS source maps sequentially rather than in parallel

**Location**: `packages/extension/src/content/inspector.ts:257-291`
**Category**: Blocking / Parallelism

**Issue**: The CSS source map resolution loop fetches maps for each unique stylesheet URL sequentially:

```ts
for (const sheetFile of sheetUrls) {
  try {
    const sources = await getCSSSourceFiles(sheetFile);  // sequential fetch
    // ...
  }
}
```

On a page with 3 bundled stylesheets, this fires 3 serial fetches (each potentially downloading a large .map file) when they could all run concurrently with `Promise.all`.

**Real-World Impact**: If each map fetch takes 50ms (small CDN file), 3 sheets = 150ms serial vs ~50ms parallel. The 3-second timeout in the click handler (`inspector.ts:107`) means the user experiences a 3s wait before the basic element info is shown. Parallel fetching would help responsiveness under that timeout.

---

## [MEDIUM] — `sourcemap.ts` decodes VLQ mappings sequentially for each frame with `decodedCache` scoped to content script — works correctly but cold start decodes are CPU-bound and block main thread

**Location**: `packages/extension/src/content/sourcemap.ts:241-278`
**Category**: Algorithm / Blocking DOM

**Issue**: `decodeMappings` is a synchronous, CPU-bound operation. For a large webpack bundle, the `mappings` field in a source map can be several megabytes of VLQ-encoded data. The function decodes it with a nested loop: outer loop over `;`-separated lines, inner loop over `,`-separated segments, with bitwise VLQ decoding per segment. This runs synchronously on the content script's main thread.

The `decodedCache` (line 27) correctly caches the decoded result per URL, so only the first call per URL pays this cost. However, the first call for a large bundle (e.g., a Next.js app with a 2MB+ `_app.js.map`) will block the main thread for potentially 100-500ms during the decode step.

**Real-World Impact**: Users on large production apps may notice a brief freeze during the first source map resolution. Subsequent resolves are instant (cache hit). The 5-second timeout in the sidepanel (`sidepanel/index.ts:394`) means the UI won't hang indefinitely, but the freeze is real on the first call.

**Note**: Moving this to a Web Worker would fully solve the issue but requires architectural changes. Escalating this specific sub-point if worker threads are considered.

---

## [MEDIUM] — `panel.ts` registers a `message` event listener on `window` inside `createPanel()` — listener is never removed and fires on every `postMessage` to the host page

**Location**: `packages/extension/src/content/panel.ts:176-180`
**Category**: Memory Leak / Content Script Performance

**Issue**: Inside `createPanel()`:

```ts
window.addEventListener("message", (event) => {
  if (event.data?.type === "ERRORDECODER_CLOSE") {
    hidePanel();
  }
});
```

This listener is added once on `createPanel()` and never removed. It fires on every `window.postMessage` sent to the page — including messages from other iframes, analytics SDKs, Intercom, Stripe.js, etc. Pages with heavy use of `postMessage` (OAuth flows, payment iframes, chat widgets) will trigger this listener frequently.

**Real-World Impact**: Low overhead per call (single property check), but it's an unnecessary permanent listener that compounds with the `mousemove` listeners described above.

---

## [MEDIUM] — `checkout.ts` fetches ALL Stripe prices on every checkout initiation — no caching

**Location**: `packages/api/src/routes/checkout.ts:27-44`
**Category**: Blocking / Missing Cache

**Issue**: Every call to `POST /api/checkout` fetches the full price list from Stripe:

```ts
const prices = await stripe.prices.list({
  active: true,
  limit: 10,
  expand: ["data.product"],
});
```

This is an external HTTP call to Stripe's API on every checkout attempt. The product/price configuration changes very rarely (only when `stripe:setup` is re-run). Fetching this live on every checkout adds ~150-300ms of Stripe API latency to the checkout flow and creates a dependency: if Stripe's API has elevated latency, checkout is slower.

**Real-World Impact**: At the current scale this is fine — checkout is not a hot path. However, the price IDs are static configuration that never changes at runtime. They should be stored in environment variables at setup time and read directly, eliminating the Stripe API call entirely from the checkout path.

---

## [LOW] — `relay.ts` sends a `chrome.runtime.sendMessage` for every console error/warning without any throttling or batching at the relay level

**Location**: `packages/extension/src/content/relay.ts:8-16`
**Category**: Content Script Performance

**Issue**: The relay sends a `chrome.runtime.sendMessage` for every `errordecoder-error` CustomEvent synchronously. On pages with noisy console output (e.g., React development mode warnings, verbose analytics SDKs), this can mean hundreds of `sendMessage` calls per second.

The background worker (`background/index.ts`) does deduplicate at 500ms windows (line 176) and batch-flushes to storage with a 100ms debounce (line 163-167). However, the overhead of `chrome.runtime.sendMessage` itself — which involves IPC to the service worker — exists for every event before the background dedup runs.

**Real-World Impact**: On a React dev-mode page with console warnings from every render, this can generate 5-50 `sendMessage` calls/second. Chrome's extension IPC is not free. A 50ms debounce at the relay level (batching multiple errors into one `sendMessage`) would reduce IPC calls by ~50-100x on noisy pages with negligible impact on error capture latency.

---

## Summary by Category

| Category | Count |
|---|---|
| N+1 Queries | 1 |
| Blocking / Parallelism | 4 |
| Algorithm | 3 |
| Memory Leak (Content Script) | 2 |
| Missing Cache | 1 |
| Data Correctness | 1 |

---

## Priority

### Fix Now (Production Risk)

1. **Triple sequential DB round-trips on decode** (`decode.ts` + `middleware.ts`) — adds 15-45ms to every decode request. Fix by merging the auth + sonnet field queries.
2. **`logDecode` hardcodes `model_used: "haiku"`** — silently corrupts analytics data for all Sonnet calls. Easy one-line fix.
3. **Sequential DB queries in `/usage`** — easy `Promise.all` conversion, cuts response time in half.

### Fix Soon (User Impact)

4. **Permanent `mousemove` listeners on document** in `panel.ts` and `ui.ts` — causes continuous overhead on every page the extension is active on. Convert to add-on-mousedown / remove-on-mouseup pattern.
5. **`getMatchedCSSRules` forced layout reflow** in `inspector.ts` — unavoidable but the `getComputedStyle` + `getBoundingClientRect` sequence forces style + layout on the host page. Consider batching reads before writes.
6. **`resolveCSSSourceMaps` sequential fetches** — convert inner loop to `Promise.all(Array.from(sheetUrls).map(...))`.

### Nice to Have (Optimization)

7. **`checkSensitiveData` single-pass regex** — combine 27 patterns into one alternation regex for large inputs.
8. **`detectTechStack` `pushState` cache invalidation** — add `history.pushState` monkey-patch to clear `cachedTech` on SPA navigations.
9. **`relay.ts` batching** — debounce `sendMessage` by 50ms to reduce IPC on noisy pages.
10. **`checkout.ts` price lookup** — store price IDs in env vars at setup time instead of fetching from Stripe on every checkout.
11. **`panel.ts` `message` listener** — remove it on `hidePanel`, re-add on `showPanel`.

---

## What's Already Performant

- **Background error buffer with debounced flush** (`background/index.ts:156-182`): The 100ms debounce for storage writes and per-tab 50-error cap are well-designed. Prevents storage thrashing on noisy pages.
- **Inspector `requestAnimationFrame` for overlay positioning** (`inspector.ts:66-78`): Correctly batches overlay position updates inside rAF, avoiding layout thrashing on every `mousemove`.
- **Source map caching** (`sourcemap.ts:23-26`, `inspector.ts:254`): Both in-memory Maps prevent redundant network fetches and expensive VLQ decoding after the first call.
- **Response cache with `isCacheable` heuristic** (`cache.ts`): The length + file-path heuristic is lightweight and correctly avoids caching unique stack traces. The fire-and-forget `increment_cache_hit` RPC is correct — no need to await a counter increment.
- **Sonnet counter update as fire-and-forget** (`decode.ts:111`): The Sonnet RPC increment is correctly non-blocking — the user doesn't need to wait for a counter write.
- **Auth middleware single-query design**: Looking up by API key in one query with `is_admin` inline is clean and avoids a second trip for permission checks.
- **CSS rule scan cap at 500** (`inspector.ts:192`): Correct mitigation for MUI/Ant Design pages with thousands of rules.
- **VLQ decode lookup table** (`sourcemap.ts:205-207`): Pre-building the `Uint8Array(128)` lookup instead of `indexOf` on the charset string is the right approach — O(1) vs O(64) per character.

# Performance Analysis Report

**Analyzed**: 2026-04-02
**Scope**: Full codebase — `packages/api/src/` (routes, lib), `packages/extension/src/` (background, content scripts, sidepanel, shared), `packages/web/src/`
**Issues Found**: 13 (Critical: 2, High: 5, Medium: 6)

---

## [CRITICAL] — Two sequential DB round-trips on every authenticated API request

**Location**: `packages/api/src/lib/middleware.ts:25–108`
**Category**: N+1 Query / Blocking

**Issue**: Every request to `/decode`, `/usage`, `/feedback`, `/checkout`, `/portal`, and `/account` runs `authMiddleware` then `rateLimitMiddleware` back-to-back. That is two sequential Supabase (Postgres over the internet) queries before the handler runs:

1. `authMiddleware`: `SELECT id, email, plan, stripe_customer_id, is_admin, sonnet_uses_this_month, sonnet_month FROM users WHERE api_key = ?`
2. `rateLimitMiddleware` (free users): `SELECT count FROM daily_usage WHERE user_id = ? AND date = ?`

These are sequential because `rateLimitMiddleware` is registered as a separate middleware and only runs after `authMiddleware` completes. The `daily_usage` query is also already available for free — it could be joined into the first query, or the usage count could be embedded in the users row, eliminating the second round-trip entirely.

**Real-World Impact**: At 100–200 ms per Supabase round-trip (Vercel edge → Supabase), every decode request pays 200–400 ms in middleware overhead before any AI work starts. For a tool whose main value proposition is speed, this is a meaningful degradation. At scale it also doubles database connection pressure.

**Current Code**:
```typescript
// middleware.ts — two separate queries, run sequentially via middleware chain
// Query 1 (authMiddleware):
const { data: user } = await supabase.from("users").select("...").eq("api_key", apiKey).single();
// Query 2 (rateLimitMiddleware, separate middleware):
const { data: usage } = await supabase.from("daily_usage").select("count").eq("user_id", ...).eq("date", today).single();
```

**Optimized Solution**: Combine into a single query using a Postgres join or RPC. The users row is the source of truth; daily usage can be stored as a denormalized column (`daily_decode_count`, `daily_decode_date`) on users, updated atomically by the same `increment_daily_usage` RPC. One query replaces two.

**Performance Gain**: Eliminates one network round-trip per request — 100–200 ms reduction in P50 latency for free-tier users, which is the majority of traffic.

---

## [CRITICAL] — `stripe.prices.list` called on every checkout request — no caching

**Location**: `packages/api/src/routes/checkout.ts:27–44`
**Category**: Blocking / False Optimization

**Issue**: Every call to `POST /checkout` makes a live Stripe API call to list all active prices, then does an in-memory `Array.find()` over the result. Stripe prices don't change unless you explicitly edit them. Calling `stripe.prices.list()` on every checkout request means:

- An extra external HTTP call to Stripe on the critical path where the user is actively trying to pay.
- If Stripe has elevated latency or a brief outage, checkout fails entirely.
- The price IDs are static configuration — they never change between requests.

**Real-World Impact**: Stripe API P99 latency can reach 500–1000 ms. This adds that latency to every checkout attempt. Stripe rate limits are also per-account; high-volume checkout traffic wastes quota.

**Current Code**:
```typescript
// Called fresh on every POST /checkout
const prices = await stripe.prices.list({ active: true, limit: 10, expand: ["data.product"] });
const price = prices.data.find(p => p.metadata.app === "error-decoder" && p.metadata.interval === interval);
```

**Optimized Solution**: Cache the price IDs at module load time (process start). Since this is serverless, cache them in a module-level variable on cold start. A simple `const priceCache = { month: "price_xxx", year: "price_yyy" }` populated once via an init call, or hardcoded after the `stripe:setup` script runs and IDs are known. Price IDs are stable across the lifetime of the product.

**Performance Gain**: Eliminates one Stripe API call (100–500 ms) from the checkout critical path. Reduces checkout failure surface during Stripe slowdowns.

---

## [HIGH] — `detectTechStack()` called twice per `GET_PAGE_CONTEXT` message — module cache bypassed on first call

**Location**: `packages/extension/src/content/index.ts:44–52`, `packages/extension/src/content/tech-detect.ts:18–381`
**Category**: Algorithm / Blocking

**Issue**: The content script calls `detectTechStack()` in two places:

1. In `runTechDetection()` after page load (1500 ms delay) — result is cached in `cachedTech`.
2. In the `GET_PAGE_CONTEXT` message handler — called synchronously again.

The `GET_PAGE_CONTEXT` handler runs on demand. If it fires before the 1500 ms delayed `runTechDetection()` completes (which is likely for fast decode flows), `cachedTech` is `null` and the full detection scan runs inline on the message handler. This is the expensive path.

`detectTechStack()` itself does:
- Multiple `document.querySelector()` calls (40+ selectors)
- `Array.from(document.querySelectorAll("script[src]"))` — iterates all script elements
- `Array.from(document.querySelectorAll("link[href]"))` — iterates all link elements
- String concatenation of all src/href values
- 80+ `String.includes()` checks on the concatenated string

On a page with 50 script tags and 20 link tags, this is non-trivial DOM work running synchronously in a content script on every user-triggered decode.

**Real-World Impact**: On script-heavy pages (React SPA with 20+ chunks, analytics-heavy marketing sites), this adds tens of milliseconds of synchronous DOM work blocking the decode flow. Content scripts share the renderer's main thread.

**Current Code**:
```typescript
// content/index.ts:44 — GET_PAGE_CONTEXT handler, no cache check
if (message.type === "GET_PAGE_CONTEXT") {
  const tech = detectTechStack(); // Full scan if cache is cold
  sendResponse({ url: ..., domain: ..., tech, isDev: ... });
}
```

**Optimized Solution**: Eagerly populate the cache at `document_idle` (which is when the content script already runs), not behind a 1500 ms timer. The timer exists to wait for main-world globals, but the `GET_PAGE_CONTEXT` handler should return the cached result from the initial detection, not re-run the scan.

**Performance Gain**: Eliminates redundant O(n) DOM scan on the decode hot path; saves 10–50 ms of synchronous renderer work on script-heavy pages.

---

## [HIGH] — `checkSensitiveData()` runs 27 regexes sequentially on every decode — no short-circuit

**Location**: `packages/extension/src/shared/sensitive-check.ts:49–62`
**Category**: Algorithm

**Issue**: `checkSensitiveData()` is called before every decode and every inspect query. It runs 27 regex patterns against the input string sequentially, with no early exit. Most inputs are benign (no secrets) so all 27 regexes always run to completion. Some patterns are complex (`aws.{0,10}secret.{0,10}[=:]\s*["']?[A-Za-z0-9/+=]{40}`) and use unbounded quantifiers.

For the common case of a 500-character stack trace with no secrets, the function runs 27 `String.match()` calls and collects zero results. This happens synchronously before every API call.

**Current Code**:
```typescript
for (const { type, regex } of patterns) {
  const match = text.match(regex); // No early exit, all 27 run
  if (match && !seen.has(type)) { ... }
}
```

**Real-World Impact**: Minor for short inputs, but for Pro users sending 15,000-character error logs, complex regex backtracking on long strings can take 1–5 ms per pattern. 27 patterns × worst case = potentially 50–100 ms of synchronous blocking in the extension popup before the API call even starts.

**Optimized Solution**: For inputs under ~200 characters (the common case for simple errors), skip the full scan after a quick `includes()` check for known key prefixes (`AKIA`, `sk-`, `ghp_`, `Bearer`, `password=`). Only run the full 27-pattern scan when at least one prefix is present.

**Performance Gain**: For ~80% of inputs (short stack traces without credentials), reduces sensitive check from 27 regex executions to ~6 fast `includes()` checks — roughly 10x faster in the common case.

---

## [HIGH] — `getMatchedCSSRules()` iterates all stylesheets and rules on every element click — O(S×R) with hard cap but no index

**Location**: `packages/extension/src/content/inspector.ts:185–235`
**Category**: Algorithm

**Issue**: `getMatchedCSSRules()` is called on every element click during inspector mode. It iterates over every loaded stylesheet, and within each stylesheet iterates over every CSS rule, calling `el.matches(rule.selectorText)` for each. `el.matches()` is a full selector engine call per rule — not a hash lookup.

The cap is 500 total rules. On MUI or Ant Design pages, stylesheets can have thousands of rules. The cap prevents a complete runaway but still allows up to 500 `el.matches()` calls in the worst case. This is all synchronous DOM work on click.

**Current Code**:
```typescript
for (const sheet of document.styleSheets) {
  for (const rule of rules) {
    if (ruleCount++ > 500) break;
    if (rule instanceof CSSStyleRule) {
      if (el.matches(rule.selectorText)) { ... } // Full selector match per rule
    }
  }
}
```

**Real-World Impact**: On a React/MUI app with 3–5 stylesheets and hundreds of rules, this is 300–500 synchronous `el.matches()` calls. Each call forces style recalculation. On a low-powered laptop this can cause a perceptible 50–200 ms freeze on click.

**Performance Gain**: The cap prevents the worst case, but reducing it to 100–150 rules and returning earlier would cut worst-case time by 3–5x without meaningfully degrading match quality.

---

## [HIGH] — `resolveSourceMaps()` resolves stack frames sequentially — async I/O that could be parallel

**Location**: `packages/extension/src/content/sourcemap.ts:49–53`
**Category**: False Optimization

**Issue**: Stack frames are resolved one at a time in a `for` loop, even though each frame involves independent network fetches (fetch the JS bundle, fetch the `.map` file). Up to 5 frames are resolved. If each frame's source map isn't cached, that is up to 10 sequential network fetches.

**Current Code**:
```typescript
// Sequential — each frame waits for the previous
for (const frame of frames.slice(0, 5)) {
  const result = await resolveFrame(frame.url, frame.line, frame.col);
  resolved.push({ frame, resolved: result });
}
```

**Real-World Impact**: With 5 unique script URLs and no cache, this is 5 sequential pairs of fetch calls. At 50–100 ms per fetch, that is 500–1000 ms of added latency before the decode API call. The sidepanel already has a 5-second timeout on this operation, so in the worst case the user waits the full 5 seconds.

**Optimized Solution**: Use `Promise.all()` for the frame resolution — all 5 frames can be resolved concurrently since they are independent. The map cache is already correct for deduplication of repeated URLs.

**Performance Gain**: Reduces worst-case source map resolution from ~1000 ms (5 frames × 200 ms) to ~200 ms (all 5 in parallel). For stack traces with repeated script URLs (common in bundled apps), cache hits keep this near zero anyway.

---

## [HIGH] — `logDecode()` is awaited on the critical path — blocks response for a non-critical DB write

**Location**: `packages/api/src/routes/decode.ts:113`
**Category**: Blocking

**Issue**: After the AI response is received, `logDecode()` is awaited before the response is sent to the user. This inserts a full Supabase `INSERT` round-trip (100–200 ms) into the user-facing latency. The decode ID returned by `logDecode()` is used to enable feedback buttons, but feedback is optional and best-effort.

**Current Code**:
```typescript
// Awaited — user waits for DB insert before seeing their AI response
const decodeId = await logDecode(user.id, errorHash, errorText, markdown, useModel, false, inputTokens, outputTokens, costCents, responseTimeMs);
return c.json({ data: { markdown, model: useModel, cached: false, decodeId } });
```

**Real-World Impact**: Users wait an extra 100–200 ms on every non-cached decode for a DB insert that has no bearing on the AI result they are waiting for. At AI latency of 1–3 seconds, this is a 5–15% increase in perceived response time.

**Optimized Solution**: Fire the log write async (fire-and-forget) and generate the `decodeId` client-side using a UUID, or generate the UUID server-side before the insert and return it immediately. The insert can then run after the response is sent.

```typescript
const decodeId = crypto.randomUUID();
logDecode(decodeId, user.id, ...).catch(() => {}); // fire-and-forget
return c.json({ data: { markdown, model: useModel, cached: false, decodeId } });
```

**Performance Gain**: Removes 100–200 ms from every non-cached decode response. This is pure latency saved with zero trade-off — feedback is already best-effort.

---

## [MEDIUM] — `usageRoute` queries `users` table redundantly — data already fetched by `authMiddleware`

**Location**: `packages/api/src/routes/usage.ts:13–16`
**Category**: N+1 Query

**Issue**: `GET /usage` runs `authMiddleware`, which fetches `sonnet_uses_this_month` and `sonnet_month` from the `users` table. Then the usage handler immediately queries `users` again for those same two columns (`sonnet_uses_this_month`, `sonnet_month`). The user object is already attached to the context by `authMiddleware`.

**Current Code**:
```typescript
// authMiddleware already fetched sonnet_uses_this_month, sonnet_month into c.get("user")
// But usage route queries users again:
const [{ data: usage }, { data: userRow }] = await Promise.all([
  supabase.from("daily_usage").select("count").eq("user_id", user.id).eq("date", today).single(),
  supabase.from("users").select("sonnet_uses_this_month, sonnet_month").eq("id", user.id).single(), // redundant
]);
```

**Real-World Impact**: Every `/usage` call (fired on sidepanel load and after every decode) makes two parallel Supabase queries when it could make one. The second is wasted work — `user.sonnetUsesThisMonth` and `user.sonnetMonth` are already on the context.

**Optimized Solution**: Remove the `users` re-query. Read `user.sonnetUsesThisMonth` and `user.sonnetMonth` from `c.get("user")` which `authMiddleware` already populated.

**Performance Gain**: Eliminates one DB query per `/usage` call. `/usage` is called once on sidebar open and once after every decode — meaningful cumulative savings.

---

## [MEDIUM] — History `loadHistory()` called twice on every decode — double storage read

**Location**: `packages/extension/src/sidepanel/index.ts:657–658`, `packages/extension/src/sidepanel/history.ts:20–25`
**Category**: Algorithm

**Issue**: After a successful decode, the code calls `saveToHistory(entry)` and then immediately calls `populateHistoryDropdown()`. `saveToHistory()` calls `loadHistory()` internally to prepend the new entry, and `populateHistoryDropdown()` also calls `loadHistory()` to repopulate the UI. This is two sequential `chrome.storage.session.get()` calls for the same key.

**Current Code**:
```typescript
await saveToHistory(entry);      // internally calls loadHistory() → storage read
await populateHistoryDropdown(); // internally calls loadHistory() → second storage read
```

**Real-World Impact**: `chrome.storage` is async IPC to the browser process. Two sequential calls add 2–10 ms of unnecessary latency after every decode. Minor but unnecessary.

**Optimized Solution**: `saveToHistory()` could return the updated history array. `populateHistoryDropdown()` could accept an optional pre-loaded history array, skipping the re-read.

---

## [MEDIUM] — `renderErrorItem()` calls `errorFeed.scrollTop = errorFeed.scrollHeight` on every item — forced layout per item

**Location**: `packages/extension/src/sidepanel/index.ts:316`
**Category**: DOM Manipulation

**Issue**: Inside `renderErrorItem()`, which is called in a loop for every error in `renderNewErrors()`, the code reads `errorFeed.scrollHeight` (which forces a layout/reflow) and then sets `scrollTop`. This runs once per error item rendered. If 50 errors arrive at once (the max buffer size), this is 50 forced reflows in a loop.

**Current Code**:
```typescript
const renderErrorItem = (err: CapturedError, index: number) => {
  // ... build and append item ...
  errorFeed.scrollTop = errorFeed.scrollHeight; // forced layout on every item
};
```

**Real-World Impact**: Reading `scrollHeight` after a DOM mutation forces the browser to flush pending layout. In a loop of 50, this is 50 sequential layout flushes. The initial load of a full error buffer (50 items) could stutter visibly in the sidepanel.

**Optimized Solution**: Scroll once after the loop completes, not inside the loop. Move the scroll call to `renderNewErrors()` after all items are appended.

---

## [MEDIUM] — `populateHistoryDropdown()` rebuilds the entire `<select>` innerHTML on every decode

**Location**: `packages/extension/src/sidepanel/index.ts:738–758`
**Category**: DOM Manipulation

**Issue**: `populateHistoryDropdown()` is called after every decode. It sets `select.innerHTML = ""` (wiping and re-parsing), then appends up to 10 `<option>` elements. The full DOM subtree is destroyed and rebuilt each time, even though only one new entry was added (the newest decode).

**Current Code**:
```typescript
select.innerHTML = `<option value="">Recent decodes...</option>`; // destroy + parse
history.forEach((entry) => {
  const option = document.createElement("option");
  // ... build option ...
  select.appendChild(option);
});
```

**Real-World Impact**: Minor for a 10-item list, but it causes unnecessary style recalculations and DOM garbage collection on every decode. In a session with frequent decoding this compounds.

**Optimized Solution**: Prepend a single new `<option>` at position 1 (after the placeholder) and remove the last option if `history.length >= MAX_ENTRIES`. No full rebuild needed.

---

## [MEDIUM] — `detectGlobals()` runs twice at page load — once immediately, once after 1000 ms

**Location**: `packages/extension/src/capture/main-world.ts:174–180`
**Category**: Algorithm

**Issue**: The main-world capture script calls `detectGlobals()` twice:

1. Immediately (if `readyState !== "loading"`) or on `DOMContentLoaded`.
2. Again after a `setTimeout(detectGlobals, 1000)`.

The 1000 ms delay is to catch late-initializing frameworks (React, Vue, etc.). But if the page is already loaded when the script runs, `detectGlobals()` executes immediately AND then again after 1 second. The second run overwrites the same DOM attribute. This is harmless but wasteful — it runs the full global inspection loop twice and serializes + sets a DOM attribute twice.

**Current Code**:
```typescript
setTimeout(detectGlobals, 1000);           // run 1 — always
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", detectGlobals); // run 2a — only if loading
} else {
  detectGlobals(); // run 2b — immediately if already loaded, so TWO runs always happen
}
```

**Real-World Impact**: Low. The double execution is fast. But it does mean the DOM attribute is set twice and the global inspection code (30+ property accesses) runs twice on already-loaded pages.

---

## [MEDIUM] — `new Date().toISOString()` called twice in `decode.ts` for Sonnet month check

**Location**: `packages/api/src/routes/decode.ts:54, 108`
**Category**: Algorithm

**Issue**: `new Date().toISOString().slice(0, 7)` is computed at line 54 (for the Sonnet limit check) and again at line 108 (for the `increment_sonnet_usage` RPC call). These are two separate `Date` constructor + `toISOString()` calls that could cross a month boundary between them (practically impossible but indicative of the pattern). More importantly, it is redundant computation.

**Current Code**:
```typescript
// Line 54
const currentMonth = new Date().toISOString().slice(0, 7);
// ... 50 lines later...
// Line 108
const currentMonth = new Date().toISOString().slice(0, 7); // recomputed
supabase.rpc("increment_sonnet_usage", { p_user_id: user.id, p_month: currentMonth })
```

**Real-World Impact**: Trivially minor. Flagged for completeness — this is the definition of redundant computation, even if the cost is nanoseconds.

---

## Summary by Category

| Category | Count |
|---|---|
| N+1 queries | 2 |
| Algorithms | 4 |
| Blocking | 3 |
| False optimizations | 1 |
| DOM manipulation | 2 |
| Redundant computation | 1 |

---

## Priority

### Fix Now (Production Risk)

1. **Sequential DB queries in middleware** (`middleware.ts`) — every request pays 200–400 ms in DB overhead before the AI call. Most impactful latency issue in the system.
2. **`logDecode()` awaited on critical path** (`decode.ts:113`) — blocks AI response delivery for a non-critical DB write. Easy fix, immediate UX improvement.
3. **Stripe `prices.list` on every checkout** (`checkout.ts:27`) — synchronous external API call on the payment critical path with no caching.

### Fix Soon (User Impact)

4. **Sequential source map frame resolution** (`sourcemap.ts:49`) — easy `Promise.all()` swap, cuts worst-case source map resolution from ~1s to ~200ms.
5. **`detectTechStack()` double-scan on `GET_PAGE_CONTEXT`** (`content/index.ts:44`) — redundant DOM scan on every decode if the cache hasn't been populated yet.
6. **`usageRoute` re-queries `users` table** (`usage.ts:15`) — auth middleware already fetched this data; second query is pure waste.
7. **`checkSensitiveData()` no short-circuit** (`sensitive-check.ts:49`) — runs all 27 regexes on every decode including clean inputs.

### Nice to Have (Optimization)

8. **`renderErrorItem()` scroll forced layout in loop** (`sidepanel/index.ts:316`) — move scroll call outside the render loop.
9. **`populateHistoryDropdown()` full DOM rebuild** (`sidepanel/index.ts:738`) — prepend one option instead of rebuilding.
10. **`detectGlobals()` double execution** (`main-world.ts:174`) — minor, runs twice on already-loaded pages.
11. **History `loadHistory()` double storage read** (`history.ts` / `sidepanel/index.ts:657`) — one extra async IPC call per decode.
12. **`getMatchedCSSRules()` cap at 500 rules** (`inspector.ts:203`) — cap is appropriate but could be tighter.
13. **Redundant `currentMonth` computation** (`decode.ts:54,108`) — trivial, extract to a variable.

---

## What's Already Performant

- **Error buffer with debounced flush** (`background/index.ts:164–191`): The in-memory buffer + 100ms debounce before `chrome.storage.session.set` is correct. Avoids hammering storage on rapid error bursts (e.g., a React component throwing on every render).
- **VLQ decode cache** (`sourcemap.ts:92–95`): Caching the decoded mapping segments separately from the raw source map is correct. VLQ decoding is O(n) over the mappings string which can be large; caching it per script URL is the right call.
- **Response cache with `isCacheable` heuristic** (`cache.ts:17–23`): Correctly limits caching to short, non-path-specific errors. The 200-character limit and file path regex are well-calibrated.
- **Fire-and-forget for non-critical writes** (`decode.ts:103, 117`): The `cacheUtils.set()` and `increment_daily_usage` RPC are correctly fire-and-forget. The same pattern should be extended to `logDecode`.
- **CSS source map cache** (`inspector.ts:255`): `cssMapCache` correctly deduplicates repeated fetches of the same stylesheet map within a session.
- **Error deduplication window** (`background/index.ts:184`): The 500ms dedup window prevents storage thrash from rapidly repeating errors (e.g., infinite error loops).
- **`Promise.all()` for parallel queries in `usageRoute`** (`usage.ts:13`): The `daily_usage` and `users` queries run in parallel — correct pattern. The `users` query is the redundant one (addressed above), but the parallelism itself is right.
- **RAF-gated overlay updates in inspector** (`inspector.ts:66–78`): Using `requestAnimationFrame` to debounce mousemove overlay updates is correct; avoids layout thrash on rapid mouse movement.
- **Tab-scoped error storage** (`background/index.ts:161`): Separate `Map<tabId, errors[]>` per tab prevents cross-tab state pollution and bounds memory usage correctly.

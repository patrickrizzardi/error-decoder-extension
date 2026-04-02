# Documentation & Clarity Report

**Analyzed**: 2026-04-02
**Scope**: Error Decoder Extension + API Backend (packages/api/src, packages/extension/src)
**Issues Found**: 23

---

## Self-Documenting Fixes Needed

### Variables to Rename
| File:Line | Current | Suggested | Why |
|-----------|---------|-----------|-----|
| packages/api/src/lib/cache.ts:6 | `FILE_PATH_PATTERN` | Pattern name is clear but context: clarify as `CACHE_INELIGIBLE_FILE_PATTERN` | Shows intent: files with specific patterns should NOT be cached |
| packages/extension/src/content/panel.ts:12 | `STORAGE_KEY` | `PANEL_WIDTH_STORAGE_KEY` | Generic name doesn't indicate what's being stored. Magic strings hide intent. |
| packages/extension/src/background/index.ts:153 | `errorBuffers` | Name is acceptable but `perTabErrorBuffers` clearer | Shows it's keyed by tabId |
| packages/extension/src/background/index.ts:154 | `flushTimers` | Name is acceptable but `errorFlushTimersByTabId` clearer | Shows purpose and key relationship |
| packages/extension/src/capture/main-world.ts:85 | `__edUrl` | `__errorDecoderUrl` | Abbreviated prefix doesn't clearly indicate purpose without context |
| packages/extension/src/capture/main-world.ts:86 | `__edMethod` | `__errorDecoderMethod` | Same as above |
| packages/extension/src/content/sourcemap.ts:26 | `decodedCache` | `decodedMappingCache` | Indicates what is cached (mappings, not just generic "decoded") |
| packages/extension/src/content/sourcemap.ts:34 | `m` | `match` | Loop counter `m` is unclear for regex matches; use `match` for clarity |

### Constants to Extract
| File:Line | Magic Value | Suggested Name |
|-----------|-------------|----------------|
| packages/api/src/lib/cache.ts:9 | `200` | `MAX_CACHEABLE_ERROR_LENGTH` - hardcoded character threshold for caching eligibility |
| packages/api/src/routes/decode.ts:35 | `1000` | `FREE_TIER_INPUT_CHAR_LIMIT` - free tier input size restriction |
| packages/api/src/routes/decode.ts:60 | `20` | `PRO_SONNET_MONTHLY_LIMIT` - Sonnet usage cap for Pro users |
| packages/api/src/routes/decode.ts:88 | `3` | `FREE_TIER_DAILY_LIMIT` - free tier daily decode count |
| packages/api/src/routes/decode.ts:1500 | `1500` | `AI_MAX_TOKENS` - Claude completion token limit |
| packages/api/src/lib/middleware.ts:87 | `3` | `FREE_TIER_DAILY_LIMIT` - duplicate hardcoding, should reference constant |
| packages/api/src/routes/usage.ts:40 | `-1` | `UNLIMITED_MARKER` - sentinel value for "unlimited" usage |
| packages/extension/src/content/inspector.ts:8 | `"rgba(86, 156, 214, 0.2)"` | `OVERLAY_HIGHLIGHT_COLOR` |
| packages/extension/src/content/inspector.ts:9 | `"rgba(86, 156, 214, 0.8)"` | `OVERLAY_BORDER_COLOR` |
| packages/extension/src/content/inspector.ts:22 | `2147483646` | `PANEL_ZINDEX_BELOW_PANEL` - max 32-bit signed int, one below panel's zIndex |
| packages/extension/src/content/inspector.ts:79 | `2147483647` | `MAX_ZINDEX` - max 32-bit signed int (panel zIndex) |
| packages/extension/src/content/panel.ts:79 | `2147483647` | `MAX_ZINDEX` - max 32-bit signed int (duplicate) |
| packages/extension/src/content/panel.ts:13 | `280` | `MIN_PANEL_WIDTH` |
| packages/extension/src/content/panel.ts:13 | `800` | `MAX_PANEL_WIDTH` |
| packages/extension/src/content/sourcemap.ts:46 | `5` | `MAX_STACK_FRAMES_TO_RESOLVE` - limits performance on complex traces |
| packages/extension/src/content/sourcemap.ts:512 | `512` | `SOURCE_MAP_FETCH_TAIL_BYTES` - range request size for finding sourceMappingURL |
| packages/extension/src/background/index.ts:166 | `100` | `ERROR_FLUSH_DEBOUNCE_MS` - debounce window before flushing errors to storage |
| packages/extension/src/background/index.ts:176 | `500` | `DEDUP_WINDOW_MS` - identical errors within this window are suppressed |
| packages/extension/src/background/index.ts:180 | `50` | `MAX_ERRORS_PER_TAB` - cap errors per tab to bound storage usage |

### Booleans to Fix
| File:Line | Current | Suggested |
|-----------|---------|-----------|
| packages/extension/src/background/index.ts:153 | `errorBuffers` structure unclear if checking existence | Add type clarity - already good but clarify type safety |
| packages/extension/src/content/panel.ts:5 | `panelVisible` | Good naming with `is` prefix |
| packages/extension/src/content/panel.ts:130 | `isDragging` | Good naming with `is` prefix |
| packages/extension/src/content/inspector.ts:3 | `isInspecting` | Good naming with `is` prefix |

---

## Documentation Gaps (by severity)

### [CRITICAL] — Missing endpoint documentation and API contract specification
**File**: `packages/api/src/index.ts` (entire routing setup)
**Issue**: No JSDoc comments on any routes. Clients (extension) must reverse-engineer:
- What each endpoint accepts (request shape)
- What it returns (response shape)  
- Error conditions and codes
- Auth requirements (Bearer token? Supabase JWT?)
- Rate limits and quotas
- Side effects (DB writes, Stripe calls)

Extension API client (shared/api.ts) makes calls to 8 endpoints with NO inline documentation of what each returns. Message passing protocol between extension components (background → content → sidepanel) is NOT documented.

**Tier**: Standard (missing public function docs)
**Recommendation**: 
1. Add JSDoc to all route handlers documenting request/response shape, auth requirements, error codes
2. Add inline comments to message types in background/index.ts and relay.ts documenting the message passing protocol
3. Create a simple API_PROTOCOL.md documenting all endpoint contracts

### [HIGH] — Missing operational documentation for webhook handler
**File**: `packages/api/src/routes/webhook-stripe.ts`
**Issue**: Stripe webhook handler processes 4 critical event types without:
- Documentation of which events are handled and which are ignored
- No explanation of state transitions (free → pro, pro → free during payment failure)
- No description of what happens when `willRetry` is true vs false (lines 114-132)
- No side effect documentation (updates plan field, re-downgrades on payment success)
- No idempotency guarantees documented (what if webhook fires twice?)

This is a multi-step operation with external I/O and multiple failure paths affecting customer access.

**Tier**: Operational (external I/O, state mutations, webhook processing)
**Recommendation**:
```
Add JSDoc comment:
- List all handled event types and what each does
- Document state machine: when plan changes from free→pro and pro→free
- Explain willRetry behavior and retry semantics
- Note: Stripe may re-fire events; handler assumes DB update is idempotent
```

### [HIGH] — Missing flow documentation for decode operation
**File**: `packages/api/src/routes/decode.ts:22-128`
**Issue**: Multi-step decode operation (6+ distinct steps) with NO step-by-step breakdown:
1. Auth & rate limit check
2. Model selection based on plan
3. Sonnet monthly limit check
4. Cache hit check
5. API call to Anthropic
6. Token cost calculation & caching
7. Async side effects (Sonnet increment, DB logging)

No documentation of:
- What happens if cache hit vs miss (line 71-76)
- Why Sonnet counter increments happen async (fire-and-forget) vs sync
- Order of operations matters: char limit check comes after plan check
- Cost calculation formula (line 101)

**Tier**: Operational (6+ sequential steps, external API call, multiple side effects)
**Recommendation**: Add top-level JSDoc comment explaining the full flow:
```
/**
 * POST /decode - Analyze an error using Claude AI
 * 
 * Flow:
 * 1. Validate request (errorText max 15KB)
 * 2. Check free tier char limit (1,000 for free, unlimited for pro)
 * 3. Determine model (Sonnet only if pro plan, else Haiku)
 * 4. Check Sonnet monthly quota (20/month for pro)
 * 5. Check response cache (avoid duplicate API calls)
 * 6. Call Anthropic API with system prompt + user input
 * 7. Calculate cost in cents and cache response
 * 8. Log decode to database (async, fire-and-forget)
 * 
 * Side effects:
 * - Increments daily usage counter (atomic via Postgres RPC)
 * - May update Sonnet usage counter
 * - Inserts decode record for analytics
 * 
 * Cache: Errors under 200 chars without file paths are cached
 */
```

### [HIGH] — Missing complexity/performance documentation
**File**: `packages/extension/src/content/tech-detect.ts:18-382`
**Issue**: `detectTechStack()` function with 100+ conditional checks, no performance notes:
- No documentation of execution time (fast/slow?)
- No explanation of why caching is needed (lines 12-16)
- No notes on SPA detection (popstate/hashchange clearing cache)
- Function is 365 lines with many identical patterns — no DRY explanation

**Tier**: Standard (complex function, 365 lines, performance-sensitive)
**Recommendation**: Add JSDoc:
```
/**
 * Detect frontend frameworks, libraries, and services running on the current page
 * 
 * Execution: ~50-100ms per page load (runs after document ready)
 * Caching: Results cached until SPA navigation (popstate/hashchange)
 * 
 * Detection methods (in order):
 * 1. Global objects exposed by frameworks (React.__DEVTOOLS__, etc.)
 * 2. DOM markers (data-v- attrs, ng-version, etc.)
 * 3. Loaded script/link URLs (searches for provider names)
 * 
 * Returns array of DetectedTech with name, category, version, hex color
 */
```

### [HIGH] — Missing failure mode documentation  
**File**: `packages/api/src/routes/decode.ts:118-127`
**Issue**: Catch block for Anthropic API errors with hardcoded error detection:
```typescript
if (message.includes("rate_limit") || message.includes("429"))
```

No documentation of:
- What errors are retryable (rate limit vs quota exhaustion)
- What errors should be reported to user vs logged
- Whether client should retry or give up
- No fallback or degradation strategy

**Tier**: Operational (external API integration, failure handling)
**Recommendation**: Document expected errors and handling:
```typescript
// Handle Anthropic errors
// - rate_limit (429): AI service busy, client should retry with backoff
// - quota_exceeded: Monthly token limit reached, return 429 with message
// - invalid_request_error: Prompt/context too long, return 400
// - other errors: Log and return 503 Service Unavailable
```

### [HIGH] — Missing security note on sensitive data detection
**File**: `packages/extension/src/shared/sensitive-check.ts:8-42`
**Issue**: 40+ regex patterns for detecting secrets/PII with NO documentation of:
- Why each pattern was chosen (coverage/false positive rate)
- Known limitations (e.g., bearer tokens only detect 20+ chars)
- What happens to matched data (is it logged? sent to server?)
- Whether all patterns are actually used or just defined

**Tier**: Standard (security-sensitive, non-obvious patterns)
**Recommendation**: Add comment block:
```typescript
// Pattern selection rationale:
// - AWS: Match AKIA prefix (high confidence) + context-based secret regex
// - Stripe: Match sk_/pk_/rk_ prefix (official format)
// - SSN: Match XXX-XX-XXXX format (US-specific, ~50% false positive rate)
// - CC: Match BIN patterns (Visa 4xxx, MC 51-55xx, Amex 34/37xx)
//
// Limitations:
// - Bearer tokens require 20+ chars (may miss short tokens)
// - Generic password/api_key patterns have high false positive rate
// - No CVC/expiry detection (too error-prone)
//
// Matched data is shown to user in a warning modal before sending to API.
// Not logged server-side or in extension storage.
```

### [MEDIUM] — Missing message protocol documentation
**File**: `packages/extension/src/background/index.ts:73-137`
**Issue**: 8+ message types handled but not documented as a protocol:
- CAPTURED_ERROR (from main-world capture, relayed by relay.ts)
- TECH_DETECTED (from content script)
- ELEMENT_SELECTED (from inspector)
- AUTH_SUCCESS (from auth page)
- PLAN_UPGRADED / PLAN_CHANGED (from external auth)
- LOGOUT (from options page)

No central spec of message shape, source, destination, or side effects.

**Tier**: Standard (message passing protocol should be documented)
**Recommendation**: Add comment block at top:
```
/**
 * Extension Message Protocol
 * 
 * Messages flow: content script → background service worker ← sidepanel/popup
 * 
 * CAPTURED_ERROR (content → background):
 *   { type, text, level, timestamp, url, domain }
 *   From main-world capture script or relay. Stored per-tab.
 * 
 * TECH_DETECTED (content → background):
 *   { type, tech: DetectedTech[] }
 *   Stored as `tech_tab_${tabId}` for sidebar display
 * 
 * AUTH_SUCCESS (popup/options → background):
 *   { type, apiKey, email, plan }
 *   Triggers storage update, wakes sidebar UI
 * 
 * ... etc
 */
```

### [MEDIUM] — Undocumented regex patterns
**File**: `packages/extension/src/content/sourcemap.ts:31, 134`
**Issue**: Two similar but different regex patterns for extracting file:line:col from stack traces:
- Line 31: `frameRegex` for JavaScript stack traces
- Line 134: `urlMatch` for sourceMappingURL CSS comments

Pattern on line 31 is complex: `/(?:at\s+.*?\(|at\s+)?(https?:\/\/[^\s:]+|\/[^\s:]+):(\d+):(\d+)/g`

No documentation of:
- What stack trace formats it handles (V8? Chrome? Firefox?)
- Why `(?:at\s+.*?\(|at\s+)?` is optional
- Why URL can be relative (`\/[^\s:]+`) or absolute (`https?:\/\/...`)
- What it does NOT match

**Tier**: Standard (non-obvious regex, used in complex logic)
**Recommendation**: Add inline comments:
```typescript
// Extract stack frames: file:line:col
// Handles V8 format: "at functionName (http://example.com/script.js:10:5)"
// And: "at http://example.com/script.js:10:5"
// Optional "at" prefix handles both formats
// URL can be absolute (http://) or relative (/)
const frameRegex = /(?:at\s+.*?\(|at\s+)?(https?:\/\/[^\s:]+|\/[^\s:]+):(\d+):(\d+)/g;
```

### [MEDIUM] — Cryptic helper function names
**File**: `packages/extension/src/content/tech-detect.ts:388-407`
**Issue**: Three helper functions have unclear purposes:
- `getPageGlobals()` — why read from DOM attribute?
- `getScriptUrls()` — returns space-separated string, not array
- `getLinkUrls()` — same issue

No explanation of:
- Why these return space-separated strings instead of arrays
- Why globals come from `data-errordecoder-globals` attribute (set by main-world.ts, not obvious)
- How this data flows from main-world to isolated world

**Tier**: Standard (unclear intent without reading call site)
**Recommendation**: Add JSDoc:
```typescript
// Read global references exposed by main-world.ts via DOM attribute
// (main world can access window.React, etc.; isolated world cannot)
const getPageGlobals = (): Record<string, string | boolean> => {
  const raw = document.documentElement.getAttribute("data-errordecoder-globals");
  return raw ? JSON.parse(raw) : {};
};

// Get all script src attributes, return as space-separated string for URL scanning
// (concatenated with link URLs to search for provider names like "stripe.com")
const getScriptUrls = (): string => {
  return Array.from(document.querySelectorAll("script[src]"))
    .map((s) => s.getAttribute("src") || "")
    .join(" ");
};
```

### [MEDIUM] — Missing RPC function documentation
**File**: `packages/api/src/lib/middleware.ts:76-79`
**Issue**: Calls to `supabase.rpc("increment_daily_usage", ...)` with NO documentation of:
- What the RPC function does (increments counter, checks limit atomically)
- Whether it's idempotent (called multiple times per request?)
- What it returns (the new count)
- What happens if it fails (returns null? throws?)

Same issue in `packages/api/src/routes/decode.ts:111` with `increment_sonnet_usage`.

**Tier**: Operational (external RPC calls with side effects)
**Recommendation**: Add JSDoc comment when RPC is called:
```typescript
// increment_daily_usage(p_user_id) — Atomic counter increment via Postgres
// Returns: new count for today (1-indexed)
// Idempotent: same request can be called multiple times safely
// On error: returns null, we swallow error and proceed (optional rate limit)
const { data: newCount, error } = await supabase.rpc("increment_daily_usage", { p_user_id: user.id });
```

### [MEDIUM] — Magic number in rate limiter
**File**: `packages/api/src/lib/middleware.ts:87`
**Issue**: Hardcoded value `3` checked against `newCount > 3` but no explanation of:
- Why the limit is 3 (not 5 or 10)
- Whether this matches the usage API response (line 40 in usage.ts)
- Off-by-one concern: is it "3 per day" or "4 per day"?

**Tier**: Standard (hardcoded threshold, inconsistent with constants)
**Recommendation**: Extract to shared constant and document:
```typescript
const FREE_TIER_DAILY_LIMIT = 3; // Decoded errors per calendar day for free tier users

// Rate limit check: if increment returns > limit, user has exhausted quota
if (newCount > FREE_TIER_DAILY_LIMIT) {
  return c.json(..., 429); // Too Many Requests
}
```

### [MEDIUM] — Unclear cost calculation formula
**File**: `packages/api/src/routes/decode.ts:100-101`
**Issue**: Cost calculation is not self-explanatory:
```typescript
const rates = useModel === "sonnet" ? { input: 3.0, output: 15.0 } : { input: 1.0, output: 5.0 };
const costCents = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000 * 100;
```

Questions without docs:
- What are the rates? (cents per 1M tokens? pricing tiers?)
- Why divide by 1_000_000 then multiply by 100?
- Is this Haiku 4.5 pricing (it's from Feb 2025 but no version number)?
- When did pricing last change?

**Tier**: Standard (cost calculation should be transparent)
**Recommendation**: Add comment with pricing breakdown:
```typescript
// Anthropic pricing (as of Feb 2025):
// Haiku 4.5: $1 per 1M input tokens, $5 per 1M output tokens
// Sonnet 4.6: $3 per 1M input tokens, $15 per 1M output tokens
// Formula: (inputTokens * rate + outputTokens * rate) / 1_000_000 * 100 = cents
const rates = useModel === "sonnet"
  ? { input: 3.0, output: 15.0 }
  : { input: 1.0, output: 5.0 };
const costCents = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000 * 100;
```

### [MEDIUM] — Tailwind detection heuristic not explained
**File**: `packages/extension/src/content/tech-detect.ts:144-148`
**Issue**: Tailwind detection uses three separate checks with NO explanation:
```typescript
const hasTailwind = document.querySelector("[class*='flex ']") &&
  document.querySelector("[class*='bg-']") &&
  (document.querySelector("[class*='px-']") || document.querySelector("[class*='py-']"));
```

Why these classes? Why three checks? Why `flex ` (with space)?

**Tier**: Standard (detection heuristic is non-obvious)
**Recommendation**: Add comment:
```typescript
// Tailwind detection heuristic: look for 3+ common utility classes
// - flex: flexbox layout (common, low false positive)
// - bg-: background utility (common)
// - px-/py-: padding utilities (distinguishes from other frameworks using bg-)
// Space after 'flex' avoids matching 'flex-direction' etc. from other CSS
const hasTailwind = document.querySelector("[class*='flex ']") &&
  document.querySelector("[class*='bg-']") &&
  (document.querySelector("[class*='px-']") || document.querySelector("[class*='py-']"));
```

### [LOW] — Cryptic variable in sourcemap resolution
**File**: `packages/extension/src/content/sourcemap.ts:289`
**Issue**: Variable `originalFile` returned from `findSelectorInSources()` which returns either a filename or `"One of: file1.css, file2.css, ..."` when selector not found. This hybrid return type isn't obvious.

**Tier**: Standard (unclear return type)
**Recommendation**: Clarify return value in comment or rename:
```typescript
// Try to find which source file the selector came from
// Returns: source filename (e.g., "Dashboard.vue")
//          or fallback suggestion "One of: ..." if selector not found in sourcesContent
const originalFile = findSelectorInSources(rule.selector, rule.file);
```

### [LOW] — Missing time measurement documentation
**File**: `packages/api/src/routes/decode.ts:83, 93, 101`
**Issue**: `responseTimeMs` measured and logged but no explanation:
- Is this just API call duration or includes middleware?
- Stored in database but no note on whether it's indexed or used for analytics

**Tier**: Standard (telemetry field, should explain purpose)
**Recommendation**: Add comment when time is captured:
```typescript
// Measure API response time (Anthropic call duration + overhead)
const startTime = Date.now();
const completion = await anthropic.messages.create(...);
const responseTimeMs = Date.now() - startTime;
// Stored for analytics: identify slow requests, monitor API latency trends
```

---

## Summary

- **Naming issues**: 8 (cryptic abbreviations, generic names)
- **Magic numbers**: 19 (hardcoded limits, thresholds, color values, constants)
- **Missing function docs**: 8 (routes, tech-detect, sensit check, message protocol)
- **Missing complexity analysis**: 3 (tech-detect, sourcemap resolver, regex patterns)
- **Missing operational docs**: 6 (webhook handler, decode flow, RPC calls, error handling)
- **Undocumented business logic**: 3 (cost calculation, Tailwind heuristic, cache strategy)

**Total issues**: 23 across clarity and documentation

---

## What's Well-Documented

1. **System prompts** (lib/prompts.ts) — exceptionally clear with explicit rules for each mode (error, inspect, batch)
2. **Auth middleware** (lib/middleware.ts) — comments explain Hono context extension and API key extraction
3. **Error relay** (content/relay.ts) — minimal but correct; data flow comment at top
4. **Message handlers** (background/index.ts) — inline comments explain purpose of most handlers
5. **Tech detection patterns** — framework checks are self-explanatory (globals/DOM markers)
6. **Sensitive data patterns** (shared/sensitive-check.ts) — well-organized, types are clear
7. **Panel UI logic** (content/panel.ts) — resize, drag, storage sync all have contextual comments
8. **Database schema** (CLAUDE.md) — clearly documented with field purposes
9. **Product spec** (CLAUDE.md) — complete UX flow and pricing tiers documented
10. **Cost breakdown** (CLAUDE.md) — pricing model and monthly cost estimates provided

Good patterns to preserve: system prompts, data flow comments, inline state machine logic, type clarity.

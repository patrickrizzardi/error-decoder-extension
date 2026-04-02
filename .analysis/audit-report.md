# Coordinated Audit Report

**Date**: 2026-04-02
**Scope**: Entire codebase (~75 source files)
**Analyzers**: 10 (security, SQL injection, bugs, performance, cleanup, redundancy, consistency, consolidation, documentation, UX)

---

## Coordination Notes

### Deduplication (same finding, multiple agents)

| Finding | Agents | Resolved |
|---------|--------|----------|
| `model_used: "haiku"` hardcoded | bugs, cleanup, performance, sql-injection | Merged → Phase 1, item #5 |
| Rate limit fail-open on DB error | security (CRITICAL), bugs (MEDIUM) | Merged → Phase 1, item #2. Security severity wins. |
| `DecodeResponse` type mismatch (popup/devtools broken) | bugs, consolidation | Merged → Phase 1, item #4 |
| `error_text_preview` stores raw input | security, sql-injection | Merged → Phase 3, item #24 |
| `STRIPE_WEBHOOK_SECRET` empty string fallback | security (LOW), bugs (CRITICAL) | Merged → Phase 2, item #16. Promoted to MEDIUM — retry storm risk. |
| `mousemove`/`mouseup` listener leak | bugs, performance | Merged → Phase 2, item #11 |
| Sonnet race condition | security (counter race), bugs (double-click race) | Kept separate — server-side (#8) and client-side (#27) are different fixes. |

### Conflicts Resolved

- **UX vs Security on error messages**: UX wants specific error messages; security says don't leak internals. Resolution: Be specific about user-facing errors (rate limits, auth, quotas) WITHOUT exposing system internals (stack traces, DB errors). The catch-all handler stays generic for unexpected errors; specific routes already return good messages.

### Dependency Rules Applied

1. Security fixes (Phase 1) before any DRY/refactoring (Phase 3)
2. Type mismatch fix (#4) before popup/devtools cleanup
3. Auth middleware query merge (#12) before Sonnet DRY extraction (#22)
4. `DecodeResponse` type fix (#4) blocks popup/devtools rendering fix (#4b)

---

## Phase 1: CRITICAL — Fix Before Launch (5 items)

### 1. Unauthenticated External Message Handler — Account Takeover
- **File**: `packages/extension/src/background/index.ts:116-137`
- **Agents**: security
- **Issue**: `chrome.runtime.onMessageExternal` accepts `AUTH_SUCCESS` with arbitrary `apiKey`/`email`/`plan` from any allowed origin. XSS on errordecoder.dev or localhost can silently replace stored credentials.
- **Fix**: Validate API key against backend before storing. Call `/api/usage` with received key, confirm it returns valid data for the claimed email.
- **Model**: sonnet (auth flow reasoning)

### 2. Rate Limit Fail-Open → Fail-Closed
- **File**: `packages/api/src/lib/middleware.ts:81-85`
- **Agents**: security, bugs
- **Issue**: When `increment_daily_usage` RPC fails, middleware calls `next()` — grants unlimited free decodes during any DB outage.
- **Fix**: Return 503 on RPC error instead of proceeding.
- **Model**: haiku (one-line change)

### 3. innerHTML XSS via `marked.parse()` — API Key Exfiltration
- **File**: `packages/extension/src/sidepanel/index.ts:717`
- **Agents**: security
- **Issue**: AI response markdown rendered via `marked.parse()` → `innerHTML` without sanitization. Prompt injection can exfiltrate `chrome.storage.local` API key.
- **Fix**: Add DOMPurify: `container.innerHTML = DOMPurify.sanitize(marked.parse(markdown))`
- **Model**: haiku (add import + wrap one line)
- **Dependency**: Install `dompurify` package

### 4. `DecodeResponse` Type Mismatch — Popup & DevTools Completely Broken
- **Files**: `shared/types.ts:29-39`, `packages/extension/src/popup/index.ts:22-34`, `packages/extension/src/devtools/panel.ts:117-132`
- **Agents**: bugs, consolidation
- **Issue**: API returns `{ markdown: string, model: string, cached: boolean }` but `DecodeResponse` type declares structured fields (`whatHappened`, `why`, `howToFix`). Popup and DevTools access nonexistent fields → render blank UI.
- **Fix**: (a) Update `DecodeResponse` in `shared/types.ts` to match actual API shape. (b) Update popup and devtools to render markdown.
- **Model**: sonnet (cross-file type alignment + rendering changes)

### 5. `model_used` Always Hardcoded to "haiku"
- **File**: `packages/api/src/routes/decode.ts:130-149`
- **Agents**: bugs, cleanup, performance, sql-injection
- **Issue**: `logDecode()` hardcodes `model_used: "haiku"` regardless of actual model. All Sonnet decodes logged as Haiku — cost analytics, abuse detection, and billing audits are wrong.
- **Fix**: Add `modelUsed` parameter to `logDecode()`, pass `useModel` from call sites.
- **Model**: haiku (parameter addition + 2 call site updates)

---

## Phase 2: HIGH — Fix This Sprint (11 items)

### 6. Tech Stack Badge XSS via Unescaped `t.version`
- **File**: `packages/extension/src/sidepanel/index.ts:293-296`
- **Agents**: security
- **Issue**: `window.React.version` is page-controlled, flows into `innerHTML` via template literal without escaping. Attribute breakout possible.
- **Fix**: Use `escapeHtml()` on all interpolated values in badge rendering.
- **Model**: haiku

### 7. CORS Wildcard `chrome-extension://*`
- **File**: `packages/api/src/index.ts:21-28`
- **Agents**: security
- **Issue**: Any Chrome extension can make requests to the API.
- **Fix**: Pin to specific extension ID via `EXTENSION_ID` env var.
- **Model**: haiku

### 8. Sonnet Usage Counter Race Condition (Server-Side)
- **File**: `packages/api/src/routes/decode.ts:110-112`
- **Agents**: security
- **Issue**: Limit check and increment are non-atomic. Concurrent requests can exceed 20/month.
- **Fix**: Move limit check + increment into a single atomic RPC function (same pattern as `increment_daily_usage`).
- **Model**: sonnet (new RPC function + migration)

### 9. Wrong Tab ID in Sidepanel
- **File**: `packages/extension/src/sidepanel/index.ts:61-65`
- **Agents**: bugs
- **Issue**: `chrome.tabs.query({ active: true })` gets wrong tab if user switches tabs after opening sidebar. Errors from wrong tab displayed.
- **Fix**: Pass tab ID from injecting content script via `postMessage`.
- **Model**: sonnet (cross-component message flow)

### 10. Stripe Webhook Idempotency
- **File**: `packages/api/src/routes/webhook-stripe.ts:31-138`
- **Agents**: bugs
- **Issue**: No event ID deduplication. Retry storms can cause incorrect plan state transitions.
- **Fix**: Store processed event IDs in DB, skip duplicates.
- **Model**: sonnet (new table/column + logic)

### 11. Event Listener Leaks (mousemove/mouseup)
- **Files**: `packages/extension/src/content/panel.ts:152-170`, `packages/extension/src/shared/ui.ts:21-32`
- **Agents**: bugs, performance
- **Issue**: `mousemove` and `mouseup` listeners on `document` never removed. Fire on every mouse event indefinitely.
- **Fix**: Add listeners on `mousedown`, remove on `mouseup`.
- **Model**: haiku

### 12. Triple Sequential DB Round-Trips on Decode
- **Files**: `packages/api/src/lib/middleware.ts:38`, `packages/api/src/routes/decode.ts:52`
- **Agents**: performance
- **Issue**: Auth middleware fetches user without sonnet fields → decode.ts re-fetches same row for sonnet fields. 3 serial DB queries before AI call.
- **Fix**: Add `sonnet_uses_this_month, sonnet_month` to auth middleware select. Eliminate third query.
- **Model**: haiku

### 13. `postMessage` Origin Not Validated
- **File**: `packages/extension/src/content/panel.ts:176-180`
- **Agents**: security
- **Issue**: Any page script can send `ERRORDECODER_CLOSE` to dismiss the panel.
- **Fix**: Validate `event.origin` against extension URL.
- **Model**: haiku

### 14. Account Deletion Failure Handling
- **File**: `packages/extension/src/options/index.ts:106-120`
- **Agents**: UX
- **Issue**: If `api.deleteAccount()` fails, extension clears storage anyway — user logged out locally but account still exists server-side.
- **Fix**: Check API response before clearing storage.
- **Model**: haiku

### 15. Sequential DB Queries in `/api/usage`
- **File**: `packages/api/src/routes/usage.ts:8-47`
- **Agents**: performance
- **Issue**: Two independent DB reads run sequentially.
- **Fix**: `Promise.all` both queries.
- **Model**: haiku

### 16. `STRIPE_WEBHOOK_SECRET` Startup Validation
- **File**: `packages/api/src/lib/stripe.ts:11`
- **Agents**: security, bugs
- **Issue**: Falls back to empty string instead of throwing at startup. Missing secret → 500 response → Stripe retry storm.
- **Fix**: Throw at startup like `STRIPE_SECRET_KEY` does.
- **Model**: haiku

---

## Phase 3: MEDIUM — Next Sprint (12 items)

### 17. Duplicate `CapturedError` Type
- **File**: `packages/extension/src/background/index.ts:143-151`
- **Agents**: consolidation
- **Fix**: Import from `@shared/types`, reconcile `tabId` optionality.
- **Model**: haiku

### 18. Dead `schemas/decode.ts` File
- **File**: `packages/api/src/schemas/decode.ts`
- **Agents**: consolidation
- **Fix**: Delete (route uses inline schema with different max-length).
- **Model**: haiku

### 19. `%%API_BASE%%` Env Var Split (`API_URL` vs `APP_URL`)
- **Files**: `packages/web/src/server.ts:8`, `scripts/build-vercel.ts:80`
- **Agents**: consolidation
- **Fix**: Normalize to single env var name. Extract shared `envReplacements` map.
- **Model**: haiku

### 20. Webhook Error Codes Not Using `errorCodes` Constant
- **File**: `packages/api/src/routes/webhook-stripe.ts:12,17,28`
- **Agents**: consistency
- **Fix**: Replace hardcoded strings with `errorCodes` references. Add missing `webhookSignatureFailed` code.
- **Model**: haiku

### 21. `logDecode` Parameter Naming + `as any` Removal
- **File**: `packages/api/src/routes/decode.ts:130-149`
- **Agents**: consistency
- **Fix**: Rename `response` param to `markdown: string`, remove `as any` casts at call sites.
- **Model**: haiku (combine with Phase 1 item #5)

### 22. Validation Error Handling DRY Extraction
- **Files**: `packages/api/src/routes/decode.ts`, `checkout.ts`, `feedback.ts`
- **Agents**: redundancy
- **Fix**: Extract `parseRequest()` utility to `lib/validation.ts`.
- **Model**: haiku

### 23. UUID Validation on Feedback Endpoint
- **File**: `packages/api/src/schemas/feedback.ts:4`
- **Agents**: sql-injection
- **Fix**: Change `v.pipe(v.string(), v.minLength(1))` to `v.pipe(v.string(), v.uuid())`.
- **Model**: haiku

### 24. `error_text_preview` Stores Raw User Input
- **File**: `packages/api/src/routes/decode.ts:138`
- **Agents**: security, sql-injection
- **Fix**: Apply server-side sensitive data scrubber, or hash the preview.
- **Model**: haiku

### 25. Free Tier Reset Time Display
- **File**: `packages/extension/src/sidepanel/index.ts:317-346`
- **Agents**: UX
- **Fix**: Display `resetsAt` value from usage API response.
- **Model**: haiku

### 26. Sonnet Limit Message Improvement
- **File**: `packages/api/src/routes/decode.ts:60-65`
- **Agents**: UX
- **Fix**: "Switch to standard (Haiku) or wait until next month."
- **Model**: haiku

### 27. Double-Decode Race on Rapid Button Clicks (Client-Side)
- **File**: `packages/extension/src/sidepanel/index.ts:418-419`
- **Agents**: bugs
- **Fix**: Set `isDecoding = true` immediately before any async work.
- **Model**: haiku

### 28. Modal Keydown Listener Leak
- **File**: `packages/extension/src/shared/modal.ts:117-123`
- **Agents**: bugs
- **Fix**: Remove `onKeydown` listener inside `cleanup()`.
- **Model**: haiku

---

## Phase 4: LOW — Backlog (13 items)

### 29-31. Unused Code Cleanup
- Remove `ValidatedCheckoutRequest`, `ValidatedDecodeRequest`, `ValidatedFeedbackRequest` types
- Remove `buildUserPrompt()` and `BATCH_SYSTEM_PROMPT` from `prompts.ts`
- Remove `sessionStorage` wrapper from `storage.ts`
- **Model**: haiku

### 32. `as any` in `main-world.ts` (71 occurrences)
- **Agents**: consistency
- **Decision**: Pragmatic exception — document at file top. Window global detection legitimately needs dynamic access.
- **Model**: skip (document only)

### 33. Untyped Function Parameters in Sidepanel
- **File**: `packages/extension/src/sidepanel/index.ts:559,589,590,620`
- **Fix**: Define `ElementInfo` interface.
- **Model**: haiku

### 34-39. Documentation Improvements
- Extract 19+ magic numbers to named constants
- Add JSDoc to route handlers
- Document message passing protocol
- Document webhook state machine
- Document decode flow
- Add inline comments for regex patterns and detection heuristics
- **Model**: haiku (mechanical)

### 40-42. UX Polish
- Source map loading state feedback
- Batch decode timestamp/context inclusion
- Sonnet model badge on results
- Inspector mode clarity
- Auth tab switching preserves errors
- Checkout success page next steps
- **Model**: haiku

### 43. Path Traversal in Dev Server
- **File**: `packages/web/src/server.ts:33-43`
- **Agents**: security
- Dev-only, not production. Add `path.resolve` guard.
- **Model**: haiku

### 44. Security Headers on API
- **File**: `packages/api/src/index.ts`
- Add `secureHeaders()` middleware.
- **Model**: haiku

### 45. Hardcoded Test Credentials
- **File**: `scripts/seed-test-user.ts:21-22`
- Use env vars or generate random password.
- **Model**: haiku

---

## Parallel Groups (for fix phase)

### Parallel Group A (API backend — no shared files)
- Items: #2, #5, #7, #8, #12, #15, #16, #20, #21, #22, #23, #24, #26
- Files: `middleware.ts`, `decode.ts`, `index.ts`, `usage.ts`, `stripe.ts`, `webhook-stripe.ts`, `feedback.ts`

### Parallel Group B (Extension background)
- Items: #1, #17
- Files: `background/index.ts`

### Parallel Group C (Extension sidepanel + shared)
- Items: #3, #6, #25, #27
- Files: `sidepanel/index.ts` (needs DOMPurify)

### Parallel Group D (Extension content scripts)
- Items: #11, #13
- Files: `content/panel.ts`, `shared/ui.ts`

### Parallel Group E (Shared types + popup/devtools)
- Items: #4
- Files: `shared/types.ts`, `popup/index.ts`, `devtools/panel.ts`

### Parallel Group F (Options)
- Items: #14
- Files: `options/index.ts`

### Parallel Group G (Infrastructure/scripts)
- Items: #18, #19
- Files: `schemas/decode.ts`, `web/server.ts`, `build-vercel.ts`

**Dependency**: Group E (#4) should complete before Group C (#3, #6) and Group B (#1) since type changes affect them.

---

## Needs Discussion

1. **API key storage**: Currently plaintext in `chrome.storage.local`. Security recommends `chrome.storage.session` (clears on browser close) or short-TTL tokens. Trade-off: users would need to re-auth every browser restart. **Decision needed from Patrick.**

2. **DevTools panel**: Fully implemented but undocumented and currently broken (type mismatch). Keep and fix, or remove entirely? It's extra surface area to maintain. **Decision needed from Patrick.**

3. **Sensitive data warning tone**: Red danger button but "consider removing" language. Either strengthen language or downgrade button color. **UX judgment call.**

4. **Rate limit placement**: Currently increments BEFORE decode succeeds — failed AI calls burn a slot. Moving increment to after success changes the security model (fail-open on uncounted requests). **Architecture trade-off.**

---

## Summary Counts

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High | 11 |
| Medium | 12 |
| Low | 17 |
| **Total** | **45** |

### By Dimension
| Analyzer | Findings |
|----------|----------|
| Security | 14 (2 critical) |
| Bugs | 14 (4 critical) |
| Performance | 12 |
| UX | 13 |
| Documentation | 23 |
| Redundancy | 8 |
| Consolidation | 6 |
| Consistency | 4 |
| Cleanup | 7 |
| SQL Injection | 2 |

*After deduplication: 45 unique findings (from ~103 raw findings across 10 agents).*

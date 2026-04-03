# SQL Injection Penetration Test Report

## Executive Summary

- **Total endpoints tested**: 9 (health, decode, usage, auth/key, checkout, portal, webhook/stripe, feedback, account)
- **Total database-touching files analyzed**: 10 (8 routes + middleware + cache lib)
- **Total SQL migration files analyzed**: 3 (including all RPC function definitions)
- **Vulnerabilities found**: 0 (zero critical, zero high, zero medium, zero low)
- **Overall risk assessment**: LOW. The codebase uses the Supabase JS client exclusively with parameterized query methods throughout. No raw SQL string interpolation exists anywhere in application code. All user-supplied inputs are either passed through Valibot validation schemas before touching the database, or are server-derived values (UUIDs from authenticated sessions, hashes from server-side crypto operations).

---

## Technology Stack

- **Database**: PostgreSQL (Supabase-managed)
- **ORM/Query Layer**: Supabase JS client (`@supabase/supabase-js`) — PostgREST-based query builder
- **Validation**: Valibot (`v.safeParse`, `v.parse`) on all request bodies
- **RPC Functions**: 3 PostgreSQL stored procedures (`increment_daily_usage`, `increment_cache_hit`, `increment_sonnet_usage`) — all use parameterized PL/pgSQL, no dynamic SQL
- **Existing protections**: Parameterized queries via PostgREST (all `.eq()`, `.update()`, `.insert()`, `.upsert()` calls), Valibot schema validation at route entry points, service-role Supabase client with no user-controlled query building, Row Level Security enabled on all tables

---

## Findings

None. All injection vectors were evaluated and found to be safe. See "Verified Safe Endpoints" below for the analysis of each.

---

## Verified Safe Endpoints

### GET /api/health
**File**: `packages/api/src/routes/health.ts`
No database interaction. Returns a static timestamp. Not a vector.

---

### POST /api/decode
**File**: `packages/api/src/routes/decode.ts`

**Input vectors analyzed**:
- `errorText` (string, up to 15,000 chars) — validated by Valibot `decodeRequestSchema` before any use. Goes to Anthropic AI as message content, not into any DB query.
- `model` (enum picklist `["haiku", "sonnet"]`) — Valibot rejects any other value before it reaches the model selection logic.
- `mode` (enum picklist `["error", "inspect"]`) — Valibot rejects any other value before DB access.

**Database writes**:
- `logDecode()` at line 139: uses `.insert({...})` with only server-derived values. `errorText.slice(0, 200)` goes into `error_text_preview` as a data value (passed via PostgREST parameterization to PostgreSQL), not into a query predicate. No injection possible.
- `errorHash` at lines 141, 44: SHA-256 hex string computed server-side from user input — the hash itself is safe to interpolate anywhere, and is passed via parameterized `.eq()` regardless.
- `.rpc("increment_sonnet_usage", { p_user_id: user.id, p_month: currentMonth })` at line 109: both params are server-derived (UUID from auth session, ISO month string from `new Date()`). The PL/pgSQL function uses `WHERE id = p_user_id` — parameterized, not dynamic SQL.
- `.rpc("increment_daily_usage", { p_user_id: user.id })` at line 117: same analysis — server-derived UUID only.

**DB reads**: None involving user input; cache lookup uses `errorTextHash` (server-computed SHA-256 hex).

**Conclusion**: Safe. User input flows to the AI model only, never into query predicates.

---

### GET /api/usage
**File**: `packages/api/src/routes/usage.ts`

No request body or query params read. All DB queries keyed on `user.id` from the authenticated session (UUID set by `authMiddleware` after API key lookup). `today` is `new Date().toISOString().split("T")[0]` — entirely server-derived.

**Conclusion**: Safe. Zero user-controlled values in any query.

---

### POST /api/auth/key
**File**: `packages/api/src/routes/auth.ts`

The JWT from the `Authorization` header is passed to `supabase.auth.getUser(jwt)` — this is Supabase's own JWT verification path, not a DB query. The subsequent `.eq("id", user.id)` uses the UUID extracted from the verified token, not any raw user string.

**Conclusion**: Safe. The JWT is treated as an opaque credential, not interpolated into any query.

---

### POST /api/checkout
**File**: `packages/api/src/routes/checkout.ts`

`interval` from request body is validated by Valibot `checkoutRequestSchema` as a `picklist(["month", "year"])` — anything outside those two exact values is rejected with 400 before any code runs. The validated `interval` value is used only as Stripe API metadata for a `.find()` in memory on the prices list, not in any DB query.

The `.update({ stripe_customer_id: customerId }).eq("id", user.id)` at line 56 uses `customerId` from the Stripe API response and `user.id` from the auth session — neither originates from user-controlled request input.

**Conclusion**: Safe.

---

### POST /api/portal
**File**: `packages/api/src/routes/portal.ts`

No request body read. No DB queries executed. Uses `user.stripeCustomerId` from the auth session to call the Stripe API only.

**Conclusion**: Safe. Not a vector at all.

---

### POST /api/webhook/stripe
**File**: `packages/api/src/routes/webhook-stripe.ts`

This endpoint has no `authMiddleware` but uses Stripe webhook signature verification (`stripe.webhooks.constructEventAsync`) — a cryptographic HMAC check. Any tampered payload fails signature verification and returns 400 before the switch statement is reached.

After signature verification, `userId`, `customerId`, and `subscriptionId` are extracted from the Stripe event object. These values are passed to `.eq("id", userId)` and `.eq("stripe_customer_id", customerId)` — both use PostgREST parameterization. The values originate from Stripe's event data, not from request body parsing, but even if an attacker somehow forged them, PostgREST's `.eq()` treats values as bind parameters, not SQL fragments.

**Conclusion**: Safe. Signature verification is the security boundary; all DB calls downstream use parameterized methods.

---

### POST /api/feedback
**File**: `packages/api/src/routes/feedback.ts`

`decodeId` is validated by Valibot as `v.uuid()` — strict UUID format validation. A SQL injection payload is not a valid UUID and is rejected at line 14 before reaching the database. `thumbsUp` is validated as `v.boolean()` — type coercion ensures it can only be `true` or `false`.

The `.update({ thumbs_up: thumbsUp }).eq("id", decodeId).eq("user_id", user.id)` at line 25 enforces ownership via the auth session `user.id` — even if `decodeId` somehow passed the UUID check, it would only match rows belonging to the authenticated user.

**Conclusion**: Safe. UUID validation plus ownership predicate make this doubly protected.

---

### DELETE /api/account
**File**: `packages/api/src/routes/account.ts`

No request body read. Both DB calls use `user.id` from the auth session exclusively:
- `.delete().eq("id", user.id)` at line 31
- `supabase.auth.admin.deleteUser(user.id)` at line 44

`user.stripeCustomerId` (used for Stripe API calls only, not DB queries) comes from the auth session row set during `authMiddleware`.

**Conclusion**: Safe. Zero user-controlled values in any query.

---

### Auth Middleware
**File**: `packages/api/src/lib/middleware.ts`

The `apiKey` extracted from the `Authorization` header at line 39 is passed to `.eq("api_key", apiKey)`. PostgREST's `.eq()` generates a parameterized query — the value is bound as a parameter, not interpolated into SQL text. A SQL injection payload in the bearer token will be treated as a literal string value that simply won't match any `api_key` in the table, returning a 401.

The `today` date string in `rateLimitMiddleware` at line 81 is server-derived from `new Date()`.

**Conclusion**: Safe. `.eq()` is parameterized; injection attempts result in auth failure only.

---

### Cache Library
**File**: `packages/api/src/lib/cache.ts`

`errorTextHash` is a SHA-256 hex digest computed server-side. Even if the original `errorText` contained injection payloads, the hash function outputs a fixed 64-character hex string with no SQL-special characters. The hash is passed to `.eq("error_text_hash", errorTextHash)` and `.rpc("increment_cache_hit", { p_hash: errorTextHash })` — both parameterized.

**Conclusion**: Safe. The hash function acts as an additional sanitization layer, though it's not needed because PostgREST parameterizes regardless.

---

### RPC / Stored Procedures
**Files**: `supabase/migrations/001_initial.sql`, `supabase/migrations/002_helper_functions.sql`

All three stored procedures (`increment_daily_usage`, `increment_cache_hit`, `increment_sonnet_usage`) use static PL/pgSQL with `WHERE` clauses bound to function parameters. There is no `EXECUTE` statement, no `FORMAT()` with user data, and no dynamic SQL construction of any kind. The functions use `$$ LANGUAGE plpgsql`, not `LANGUAGE plperlu` or any dynamic execution variant.

**Conclusion**: Safe. Standard parameterized PL/pgSQL throughout.

---

## Second-Order Injection Analysis

Second-order injection occurs when data is stored safely then later used unsafely in a query. The only stored user-adjacent data that could theoretically re-enter a query is:

1. `error_text_preview` (first 200 chars of user error text) — stored via parameterized insert, and **never subsequently read back and used in any query predicate** anywhere in the codebase. It is analytics data only.
2. `api_key` — server-generated hex string, never user-supplied.
3. `email` — copied from Supabase Auth's verified user record by the `handle_new_user()` trigger, never used in query predicates beyond `.eq("id", user.id)` lookups.

**Conclusion**: No second-order injection paths exist. No stored user content is ever re-used as a query predicate or dynamic SQL fragment.

---

## Testing Limitations

- **Authenticated endpoints only**: All non-webhook endpoints require a valid `Authorization: Bearer <api_key>` header. No testing was done without authentication credentials because the middleware returns 401 before any DB code executes — no injection surface exists pre-auth.
- **No live endpoint testing**: This audit is static analysis only. No payloads were sent to a running instance.
- **Supabase RPC internals**: The behavior of PostgREST's parameterization is assumed to match its documented behavior (bind parameters, not string interpolation). This is well-established and consistent with the Supabase JS client's implementation.
- **Extension `api.ts`**: Confirmed clean — builds `fetch()` calls with `JSON.stringify(body)` only. No query string building, no URL parameter concatenation with user data.

---

## Recommendations Summary

The codebase is clean. There are no SQL injection vulnerabilities to remediate. The following are general hardening observations, not findings:

1. **Keep Valibot validation as the first gate on every route**: The current pattern of `v.safeParse(schema, rawBody)` before any business logic is correct and should be maintained for any future routes. Do not add DB calls above the validation check.

2. **Never introduce `supabase.rpc()` calls with user-provided string arguments that are used in dynamic SQL inside the stored procedure**: All current RPCs are static PL/pgSQL. If a future RPC needs to accept a table name, column name, or filter expression from the application layer, use `FORMAT()` with `%I` (identifier quoting) and `%L` (literal quoting) rather than concatenation, or reject the pattern entirely and use the query builder instead.

3. **Do not add raw `$queryRaw` or equivalent if migrating to a different ORM**: The current Supabase client approach is safe. If the stack ever changes, the ORM-specific injection checklist in the mission brief applies.

4. **The `service_role` Supabase client bypasses RLS**: This is intentional and documented in `supabase.ts`. It is correct for a server-side API. Ensure the `SUPABASE_SECRET_KEY` never leaks to the client extension bundle (currently it does not — the extension only uses `apiKey` from the API response, not Supabase credentials directly).

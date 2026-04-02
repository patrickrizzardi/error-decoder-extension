# SQL Injection Penetration Test Report

## Executive Summary

- Total endpoints tested: 8 (auth, decode, feedback, usage, account, checkout, portal, webhook-stripe) + 3 migration files + 2 scripts
- Vulnerabilities found: 0 Critical, 0 High, 1 Medium, 1 Low, 2 Informational
- Overall risk assessment: LOW. The application does not use raw SQL anywhere in the API layer. All database access goes through the Supabase PostgREST client (`.from().select/insert/update/delete/eq()`), which is parameterized by construction. The one area of real concern is an unvalidated string used as a DB row filter — but it is constrained by a server-enforced user ownership check that limits blast radius to the authenticated user's own data.

---

## Technology Stack

- Database: PostgreSQL (Supabase-managed)
- ORM/Client: Supabase JS client (`@supabase/supabase-js`) — wraps PostgREST; no raw SQL in application code
- Validation: Valibot (all public endpoints)
- Auth: Bearer API key validated against DB on every request via `authMiddleware`
- Existing protections:
  - PostgREST client parameterizes all filter values — `.eq("column", value)` translates to a parameterized HTTP query, never string-interpolated SQL
  - Row Level Security (RLS) is enabled on all four tables
  - Service-role key used server-side only; client never receives it
  - All three Postgres helper functions (`increment_daily_usage`, `increment_cache_hit`, `increment_sonnet_usage`) use typed UUID and TEXT parameters — no dynamic SQL construction inside them
  - Valibot schemas sit in front of every mutating route

---

## Findings

### [MEDIUM] Finding #1: `decodeId` accepted as arbitrary string in feedback endpoint — no UUID format validation

**Location**: `packages/api/src/schemas/feedback.ts:4` / `packages/api/src/routes/feedback.ts:28-29`

**Endpoint**: `POST /api/feedback`

**Parameter**: `decodeId` (request body)

**Vulnerability Description**:

The `feedbackRequestSchema` validates `decodeId` only as `v.pipe(v.string(), v.minLength(1))` — any non-empty string passes. This value is passed directly into `.eq("id", decodeId)`. The Supabase client will transmit whatever string arrives as the filter value to PostgREST.

The real protection here is the second `.eq("user_id", user.id)` predicate on line 29, which scopes the update to rows owned by the authenticated user. An attacker cannot update another user's decode record because the ownership filter is always applied. However, supplying a non-UUID string (e.g., a very long string, special characters, or a malformed UUID) will either silently match zero rows or cause a Postgres type-cast error from PostgREST — the application swallows both outcomes and returns `{ saved: true }` in either case.

**Evidence this is a real issue (not speculation)**:

```typescript
// packages/api/src/schemas/feedback.ts:4
decodeId: v.pipe(v.string(), v.minLength(1, "decodeId is required")),

// packages/api/src/routes/feedback.ts:25-29
const { error } = await supabase
  .from("decodes")
  .update({ thumbs_up: thumbsUp })
  .eq("id", decodeId)        // arbitrary string here
  .eq("user_id", user.id);   // ownership predicate always applied
```

The `decodes.id` column is `UUID PRIMARY KEY DEFAULT gen_random_uuid()` (migration 001, line 20). PostgREST will attempt to cast the string to UUID. A non-UUID value produces a Postgres cast error, which is caught by the `if (error)` block and logged server-side — but the HTTP response to the caller is always 500 with a generic message, not a validation rejection. There is no SQL injection possible here because PostgREST parameterizes the value; the issue is improper input validation allowing error-path confusion.

**Why existing protections mostly worked**: The ownership `.eq("user_id", user.id)` predicate is the real guard. No injection is possible because the client is parameterized. The issue is purely about input hygiene and error transparency.

**Remediation**:

```typescript
// packages/api/src/schemas/feedback.ts
import * as v from "valibot";

export const feedbackRequestSchema = v.object({
  decodeId: v.pipe(
    v.string(),
    v.uuid("decodeId must be a valid UUID")   // v.uuid() is a built-in Valibot validator
  ),
  thumbsUp: v.boolean("thumbsUp must be a boolean"),
});
```

This rejects malformed input at the validation layer with a clear 400 response instead of letting a type-cast error reach Postgres.

---

### [LOW] Finding #2: `error_text_preview` stores raw user input in DB without truncation at schema level — potential second-order display risk

**Location**: `packages/api/src/routes/decode.ts:138`

**Endpoint**: `POST /api/decode` (write path only)

**Parameter**: `errorText` (request body)

**Vulnerability Description**:

The `logDecode` helper stores the first 200 characters of raw user input in `error_text_preview`:

```typescript
// decode.ts:138
error_text_preview: errorText.slice(0, 200),
```

This is not a SQL injection vector — the Supabase client parameterizes the insert. However, it is worth noting that this raw user content is stored and could be displayed in an admin interface or analytics dashboard later. If any future UI renders `error_text_preview` as HTML rather than plain text, it becomes a stored XSS vector. This is strictly a future-risk flag, not a current exploit.

**Why it is rated Low and not a current finding**: The field is currently only read via direct DB queries (DataGrip/pgAdmin per the CLAUDE.md plan) with no frontend rendering path. The data is stored safely. The risk only materializes if a rendering layer is added later without output encoding.

**Recommendation**: When an admin dashboard is built, ensure `error_text_preview` is always rendered as plain text (e.g., `textContent` in JS, not `innerHTML`). No code change needed now.

---

## Verified Safe Endpoints

### `POST /api/auth/key` (routes/auth.ts)
Accepts a Supabase JWT from the `Authorization` header. The JWT is passed to `supabase.auth.getUser(jwt)` — Supabase validates it cryptographically. The subsequent user lookup uses `.eq("id", user.id)` where `user.id` comes from the verified JWT payload, not from user-controlled input. Safe.

### `POST /api/decode` (routes/decode.ts)
`errorText` is validated by Valibot (string, 1–15000 chars) and passed to the Anthropic API as message content — never into a SQL query. The hash stored in `error_text_hash` is a SHA-256 hex digest of the normalized text — not the raw input. The cache lookup uses `.eq("error_text_hash", errorTextHash)` with the hash value. Safe.

### `GET /api/usage` (routes/usage.ts)
All queries use `user.id` sourced from the auth middleware, which validated the API key against the DB. No user-supplied parameters reach any query. Safe.

### `DELETE /api/account` (routes/account.ts)
Uses `user.id` from auth middleware throughout. No user-controlled query parameters. Safe.

### `POST /api/checkout` (routes/checkout.ts)
`interval` is constrained to `picklist(["month", "year"])` by Valibot — only two values possible. The resulting `customerId` and `price.id` come from Stripe's own API responses, not from user input. DB updates use `.eq("id", user.id)`. Safe.

### `POST /api/portal` (routes/portal.ts)
No DB reads or writes. Passes `user.stripeCustomerId` (from auth middleware) to Stripe. Safe.

### `POST /api/webhook/stripe` (routes/webhook-stripe.ts)
All data originates from Stripe's signed event payload (`stripe.webhooks.constructEventAsync` verifies the HMAC signature before any processing). The `userId`, `customerId`, and `subscriptionId` values come from Stripe's verified event object, not from the raw HTTP request body. DB updates use `.eq("id", userId)` or `.eq("stripe_customer_id", customerId)` with these verified values. Safe.

### `lib/middleware.ts` — `authMiddleware`
API key is extracted from the `Authorization` header and passed to `.eq("api_key", apiKey)`. PostgREST parameterizes this. A SQL-special-character-laden API key would simply return no row and be rejected with 401. Safe.

### `lib/middleware.ts` — `rateLimitMiddleware`
Calls `supabase.rpc("increment_daily_usage", { p_user_id: user.id })`. The `user.id` is a UUID from the auth-validated DB row. The RPC function body uses a typed UUID parameter with no dynamic SQL construction. Safe.

### `lib/cache.ts`
Cache get/set/increment use SHA-256 hex hashes as keys. Hex strings contain only `[0-9a-f]`. Safe.

### Postgres helper functions (migrations/002_helper_functions.sql)
`increment_cache_hit(p_hash TEXT)` and `increment_sonnet_usage(p_user_id UUID, p_month TEXT)` use parameterized PL/pgSQL — no `EXECUTE` or dynamic SQL construction. Safe.

### `scripts/seed-test-user.ts`
Uses hardcoded `TEST_EMAIL` constant — not user input. Lookup uses `.eq("email", TEST_EMAIL)`. Dev-only script, not exposed at runtime. Safe.

---

## Testing Limitations

- **RPC function implementations are fully visible** (all three migration files read). No blind spots.
- **No additional route files or middleware discovered** beyond what was listed in the task scope.
- **Supabase PostgREST internals** were not audited — trust is placed on Supabase's implementation of parameterized queries. This is industry-standard and not a speculative risk.
- **No authenticated testing performed** — analysis is static code review only. Dynamic injection testing (sending actual payloads to a running instance) was not in scope.

---

## Recommendations Summary

1. **(Medium — fix before launch)** Add `v.uuid()` validation to `decodeId` in `packages/api/src/schemas/feedback.ts`. One-line change. Eliminates type-cast errors reaching Postgres and provides a clean 400 response to callers with bad input.

2. **(Low — note for future)** When building an admin dashboard to view `error_text_preview`, render it as plain text only. No code change needed now.

3. **(Informational)** The `logDecode` helper at `decode.ts:133` has a hardcoded `model_used: "haiku"` string regardless of which model was actually used (the `useModel` variable is available on the call site but not passed in). This is not a security issue but is a data integrity bug — Sonnet decodes are logged as Haiku.

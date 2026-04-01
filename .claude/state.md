# Session State: Error Decoder

**Last Updated**: 2026-03-31

---

## Critical Rules (synced from ~/.claude/CLAUDE.md)

1. **Push back FIRST**: Challenge bad ideas before helping.
2. **Personality (TOP PRIORITY)**: Be Cortana - snarky battle buddy, not corporate.
3. **Agent delegation (PROACTIVE)**: Delegate WITHOUT being asked.
4. **CLAUDE.md after compaction**: Re-read CLAUDE.md + state + plan.
5. **Plans & TODOs**: Multi-step plans → immediately write `.claude/todos.md`.
6. **Speculation**: Default to novel approaches. Mark speculation clearly.
7. **Decision tracking**: NEW → append to Active Decisions (with WHY).

---

## Current Context (REPLACE each update)

**Goal**: Build and launch an AI-powered debugging sidebar Chrome extension. Always-on, real-time error stream + network monitoring + element inspection + tech detection + source maps + AI decode.

**PRODUCT PIVOT (2026-03-28)**: Original "error decoder" concept killed. Chrome's built-in DevTools AI (Gemini) does error explanation for free with deeper page access. New product is a DEBUGGING DASHBOARD SIDEBAR that lives on the page — NOT inside DevTools. Streams errors in real-time, monitors network requests, inspects elements, detects tech stack, resolves source maps, batch-decodes with AI.

**Immediate Task**: Fixing auth/logout flow. User couldn't log out — Supabase sessions persisted due to autoRefreshToken race condition. Fixed in this session.

**Just Completed (2026-03-31)**:
- Fixed logout race condition in auth.html: logout now runs BEFORE Supabase client creation, uses throwaway client with autoRefreshToken:false, calls signOut({scope:"global"})
- Added "Log Out" button to auth.html success state
- Auth page logout now sends LOGOUT message to extension (background.ts handles it, clears storage)
- Extension build verified clean

**What's Working (ALL CORE FEATURES COMPLETE)**:
- Sidebar: injected iframe, pushes page, resizable width (drag handle), dark/light mode
- 3-tab UI: Errors (multi-select, per-tab) | Decode (Haiku/Sonnet picker, markdown output) | Inspect (element AI Q&A)
- Error capture: console.error/warn, unhandled exceptions, promise rejections (MAIN world content script)
- Network monitoring: chrome.webRequest (4xx, 5xx, CORS, failures)
- Tech stack detection: 90+ technologies with colored badges
- Source map resolution: JS stack traces + CSS rules → original filenames
- Element inspection: hover highlight, click select, CSS rules, computed styles, AI Q&A with file-finding
- API: decode, decode-batch, auth, checkout, portal, webhook, feedback, account, usage, health
- Database: all tables, RLS, triggers, functions live on Supabase
- Stripe: sync script, checkout, webhooks, portal
- Docker Compose: api (4001), web (4000), stripe-cli
- Copy buttons, loading states, no-double-click protection
- Custom scrollbars, resize grips (textarea + sidebar)

**What's Left**:
- Phase 4: Auth flow testing (logout fixed, need to test full signup→checkout flow)
- Phase 7: Usage tracking UI (free tier limits in sidebar)
- Phase 10: Landing page
- Phase 11: Testing & QA
- Phase 12: Chrome Web Store prep
- Phase 13: Verification sweep

---

## Environment & Commands

**Local Dev**: Docker Compose with oven/bun:1.3.11 (no custom Dockerfile)
**Package Manager**: bun
**API Port**: 4001 | **Web Port**: 4000
**Docker network**: default bridge (no fixed subnet)

**Repo**: patrickrizzardi/error-decoder-extension
**Hosting**: Vercel (free tier) with Bun runtime (beta)
**Database**: Supabase (free tier, hosted Postgres)
**Payments**: Stripe (restricted test keys — needs rak_stripecli_session_write permission for CLI)
**AI**: Anthropic only (Haiku default, Sonnet for Pro explicit choice)
**Domain**: errordecoder.dev (Cloudflare)

**Test User**: test@errordecoder.dev / testpassword123 (Pro plan)
**Test API Key**: de5918b737257c018cd33287a2a8e356b17c4d5cc3db47e65911c13adadb1690

**Commands**:
```bash
docker compose up                    # Start all services
bun run packages/extension/build.ts  # Build extension
bun run scripts/seed-test-user.ts    # Create test user
bun run stripe:setup                 # Sync Stripe config
curl localhost:4001/api/health       # Test API
```

**Test page**: http://localhost:4000/test-errors

---

## Active Decisions

- [2026-03-27] **Pricing: $9/mo or $79/year, free tier 3/day**: Still valid
- [2026-03-27] **Tech: Vercel + Supabase + Stripe**: Still valid
- [2026-03-27] **All Anthropic, single provider**: Still valid
- [2026-03-27] **Hono for API, Docker Compose for dev**: Still valid
- [2026-03-27] **Stripe config as code, restricted keys from day one**: Still valid
- [2026-03-27] **Product name: ErrorDecoder (errordecoder.dev)**: Still valid
- [2026-03-28] **PRODUCT PIVOT: Always-on debugging sidebar**: Chrome DevTools AI killed "decode one error." New: real-time dashboard sidebar on the page.
- [2026-03-28] **chrome.webRequest for network monitoring**: Browser-level, no DevTools needed.
- [2026-03-28] **Element inspection via content script**: Hover/click/styles/CSS rules/AI Q&A.
- [2026-03-28] **Sidebar as injected iframe**: Chrome Side Panel API unreliable. Iframe works everywhere.
- [2026-03-30] **Markdown output from AI**: Dropped JSON schema — AI writes markdown, we render with `marked`. Kills parsing bugs, better natural responses.
- [2026-03-30] **Tech stack detection (90+)**: Frameworks, UI, build, state, runtime, analytics, payments, crypto, monitoring, chat, auth, hosting, CMS, databases. Feeds into AI prompts.
- [2026-03-30] **Source map resolution**: JS stack traces + CSS rules resolved to original filenames. Dev-time feature (needs .map files). Production falls back to grep suggestions.
- [2026-03-30] **No auto-decode**: User pastes/selects text, chooses model, clicks decode. No wasted API calls.
- [2026-03-30] **Haiku default, Sonnet explicit choice**: User picks model. No auto-switching based on complexity. Pro users see both buttons.
- [2026-03-30] **API port 4001**: Changed from 5000 to avoid conflict with VPM.
- [2026-03-30] **Per-tab errors**: Each tab has its own error feed. Cleaned up on tab close.
- [2026-03-31] **Logout fix: pre-client signOut**: Logout runs before Supabase client init to avoid autoRefreshToken race. Uses scope:"global" to revoke all sessions.

---

## Superseded/Archived

- Original "error decoder" concept — killed by Chrome DevTools AI
- Chrome Side Panel API — replaced with injected iframe
- JSON schema AI output — replaced with markdown
- Auto-model selection (Haiku vs Sonnet by complexity) — user picks instead
- API port 5000 — changed to 4001
- Custom Dockerfile — removed
- Popup (paste mode) — removed, sidebar is the product
- Fixed Docker subnet — removed, using default bridge
- Old logout flow (signOut after client init) — replaced with pre-client signOut to fix race condition

---

## Remember for This Project

- Patrick has NEVER sold or marketed anything before
- Pattern of overscoping — keep scope small, fight feature creep
- He wants Claude to build 90%+ — review-only workflow
- Goal is debt payoff acceleration — $500/mo matters
- Chrome DevTools AI is the main competitor — our edge is always-on + multi-signal + tech detection + source maps
- Console capture uses MAIN world content script (document_start) + relay script (document_start, isolated) — CSP safe
- API port is 4001 (changed from 5000 to avoid VPM conflict)
- Docker Compose: no custom Dockerfile, use images directly
- Stripe config is ALL code — scripts/stripe-setup.ts
- Stripe CLI needs rak_stripecli_session_write permission on restricted key
- Supabase key naming: SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
- Git commits need Patrick's approval (permission blocked for Claude)
- Code needs DRY cleanup pass — sidepanel/index.ts is large, panel.ts has inline styles
- Auth page logout now sends LOGOUT message to extension via chrome.runtime.sendMessage

# Session State: Error Decoder

**Last Updated**: 2026-03-28

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

**Goal**: Build and launch an AI-powered debugging sidebar Chrome extension. Always-on, real-time error stream + network monitoring + element inspection + AI decode.

**PRODUCT PIVOT (2026-03-28)**: Original "error decoder" concept killed. Chrome's built-in DevTools AI (Gemini) does error explanation for free with deeper page access. New product is a DEBUGGING DASHBOARD SIDEBAR that lives on the page — NOT inside DevTools. Streams errors in real-time, monitors network requests, inspects elements, batch-decodes with AI. This is what Chrome AI DOESN'T do.

**Immediate Task**: Pivoting extension — add chrome.webRequest network monitoring, fix console capture, redesign sidebar as real-time dashboard, build element inspection mode.

**In Progress**:
- Updating plan/state/todos for pivot
- Extension pivot: sidebar → real-time debugging dashboard
- Console error capture still broken (script tag injection chain issue)

**What's Working**:
- API fully functional (decode, auth, stripe, usage, feedback, account deletion)
- Sidebar injection into pages (slides in from right)
- Context menu "Decode this error" → sidebar
- Popup paste mode with inline results
- Extension builds and loads in Chrome + Opera
- Database live on Supabase (all tables, RLS, triggers, functions)
- Docker Compose dev environment

**What's Broken/Blocked**:
- Console error capture not reaching the sidebar (debugging in progress)
- Chrome Side Panel API doesn't work (using injected iframe instead — fine)

---

## Environment & Commands

**Local Dev**: Docker Compose with oven/bun:1.3.11 (no custom Dockerfile)
**Package Manager**: bun
**API Port**: 5000 | **Web Port**: 4000
**Network Subnet**: 10.9.1.0/24

**Repo**: patrickrizzardi/error-decoder-extension
**Hosting**: Vercel (free tier) with Bun runtime (beta)
**Database**: Supabase (free tier, hosted Postgres)
**Payments**: Stripe (restricted test keys)
**AI**: Anthropic only (Haiku for decodes, Sonnet for deep/batch analysis)
**Domain**: errordecoder.dev (Cloudflare)

**Test User**: test@errordecoder.dev / testpassword123 (Pro plan)
**Test API Key**: de5918b737257c018cd33287a2a8e356b17c4d5cc3db47e65911c13adadb1690

**Commands**:
```bash
docker compose up                    # Start all services
bun run packages/extension/build.ts  # Build extension
bun run scripts/seed-test-user.ts    # Create test user
bun run stripe:setup                 # Sync Stripe config
curl localhost:5000/api/health       # Test API
```

**Test page**: http://localhost:4000/test-errors

---

## Active Decisions

- [2026-03-27] **Product: AI Error Decoder Chrome Extension**: SUPERSEDED — see 2026-03-28 pivot
- [2026-03-27] **Pricing: $9/mo or $79/year, free tier 3/day**: Still valid
- [2026-03-27] **Tech: Vercel + Supabase + Stripe**: Still valid
- [2026-03-27] **All Anthropic, single provider**: Still valid
- [2026-03-27] **Hono for API, Docker Compose for dev**: Still valid
- [2026-03-27] **Stripe config as code, restricted keys**: Still valid
- [2026-03-27] **Product name: ErrorDecoder (errordecoder.dev)**: Still valid — name works for new angle too
- [2026-03-28] **PRODUCT PIVOT: Always-on debugging sidebar**: Chrome DevTools AI killed the "decode one error" concept. New product: real-time debugging dashboard sidebar that lives ON the page (not in DevTools). Streams console errors + network failures, batch AI decode, element inspection. Differentiation: always-on + multi-signal + outside DevTools.
- [2026-03-28] **chrome.webRequest for network monitoring**: Browser-level API, catches ALL requests including from iframes/workers. No DevTools needed. Permission: "webRequest" + host_permissions.
- [2026-03-28] **Element inspection via content script**: Hover highlight + click select + computed styles. Proven by CSS Scan, Element Inspector extensions. AI Q&A on selected elements.
- [2026-03-28] **Sidebar stays as injected iframe**: Chrome Side Panel API doesn't work reliably. Injected iframe is more reliable and works in all Chromium browsers.

---

## Superseded/Archived

- Original "error decoder" concept — killed by Chrome DevTools AI (Gemini) which does error explanation for free with deeper page access
- Chrome Side Panel API approach — doesn't work, replaced with injected iframe
- Custom Dockerfile — removed, using oven/bun:1.3.11 directly
- Contractor AI tool, full SaaS, Etsy POD — all shelved earlier

---

## Remember for This Project

- Patrick has NEVER sold or marketed anything before
- Pattern of overscoping — keep scope small, fight feature creep
- He wants Claude to build 90%+ — review-only workflow
- Goal is debt payoff acceleration — $500/mo matters
- Chrome DevTools AI is the main competitor — our edge is always-on sidebar + multi-signal + batch decode + element inspection
- Console error capture has been buggy — needs proper debugging, check at every step of the chain
- API port is 5000 (Patrick's preference)
- Docker Compose: no custom Dockerfile, use images directly
- Stripe config is ALL code — scripts/stripe-setup.ts
- Supabase key naming: SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
- Git commits need Patrick's approval (permission blocked for Claude)

# Session State: Error Decoder

**Last Updated**: 2026-04-02

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

**Goal**: Launch ErrorDecoder and get first paying customers. CWS submitted, prepping launch content while waiting for review.

**PRODUCT PIVOT (2026-03-28)**: Original "error decoder" concept killed. New product is a DEBUGGING DASHBOARD SIDEBAR that lives on the page — NOT inside DevTools.

**Status**: CWS submitted for review (2026-04-02). All infrastructure live. Demo video + GIF done. Running full codebase audit (10 analyzers) before launch.

**Current Task**: Full codebase audit in progress — 10 parallel analyzers (security, SQL injection, bugs, performance, cleanup, redundancy, consistency, consolidation, documentation, UX). Waiting for all agents to complete, then will coordinate findings into `.analysis/audit-report.md`.

**Completed This Session (2026-04-02)**:
- Full Vercel deployment (Build Output API — went through several iterations to get working)
- errordecoder.dev live with SSL, clean URLs
- Stripe live mode (products, prices, webhook)
- Supabase reset (app tables + auth.users)
- Privacy policy + Terms legally reviewed by agent and fixed (12 critical/high findings)
- Sensitive data detection feature (secrets + PII — SSN, credit cards, bank accounts, etc.)
- sidePanel permission removed
- Extension zipped and submitted to CWS
- Cloudflare email routing set up
- Demo video recorded, trimmed (cut loading wait), converted to GIF
- marketing/ folder created
- Free signup flow tested on production
- Launched full codebase audit (10 analyzers in parallel)

**What's Next**:
- Complete audit: read all .analysis/*.md reports, coordinate, present findings
- Fix audit findings (after user approval)
- Draft all 6 launch posts (Claude writes, Patrick reviews) — old drafts are OUTDATED (reference wrong product)
- Test paid checkout flow on production
- Draft personal outreach message
- Launch when CWS approves

**Known Issues**:
- Sidebar bottom cut off by page horizontal scrollbar (100vh issue) — deferred, edge case
- Launch posts in plan file reference old product (right-click decode, GPT-4o mini) — need full rewrite

---

## Environment & Commands

**Local Dev**: Docker Compose with oven/bun:1.3.11
**Package Manager**: bun
**API Port**: 4001 | **Web Port**: 4000

**Repo**: patrickrizzardi/error-decoder-extension
**Production**: errordecoder.dev (Vercel, Build Output API)
**Database**: Supabase (free tier, hosted Postgres)
**Payments**: Stripe (LIVE keys)
**AI**: Anthropic only (Haiku default, Sonnet for Pro)
**Domain**: errordecoder.dev (Cloudflare DNS, Vercel SSL)
**Email**: patrick@errordecoder.dev (Cloudflare routing)
**CWS Extension ID**: iffmfdckjpnejidjcpnpaeejgjengdlj

**Commands**:
```bash
docker compose up                    # Start all services
bun run packages/extension/build.ts  # Build extension
bun run stripe:setup                 # Sync Stripe config
curl errordecoder.dev/api/health     # Test production API

# Production extension build:
API_BASE=https://errordecoder.dev/api AUTH_URL=https://errordecoder.dev/auth bun run packages/extension/build.ts

# Deploy (auto on git push, or manual):
docker compose run vercel deploy --prod
```

**Marketing Assets**: marketing/demo.mp4, marketing/demo.gif (gitignored — large binaries)

---

## Active Decisions

- [2026-03-28] **PRODUCT PIVOT: Always-on debugging sidebar**
- [2026-04-02] **Vercel Build Output API**: Explicit function + static config, no auto-detection
- [2026-04-02] **Sensitive data detection**: Client-side regex + AI prompt backup, covers secrets + PII
- [2026-04-02] **Privacy/Terms**: Fully updated — auto-capture disclosed, GDPR basis, commercial use, NJ law
- [2026-04-02] **No sidePanel permission**: Removed, using injected iframe only
- [2026-04-02] **Marketing folder**: marketing/ for assets, large files gitignored
- [2026-04-02] **Daily check-in model**: Patrick checks in daily, Claude tells him what's next
- [2026-04-02] **Full codebase audit**: 10 analyzers before launch — security, bugs, perf, quality, docs, UX
- All prior decisions still valid

---

## Remember for This Project

- Patrick has NEVER marketed or sold anything before — marketing guidance must be specific and actionable
- Pattern of overscoping — keep scope small
- He wants Claude to build 90%+ — review-only workflow
- Goal is debt payoff acceleration — $500/mo matters
- Launch posts in plan are OUTDATED — reference old product (right-click decode, GPT-4o mini) — MUST rewrite before launch
- User wants daily check-ins: "what's next?" → Claude checks todos/plan and gives specific actions
- CWS review may take longer due to broad host permissions warning
- Supabase reset must include auth.users (DELETE FROM auth.users) not just app tables
- Vercel deployment uses Build Output API (.vercel/output/) — NOT the api/ directory convention
- Admin bypass: UPDATE users SET is_admin = true WHERE email = 'x' — gives Pro without Stripe

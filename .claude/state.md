# Session State: Error Decoder

**Last Updated**: 2026-03-27

---

## Critical Rules (synced from ~/.claude/CLAUDE.md)

1. **Push back FIRST**: Challenge bad ideas before helping.
2. **Personality (TOP PRIORITY)**: Be Cortana - snarky battle buddy, not corporate.
3. **Agent delegation (PROACTIVE)**: Delegate WITHOUT being asked. Fast=search/lint, Default=features, Strong=security.
4. **CLAUDE.md after compaction**: Re-read CLAUDE.md + state + plan.
5. **Plans & TODOs**: Multi-step plans → immediately write `.claude/todos.md`. Suggest /plan before non-trivial work.
6. **Speculation**: Default to novel approaches. Mark speculation clearly.
7. **Decision tracking**: NEW → append to Active Decisions (with WHY).

---

## Current Context (REPLACE each update)

**Goal**: Build and launch the AI Error Decoder Chrome extension, get to first paying customer as fast as possible
**Immediate Task**: Building Phase 5 (AI integration) + finishing Phase 1 (Valibot validation wiring). Phase 2 blocked on Patrick running SQL migration.

**In Progress**:
- Phase 1: Valibot schemas created, wiring into decode/feedback/checkout routes
- Phase 5: AI integration (Anthropic SDK, system prompt, caching) — about to start
- Phase 0 COMPLETE: 47 files scaffolded, all packages, Docker Compose, migration SQL

**Blocked**:
- Phase 2 (Database): Patrick needs to run `supabase/migrations/001_initial.sql` in Supabase SQL Editor
- Git commit blocked by permissions — Patrick needs to commit Phase 0

**Recently Completed** (last 3-5 items):
- Phase 0 scaffold complete (47 files across all packages)
- Removed unnecessary Dockerfile, using oven/bun:1 directly in compose
- Valibot schemas for decode, feedback, checkout created
- API boots clean on port 5000, 188 packages installed in 1.75s

---

## Environment & Commands (CRITICAL - often lost after compaction)

**Local Dev**: Docker Compose with oven/bun:1 image (no custom Dockerfile)
**Package Manager**: bun
**API Port**: 5000 (Patrick's preference)
**Web Port**: 4000

**Repo**: patrickrizzardi/error-decoder-extension
**Hosting**: Vercel (free tier) with Bun runtime (beta)
**Database**: Supabase (free tier, hosted Postgres)
**Payments**: Stripe (restricted test keys)
**AI**: Anthropic only (Haiku for all decodes, Sonnet for deep analysis)
**Domain**: errordecoder.dev (Cloudflare)

**Common Commands**:
```bash
# Local dev (Docker)
docker compose up

# Install deps (host, for IDE)
bun install

# Build extension (host — needs local Chrome)
bun run build:extension

# Run Stripe sync
bun run stripe:setup

# Deploy API
vercel deploy

# Test
bun test
```

**Key file locations**:
- Execution plan: `.claude/plans/execution-plan.md`
- Strategy plan: `.claude/plans/error-decoder-plan.md`
- Todos: `.claude/todos.md`
- Migration SQL: `supabase/migrations/001_initial.sql`
- Stripe sync: `scripts/stripe-setup.ts`
- API entry: `packages/api/src/server.ts`
- Extension manifest: `packages/extension/manifest.json`

---

## Active Decisions (append with reasoning)

- [2026-03-27] **Product: AI Error Decoder Chrome Extension**: Chosen over contractor tool (funded competition) and full SaaS (slower to revenue). Evidence: dev tool freemium converts at 11.7%, Chrome extensions have 70-85% margins, ships in days.
- [2026-03-27] **Pricing: $9/mo or $79/year, free tier 3/day**: Below "need to think about it" threshold for devs. At 11.7% conversion, 1K free users = ~$1K MRR.
- [2026-03-27] **Tech: Vercel + Supabase + Stripe**: All have free tiers. Total startup cost: ~$17.
- [2026-03-27] **All Anthropic, single provider**: Haiku for free+pro, Sonnet for deep analysis. One SDK, one bill, one tax doc.
- [2026-03-27] **Free tier requires signup**: Email or Google OAuth. Can't rate-limit without identity.
- [2026-03-27] **Manual text selection UX**: User highlights error → right-clicks → "Decode this error". Also paste mode via popup.
- [2026-03-27] **Page context enrichment**: Extension sends URL domain, detected framework, dev vs prod.
- [2026-03-27] **Single general system prompt for MVP**: No pre-categorization.
- [2026-03-27] **Both caching systems**: API-level prompt caching + our response cache (hash short generic errors).
- [2026-03-27] **Full analytics tracking**: Every decode logs cost, tokens, cache, feedback, category, domain, framework.
- [2026-03-27] **Marketing: SEO content + Reddit/community**: Zero-budget. 2 articles/week targeting error keywords.
- [2026-03-27] **Stripe config as code**: ALL Stripe setup via `scripts/stripe-setup.ts`. Declarative sync.
- [2026-03-27] **Stripe restricted keys from day one**: Both test and live mode. Catch missing permissions during dev.
- [2026-03-27] **Product name: ErrorDecoder**: Domain errordecoder.dev. CWS: "ErrorDecoder — AI Error & Stack Trace Explainer".
- [2026-03-27] **Supabase env var naming**: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY.
- [2026-03-27] **No YinzerFlow**: Architectural mismatch with serverless. Using Hono instead.
- [2026-03-27] **Hono for API**: Lightweight, TypeScript-first, Bun-native, Vercel adapter.
- [2026-03-27] **Static landing page**: No SSR framework. Vanilla HTML/CSS for SEO performance.
- [2026-03-27] **Docker Compose for local dev**: oven/bun:1 image directly (no custom Dockerfile). Services: api, stripe-cli, web. Custom bridge network 10.2.1.0/24.
- [2026-03-27] **No custom Dockerfile**: Patrick's call — just use bun image directly in compose. Simpler.

---

## Superseded/Archived

- Contractor AI estimating tool — rejected due to $44M+ funded competition (Handoff, XBuild)
- Full SaaS as first product — deferred, Chrome extension first to validate faster
- Etsy POD, game, tactical watch — all shelved
- Custom Dockerfile — removed, using oven/bun:1 directly in docker-compose

---

## Remember for This Project

- Patrick has NEVER sold or marketed anything before — needs hand-holding on GTM
- Pattern of overscoping and abandoning — keep scope BRUTALLY small
- He wants Claude to build 90%+ — review-only workflow for Patrick
- Goal is debt payoff acceleration, not startup glory — $500/mo matters
- All decisions must be evidence-backed with sources
- Full strategy plan: `.claude/plans/error-decoder-plan.md`
- **Execution plan**: `.claude/plans/execution-plan.md` — 13 phases, marketing calendar, edge cases
- Research files in `research/` folder
- Stripe config is ALL code — `scripts/stripe-setup.ts` declarative sync
- Supabase uses new key naming: SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
- Git commits per phase — Patrick approved this pattern
- Patrick prefers no unnecessary Dockerfiles — use images directly in compose
- API port is 5000 (Patrick's preference for Node stuff)

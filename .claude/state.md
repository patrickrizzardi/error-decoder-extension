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
**Immediate Task**: Start Phase 0 (Pre-Build Setup) — accounts, repo, domain

**In Progress**:
- Project setup: CLAUDE.md, plan, research files, folder structure DONE
- Ready to begin Phase 0 setup tasks

**Recently Completed** (last 3-5 items):
- Market research: 20+ sources, competitive landscape analysis
- Evidence-based strategy document with citations
- Detailed implementation + GTM plan with day-by-day schedules
- Product chosen: AI Error Decoder Chrome extension
- Project folder created with all context files

---

## Environment & Commands (CRITICAL - often lost after compaction)

**Container Setup**: N/A initially — Vercel serverless
**Package Manager**: bun (Patrick's preference)

**Repo**: Not yet created — Phase 0 task
**Hosting**: Vercel (free tier)
**Database**: Supabase (free tier)
**Payments**: Stripe
**AI APIs**: OpenAI (GPT-4o mini for free tier) + Anthropic (Haiku/Sonnet for Pro tier)

**Common Commands** (fill in after repo created):
```bash
# Dev
bun dev

# Build extension
bun run build:extension

# Deploy API
vercel deploy

# Test
bun test
```

---

## Active Decisions (append with reasoning)

- [2026-03-27] **Product: AI Error Decoder Chrome Extension**: Chosen over contractor tool (funded competition) and full SaaS (slower to revenue). Evidence: dev tool freemium converts at 11.7%, Chrome extensions have 70-85% margins, ships in days.
- [2026-03-27] **Pricing: $9/mo or $79/year, free tier 3/day**: Below "need to think about it" threshold for devs. At 11.7% conversion, 1K free users = ~$1K MRR.
- [2026-03-27] **Tech: Vercel + Supabase + Stripe + multi-model AI**: All have free tiers. Total startup cost: ~$17.
- [2026-03-27] **All Anthropic, single provider**: Haiku for free+pro, Sonnet for deep analysis. One SDK, one bill, one tax doc. Saves ~$47/mo vs dual-provider at 500 users, but complexity cost isn't worth 9% revenue savings. Optimize at scale later.
- [2026-03-27] **Free tier requires signup**: Email or Google OAuth. Can't rate-limit without identity, can't build email list without emails. IP/MAC tracking unreliable. 10 seconds of friction, every dev tool does this.
- [2026-03-27] **Manual text selection UX**: User highlights error → right-clicks → "Decode this error". Also paste mode via popup. NO auto-scanning/DevTools for MVP. User controls input.
- [2026-03-27] **Page context enrichment**: Extension sends URL domain, detected framework, dev vs prod with the error text. Pro tier adds console error capture + network failure details. Makes answers specific, not generic.
- [2026-03-27] **Single general system prompt for MVP**: No pre-categorization. Always include local+production examples for env-dependent errors. Category-specific prompts deferred to Phase 3.
- [2026-03-27] **Both caching systems**: API-level prompt caching (reuse system prompt) + our response cache (hash short generic errors). Smart heuristic: cache <200 chars without file paths. Don't cache unique stack traces.
- [2026-03-27] **Full analytics tracking**: Every decode logs cost_cents, input/output tokens, cache_hit, thumbs_up, error_category, page_url_domain, detected_framework. No dashboard — query in DataGrip. SQL queries in plan file.
- [2026-03-27] **Future tiers (MVP2)**: GitHub repo integration tier ($29-49/mo) where Sonnet reads actual codebase for context-specific fixes. Design DB schema to support it now (nullable github fields on users table) but don't build it.
- [2026-03-27] **Marketing: SEO content + Reddit/community**: Zero-budget strategy. 2 articles/week targeting error keywords. Evidence: Senja.io credits SEO as #1 compounder.
- [2026-03-27] **Future product: DB Schema Explorer**: Saved for after Error Decoder validates. If extension hits $1K+ MRR, consider building Idea 1 as expansion.

---

## Superseded/Archived

- Contractor AI estimating tool — rejected due to $44M+ funded competition (Handoff, XBuild)
- Full SaaS as first product — deferred, Chrome extension first to validate faster
- Etsy POD, game, tactical watch — all shelved (see brainstorming session history)

---

## Remember for This Project

- Patrick has NEVER sold or marketed anything before — needs hand-holding on GTM, explain everything
- Pattern of overscoping and abandoning — keep scope BRUTALLY small, fight feature creep
- He wants Claude to build 90%+ — review-only workflow for Patrick
- Goal is debt payoff acceleration, not startup glory — $500/mo matters
- All decisions must be evidence-backed with sources (Patrick's explicit request)
- Full plan is at `.claude/plans/error-decoder-plan.md` — READ IT, it has everything
- Research files in `research/` folder — cite when making strategic decisions

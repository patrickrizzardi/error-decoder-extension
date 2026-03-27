# Error Decoder — Project CLAUDE.md

## What This Project Is

**Product**: AI Error Decoder — a Chrome extension that detects error messages and stack traces on any webpage and provides instant AI-powered explanations and fixes.

**Owner**: Patrick — solo developer, TypeScript/Node.js/SQL, first time building a product outside his day job. Has $80K in debt and is building this to accelerate payoff.

**Why This Product Was Chosen**: Extensive market research (see `research/` folder) compared 3 paths. This won because:
- Fastest time to revenue (days to build, weeks to first dollar)
- Chrome extensions have 70-85% profit margins, built-in distribution
- Dev tool freemium-to-paid conversion: 11.7% (vs 2.6% general SaaS)
- Patrick's TypeScript skills are a perfect match
- Claude can build 90%+ of this
- $17 startup cost
- Full evidence and sources in `research/evidence-based-strategy.md`

**Future Product**: AI Database Schema Explorer (saved for after this validates). Details in `research/evidence-based-strategy.md` Section 3, Idea 1.

---

## The Plan

The full detailed plan lives at `.claude/plans/error-decoder-plan.md`. READ IT before starting any work — it has phase-by-phase breakdowns, day-by-day marketing schedules, blog post topics, metrics targets, risk register, and budget.

**Phases**:
- Phase 0: Pre-Build Setup (accounts, repo, domain)
- Phase 1: Build MVP (Days 2-5)
- Phase 2: Landing Page (Days 5-6)
- Phase 3: Pre-Launch (Days 6-7) — write all launch posts in advance
- Phase 4: Launch Week (Days 8-14) — day-by-day marketing schedule
- Phase 5: Content Marketing Engine (Weeks 3-8) — 2 blog posts/week
- Phase 6: Growth & Iteration (Months 3-6)

---

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Extension | TypeScript + Chrome Manifest V3 | Patrick's core skill, modern extension standard |
| Backend API | Node.js/Bun on Vercel (serverless) | Free tier, zero ops, fast deploys |
| AI (Free + Pro) | Claude Haiku 4.5 ($1/$5 per 1M tokens) | One provider, good quality, ~$0.004/decode |
| AI (Deep Analysis) | Claude Sonnet 4.6 ($3/$15 per 1M tokens) | Complex errors, 20/month for Pro users |
| Auth | Supabase Auth (magic link or email/pass) | Free tier, easy integration |
| Database | Supabase (Postgres) | Free tier handles early scale |
| Payments | Stripe (Checkout + Customer Portal) | Industry standard, simple integration |
| Landing Page | Part of Vercel app (Next.js or static) | Same deploy, zero extra cost |
| Analytics | Vercel Analytics or Plausible | Privacy-friendly, lightweight |

**Model decision (final)**: All Anthropic. Haiku for free+pro, Sonnet for deep analysis. One SDK, one bill, one integration. Haiku free tier costs ~$54/mo at 500 users (covered by ~$527 revenue). Simplicity > saving $47/mo with a second provider. See plan file for full cost breakdown.

---

## Product Spec

### Core Feature
1. User browses any webpage (Stack Overflow, GitHub, logs, docs)
2. Selects error text / stack trace
3. Right-click → "Decode this error" (or click extension icon → paste)
4. Extension calls backend API → Claude AI analyzes the error
5. Results shown in popup/sidebar with sections:
   - **What Happened**: Plain English explanation
   - **Why**: Root cause analysis
   - **How to Fix**: Step-by-step solution
   - **Code Example**: Copy-pasteable fix
6. Copy button for code examples

### Pricing

| Feature | Free (requires account) | Pro ($9/mo or $79/year) |
|---------|------------------------|------------------------|
| Decodes per day | 3 | Unlimited |
| AI Model | Claude Haiku 4.5 | Claude Haiku 4.5 (default) |
| Deep Analysis (Sonnet) | No | 20/month |
| Decode history | No (not saved) | Full searchable history |
| Input size limit | 1,000 chars | Unlimited |
| Page context (URL, framework) | Basic | Full (console errors, network details) |

**Free tier requires email signup or Google OAuth.** Non-negotiable. Can't rate-limit without identity, can't build an email list without emails, and IP tracking is unreliable (VPNs, dynamic IPs). Sign-up friction is minimal (10 seconds) and every dev tool requires it.

### UX Flow
1. **Text selection mode (primary)**: User highlights error text on any webpage → right-clicks → "Decode this error" → extension reads `window.getSelection()` → calls API → shows result in popup/sidebar
2. **Paste mode (secondary)**: User clicks extension icon → pastes error from terminal/Slack/email → clicks "Decode" → shows result
3. **Page context enrichment**: Extension automatically includes current URL domain, detected framework (React/Vue/Angular from DOM markers), and dev vs prod detection (localhost check) in the AI prompt for more specific answers
4. **Pro page context**: Also captures console errors (via `console.error` intercept) and network failure details (via PerformanceObserver) for richer AI context
5. **No auto-scanning for MVP**: User controls what gets decoded. No DevTools panel integration needed.

### System Prompt Strategy
- **MVP: ONE general-purpose system prompt** — no pre-categorization needed
- The AI model handles error classification naturally (CORS, HTTP, runtime, etc.)
- System prompt instructs: always provide both localhost and production examples for env-dependent errors (CORS, networking, auth)
- System prompt instructs: detect framework from page context and tailor code examples accordingly
- SPA/bundled code detection: if minified stack traces detected, AI notes source maps
- Category-specific prompts deferred to Phase 3 after usage data shows most common error types

### API Architecture
- `POST /api/decode` — main decode endpoint (auth required, model selected by plan)
- `POST /api/auth/signup` — create account (email or Google OAuth)
- `POST /api/auth/login` — magic link or password
- `POST /api/checkout` — create Stripe checkout session
- `POST /api/webhook/stripe` — handle Stripe events
- `GET /api/usage` — check remaining free decodes today

### Database Schema (Supabase/Postgres)

```sql
-- Core tables
users (id, email, api_key, plan, stripe_customer_id, created_at)

decodes (
  id, user_id, error_text_hash, response,
  model_used,           -- "haiku" or "sonnet"
  input_tokens,         -- actual input tokens
  output_tokens,        -- actual output tokens
  cost_cents,           -- calculated cost (e.g., 0.4 = $0.004)
  cache_hit,            -- boolean: served from cache?
  response_time_ms,     -- API latency
  thumbs_up,            -- nullable boolean: user feedback
  error_category,       -- nullable: "cors", "http_500", "runtime", etc. (set by AI)
  page_url_domain,      -- nullable: "stackoverflow.com", "localhost", etc.
  detected_framework,   -- nullable: "react", "vue", "express", etc.
  created_at
)

daily_usage (user_id, date, count)

response_cache (error_text_hash, response, hit_count, created_at)
```

**Analytics approach**: No dashboard. Query directly in DataGrip/pgAdmin. Track: cost per tier per month, avg cost per user, cache hit rate, thumbs down rate, users hitting free limit (conversion signal), top-cost users (abuse detection). See plan file for exact SQL queries.

### Cost Controls
- **Both caching systems**: API-level prompt caching (reuse system prompt, ~50% savings on prompt tokens) + our response cache (identical short errors return cached response, zero API cost)
- Cache heuristic: cache errors under ~200 chars without specific file paths. Don't cache errors with unique stack traces.
- Monthly budget cap: reduce free tier to 2/day if costs exceed target
- Token limits: free tier capped at 1,000 input chars
- Free tier cost at 500 users (Haiku): ~$54/month, covered by ~$527 revenue

---

## Working Agreements

- **Ship ugly, ship fast.** Revenue matters more than polish. Patrick's pattern is overscoping — fight it actively.
- **Claude builds, Patrick reviews.** Claude writes 90%+ of the code. Patrick reviews, tests, and publishes.
- **Evidence over vibes.** All strategic decisions cite sources. See `research/` folder.
- **Track progress in todos.** All work items in `.claude/todos.md`. Never in code comments.
- **Small PRs, frequent deploys.** Don't batch up 3 days of work. Ship incrementally.

---

## Key Context for New Sessions

- This product was selected after comparing contractor AI tools (rejected — $44M+ funded competitors like Handoff AI and XBuild), Chrome extensions (selected — proven solo dev model), and full SaaS (saved for later — slower path).
- Patrick has never marketed or sold anything before. The plan includes a complete marketing playbook for a first-timer with $0 budget.
- The content marketing strategy (2 blog posts/week targeting error keywords) is the primary long-term growth engine. SEO compounds.
- Competitive research shows 12+ basic text-to-SQL tools exist but NO lightweight Chrome extension that auto-detects and explains errors in-context on any webpage.
- Revenue expectations are realistic: median 12-18 months to $1K MRR, but top quartile (good execution) hits it in 6-9 months. Even $500/mo extra meaningfully accelerates $80K debt payoff.

---

## Files Reference

| File | Purpose |
|------|---------|
| `.claude/plans/error-decoder-plan.md` | Full implementation + GTM plan with day-by-day detail |
| `.claude/state.md` | Current session state (what's in progress, recent decisions) |
| `.claude/todos.md` | Active task list with phases and checkboxes |
| `research/evidence-based-strategy.md` | Market analysis, revenue data, 20+ cited sources |
| `research/competitive-landscape.md` | Detailed competitor analysis across all niches explored |

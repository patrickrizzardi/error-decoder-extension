# Todos: ErrorDecoder

## Current Goal
Launch the extension, get first users, build to $1K MRR. CWS submitted for review — prepping launch content while waiting.

## In Progress

### Codebase Audit (2026-04-02)
- [x] Launch 10 analyzers in parallel (security, SQL injection, bugs, perf, cleanup, redundancy, consistency, consolidation, docs, UX)
- [ ] Wait for all agents to complete
- [ ] Read all .analysis/*.md reports
- [ ] Coordinate findings (dedup, resolve conflicts, dependency order)
- [ ] Write .analysis/audit-report.md
- [ ] Present summary to Patrick
- [ ] Fix approved findings

## Completed ✅

### Core Product
- [x] All features built (errors, network, inspect, tech detect, source maps, AI decode)
- [x] Sidebar: injected iframe, resizable, dark/light mode, 3-tab UI
- [x] Sensitive data detection (PII + secrets — client-side regex + AI prompt backup)

### Infrastructure
- [x] API deployed to Vercel (errordecoder.dev, Build Output API)
- [x] Supabase Auth + database (reset, clean)
- [x] Stripe live (products, prices, webhook at /api/webhook/stripe)
- [x] SSL, custom domain, clean URLs (/auth, /privacy, /terms)
- [x] Docker Compose for local dev
- [x] Cloudflare email routing (patrick@errordecoder.dev)

### Chrome Web Store
- [x] Extension built with production URLs
- [x] Icons (128, 48, 16)
- [x] Screenshots (4x 1280x800)
- [x] Small promo tile (440x280)
- [x] Store listing copy + permission justifications
- [x] Submitted for review (2026-04-02)

### Legal
- [x] Privacy policy: auto-capture disclosed, GDPR legal basis, data locations, CCPA categories, PII
- [x] Terms: commercial use allowed, severability, force majeure, NJ governing law
- [x] sidePanel permission removed (not used)
- [x] Legal agent review completed — all critical/high findings addressed

### Marketing Assets
- [x] Demo video recorded + trimmed (19 sec)
- [x] Demo GIF created (960x540, 1.4MB, 15fps)
- [x] marketing/ folder set up

### Testing
- [x] Free signup flow tested on production
- [x] API health verified on production
- [x] Sensitive data detection tested

## Waiting
- [ ] Chrome Web Store review (1-3+ days, submitted 2026-04-02)

## Next — Pre-Launch Prep

### Launch Posts (Claude drafts, Patrick reviews)
- [ ] Reddit r/webdev post — rewrite for sidebar product
- [ ] Reddit r/programming post — rewrite for sidebar product
- [ ] Hacker News Show HN post — rewrite for sidebar product
- [ ] Indie Hackers post — rewrite (keep debt story angle)
- [ ] Twitter/X post — rewrite with demo GIF
- [ ] Dev.to article — rewrite for sidebar product

### Remaining Pre-Launch
- [ ] Test paid checkout flow on production (Stripe live)
- [ ] Draft personal outreach message for 10-20 dev friends

## Phase 4: Launch Week (after CWS approval)

### Day 1 — LAUNCH DAY (Monday ideal)
- [ ] Post Hacker News (Show HN) — 8-9 AM EST
- [ ] Post Reddit r/webdev — 8-9 AM EST
- [ ] Post Reddit r/programming — 10-11 AM EST
- [ ] Post Twitter/X with demo GIF — 10-11 AM EST
- [ ] Post Indie Hackers — afternoon
- [ ] Publish Dev.to article — afternoon
- [ ] Respond to EVERY comment on every platform

### Day 2 — Ride the Wave
- [ ] Continue responding to all comments
- [ ] Post in r/javascript, r/reactjs, r/node (naturally, not spam)
- [ ] Share positive feedback on Twitter

### Day 3 — Transparent Update
- [ ] Post Day 3 numbers on Indie Hackers
- [ ] Twitter thread: "Lessons from my first 3 days"

### Day 4-5 — Expand
- [ ] LinkedIn post (personal story + product)
- [ ] Developer Discord/Slack communities (#showcase channels)

### Day 7 — Week 1 Retro
- [ ] Compile metrics (installs, signups, conversions, revenue)
- [ ] Write "Week 1 Retrospective" for Indie Hackers + Twitter

## Phase 5: Content Marketing (Weeks 3-8)
- [ ] Set up blog section on errordecoder.dev
- [ ] 2 posts/week targeting error keywords (see plan for full topic list)

## MVP2 — Post-Launch
- [ ] Google OAuth
- [ ] Decode history UI (Pro feature)

## Future
- [ ] GitHub repo integration (premium)
- [ ] VS Code extension (same backend)

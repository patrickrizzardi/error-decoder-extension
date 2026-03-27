# Todos: Error Decoder

## Current Goal
Build and launch the AI Error Decoder Chrome extension. Get to first paying customer ASAP.

## Active Phases

### Phase 0: Pre-Build Setup ⏳
- **Agent**: Patrick (account creation) + Claude (repo setup)
- **Tasks**:
  - [ ] 0.1 Create Chrome Developer account ($5)
  - [ ] 0.2 Create Stripe account (free)
  - [ ] 0.3 Create Vercel account (free tier, connect GitHub)
  - [ ] 0.4 Create Supabase project (free tier)
  - [ ] 0.5 Confirm Anthropic API key for Claude Haiku
  - [ ] 0.6 Create GitHub repo: `error-decoder`
  - [ ] 0.7 Pick product name + grab domain (~$12)

### Phase 1: Build MVP (Days 2-5)
- **Agent**: Claude (builds) + Patrick (reviews)
- **Tasks**:
  - [ ] 1.1 Scaffold Chrome extension (Manifest V3, TypeScript)
  - [ ] 1.2 Scaffold backend API (Bun on Vercel serverless)
  - [ ] 1.3 Set up Supabase tables (users, decodes, daily_usage)
  - [ ] 1.4 Claude API integration for error decoding
  - [ ] 1.5 Build decode flow end-to-end (select → right-click → result)
  - [ ] 1.6 Usage tracking (5/day free limit)
  - [ ] 1.7 Stripe integration (checkout, webhooks, customer portal)
  - [ ] 1.8 Auth flow (sign up/login via extension → web page)
  - [ ] 1.9 Extension UI polish (dark mode, result sections, copy button)
  - [ ] 1.10 Test on real errors (SO, GitHub, multiple languages)
  - [ ] 1.11 Chrome Web Store listing assets (icons, screenshots, description)

### Phase 2: Landing Page (Days 5-6)
- **Agent**: Claude (builds) + Patrick (reviews)
- **Tasks**:
  - [ ] 2.1 Build landing page (hero, how it works, pricing, FAQ)
  - [ ] 2.2 SEO basics (meta tags, OG tags, structured data)
  - [ ] 2.3 Analytics setup (Vercel Analytics or Plausible)

### Phase 3: Pre-Launch (Days 6-7)
- **Agent**: Claude (drafts) + Patrick (reviews/posts)
- **Tasks**:
  - [ ] 3.1 Record demo GIF (30-60 seconds)
  - [ ] 3.2 Write ALL launch posts in advance (Reddit, HN, IH, Twitter, Dev.to)
  - [ ] 3.3 Send pre-launch email to 10-20 developer friends
  - [ ] 3.4 Self-test: use extension for a full work day
  - [ ] 3.5 Have 2-3 friends install and test
  - [ ] 3.6 Fix showstopper bugs
  - [ ] 3.7 Submit to Chrome Web Store (1-3 day review)

### Phase 4: Launch Week (Days 8-14)
- **Agent**: Patrick (posts + engages) + Claude (drafts responses)
- **Tasks**:
  - [ ] 4.1 Confirm Chrome Web Store approval
  - [ ] 4.2 Launch Day: HN (morning) → Reddit r/webdev (morning) → r/programming (mid-morning) → Twitter (mid-morning) → IH + Dev.to (afternoon)
  - [ ] 4.3 Respond to EVERY comment on every platform (Day 1-2)
  - [ ] 4.4 Day 3: Post transparent numbers on Indie Hackers
  - [ ] 4.5 Day 4-5: LinkedIn post + developer Discord/Slack communities
  - [ ] 4.6 Day 7: Week 1 retrospective post + metrics compilation

### Phase 5: Content Marketing Engine (Weeks 3-8) — NOT YET PLANNED IN DETAIL
- See plan file for weekly rhythm and first 16 blog post topics
- 2 articles/week targeting error keywords

### Phase 6: Growth & Iteration (Months 3-6) — NOT YET PLANNED IN DETAIL
- Error history feature, VS Code extension, Product Hunt launch
- See plan file for details

## Future (Not Yet Planned)
- VS Code extension version (same backend)
- Full SaaS web app expansion
- DB Schema Explorer (Idea 1 — second product if this validates)
- Email newsletter: "Top Errors This Month"
- Annual plan promotion campaign

## Completed
- [2026-03-27] Market research and competitive analysis (20+ sources)
- [2026-03-27] Evidence-based strategy document with citations
- [2026-03-27] Project folder structure and CLAUDE.md created
- [2026-03-27] Detailed implementation + GTM plan written

# Error Decoder — Full Implementation & Go-To-Market Plan

## Overview

**Product**: AI Error Decoder — a Chrome extension that detects error messages and stack traces on any webpage and provides instant AI-powered explanations and fixes.

**Why This Product**: See `research/evidence-based-strategy.md` for full analysis. Short version:
- Every developer hits errors multiple times daily (highest frequency use case)
- Broadest audience of any dev tool idea (all languages, all frameworks, all skill levels)
- Chrome extensions have 70-85% margins, built-in distribution, proven solo dev revenue
- Dev tool freemium-to-paid conversion: 11.7% (vs 2.6% general SaaS)
- $17 startup cost. Ship in days.
- SEO gold mine: every "how to fix [error]" article is a customer acquisition channel

**Future Product**: AI Database Schema Explorer (Idea 1 from strategy doc) — saved for after Error Decoder validates. See `research/evidence-based-strategy.md` Section 3.

**Revenue Target**: $1K MRR by month 4-6 (top quartile pace). Even $500/mo meaningfully accelerates $80K debt payoff.

---

## AI Model Strategy (Final — 2026-03-27)

### Single Provider: Anthropic

**Decision**: All Anthropic. Haiku for both free and pro tiers. Sonnet for deep analysis. One SDK, one bill, one tax document.

**Why not dual-provider (GPT-4o mini free + Haiku pro)?** The savings is ~9% of revenue (~$47/mo at 500 users). Not worth the complexity of two SDKs, two API integrations, two dashboards, two 1099s. Optimize for simplicity now. Add a second provider later at scale if needed.

Error decoding does NOT require deep reasoning. It's pattern recognition + knowledge recall + structured output. Haiku handles this extremely well. Sonnet is reserved for complex multi-step debugging as a Pro differentiator.

### Model Selection

| Tier | Model | Cost Per Decode | Why |
|------|-------|----------------|-----|
| **Free** | Claude Haiku 4.5 | ~$0.004 | Good quality, one provider simplicity |
| **Pro (default)** | Claude Haiku 4.5 | ~$0.004 | Same model, but unlimited + history + page context |
| **Pro "Deep Analysis"** | Claude Sonnet 4.6 | ~$0.011 | Complex errors, multi-step debugging, 20/month limit |

### 2026 API Pricing Reference

| Model | Input/1M tokens | Output/1M tokens | Source |
|-------|----------------|-------------------|--------|
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | ai.google.dev/pricing |
| GPT-4o mini | $0.15 | $0.60 | openai.com/api/pricing |
| Gemini 2.5 Flash | $0.30 | $2.50 | ai.google.dev/pricing |
| Claude Haiku 4.5 | $1.00 | $5.00 | platform.claude.com/docs/pricing |
| Claude Sonnet 4.6 | $3.00 | $15.00 | platform.claude.com/docs/pricing |
| Claude Opus 4.6 | $5.00 | $25.00 | platform.claude.com/docs/pricing |

**Note**: Gemini Flash-Lite ($0.10/$0.40) is even cheaper than GPT-4o mini. Could be swapped in if quality is comparable. Test both during development.

### Monthly Cost Projections (Realistic: 30% DAU, 3 avg decodes for free, 5 avg for pro)

| Users | Free Users | Pro Users (11.7%) | Free Decodes/Mo | Pro Decodes/Mo | Free Cost (Haiku) | Pro Cost (Haiku) | Total API Cost | Revenue | Margin |
|-------|-----------|-------------------|-----------------|----------------|-------------------|-----------------|----------------|---------|--------|
| 100 | 88 | 12 | 2,376 | 540 | $10 | $2 | **$12** | $108 | 89% |
| 500 | 442 | 58 | 11,934 | 2,610 | $48 | $10 | **$58** | $522 | 89% |
| 1,000 | 883 | 117 | 23,841 | 5,265 | $95 | $21 | **$116** | $1,053 | 89% |
| 2,500 | 2,208 | 293 | 59,616 | 13,185 | $238 | $53 | **$291** | $2,637 | 89% |

**Note**: Free tier costs more in aggregate than pro tier because there are 7.5x more free users. Each free user costs less per decode (capped at 3/day) but there are just way more of them. This is normal for freemium — the paid users subsidize the free ones.

**Bottom line**: At 500 users, API costs ~$58/mo against ~$522 revenue. 89% margin. Patrick's out-of-pocket before reaching 500 users is ~$10-20/mo. Response caching will reduce these costs by 30-50%.

### Cost Safety Measures
1. **Response caching**: Identical errors get cached responses. Zero API cost on cache hits. Could cut costs 30-50%.
2. **Monthly budget cap**: If free tier costs exceed $50/month, reduce free limit to 2/day temporarily.
3. **Token limits on free tier**: Free users: first 1,000 chars of error only. Pro: full error + stack trace.

---

## Pricing Model

| Feature | Free | Pro ($9/mo or $79/year) |
|---------|------|------------------------|
| Decodes per day | 3 | Unlimited |
| AI Model | GPT-4o mini | Claude Haiku 4.5 (default) |
| Deep Analysis (Sonnet) | No | 20/month |
| Decode history | No (not saved) | Full searchable history |
| Input size limit | 1,000 chars | Unlimited |
| Code examples | Basic | Detailed with context |

---

## System Prompt Architecture (MVP Approach)

### MVP: ONE General System Prompt

**Do NOT pre-categorize errors with regex for MVP.** The AI model handles classification naturally. A 500 error with a Postgres stack trace? The model reads it and knows it's a database issue. No regex needed.

Category-specific prompts are a Phase 3+ optimization after we have data on which errors users actually submit most.

### The System Prompt (Draft — iterate during development)

```
You are an expert developer debugger. A user has selected an error message or stack trace from a webpage. Your job is to explain it clearly and provide actionable fixes.

Analyze the error and respond in this exact format:

**What Happened**
[1-2 sentences: plain English explanation of the error]

**Why This Occurs**
[2-4 bullet points: the most common causes of this specific error, ordered by likelihood]

**How to Fix It**
[Numbered steps for the most likely fix. Include code if applicable.]

**Code Example**
[If relevant, show a before/after code snippet demonstrating the fix]

Rules:
- Be specific to THIS error, not generic debugging advice
- If the error includes a stack trace, reference specific lines/files mentioned
- If the stack trace references minified/bundled code (single-line files, hash filenames like main.a3f8b2.js), note that source maps would help and suggest the user enable them in their build config
- If you recognize the framework/library (React, Express, Django, etc.), tailor your advice to that framework
- Keep it concise. Developers don't want essays.
- If the error could have multiple distinct causes, briefly list the top 2-3 and explain how to determine which one applies
```

### SPA / Bundled Code Handling

When the extension detects minified references in stack traces:
- Detect patterns: single-line references (`:1:`), hash filenames (`main.a3f8b2c.js`), `webpack://` or `vite://` prefixes
- Add context to the AI prompt: "Note: this stack trace appears to reference bundled/minified code"
- The AI response should mention source maps and how to enable them
- In Chrome DevTools, source maps auto-resolve when `.map` files are available — but on webpages (Stack Overflow, GitHub issues), stack traces are always the raw minified version
- For local development: most frameworks (Vite, Next.js, webpack) serve source maps by default, so this is mainly a production debugging issue

### Error Types We Handle (Not Exhaustive — AI Handles Whatever It Gets)

The system prompt doesn't need to know about categories, but here's what users will commonly send:

**HTTP/Network:**
- Status codes (400, 401, 403, 404, 500, 502, 503, 504)
- CORS errors (multiple root causes: missing headers, preflight, credentials, mixed content)
- ERR_CONNECTION_REFUSED, ERR_NAME_NOT_RESOLVED, SSL errors
- Gateway errors (CloudFront, CloudFlare 520-527, nginx 499)
- DNS failures, timeout errors

**Runtime (JavaScript/Python/etc):**
- TypeError, ReferenceError, SyntaxError, RangeError
- Unhandled Promise Rejection
- Maximum call stack exceeded
- Segfaults (C/C++/Rust)

**Framework-Specific:**
- React hydration errors, too many re-renders
- Next.js build errors, SSR issues
- Express/Node.js middleware errors
- Django template errors, migration issues

**Build/Tooling:**
- Module not found, ERESOLVE dependency conflicts
- TypeScript compiler errors (TS2339, TS2345, etc.)
- Webpack/Vite build failures
- Docker errors, permission issues

**Database:**
- MySQL 1045 Access Denied, connection errors
- PostgreSQL "relation does not exist"
- Deadlocks, constraint violations
- ORM errors (Sequelize, Prisma, SQLAlchemy)

**Auth:**
- JWT expired/malformed/invalid signature
- OAuth token refresh failures
- CSRF mismatch, session errors
- Cookie issues (SameSite, Secure flag)

**The beauty of the general prompt approach**: We don't need to handle all these explicitly. The model reads the error and responds appropriately. We just need to make sure the system prompt produces consistently good output format.

---

## Phase 0: Pre-Build Setup (Day 1)

**Goal**: Get all accounts and infrastructure ready so building has zero friction.

### Steps:

- [ ] **0.1** Create Chrome Developer account ($5 one-time fee) at https://chrome.google.com/webstore/devconsole
- [ ] **0.2** Create Stripe account (free) at https://stripe.com — enable test mode
- [ ] **0.3** Create Vercel account (free tier) at https://vercel.com — connect GitHub
- [ ] **0.4** Create Supabase project (free tier) at https://supabase.com — for user accounts + usage tracking
- [ ] **0.5** Get Anthropic API key (for Haiku + Sonnet — you likely have one from Claude Code already)
- [ ] **0.6** Create a new GitHub repo: `error-decoder` (or whatever name we pick)
- [ ] **0.7** Pick a product name and grab the domain (~$12/year on Namecheap/Porkbun)
  - Name ideas to brainstorm: "DecodErr", "StackFix", "ErrorLens", "BugWhisperer", "Fixplain", etc.
  - Check Chrome Web Store for conflicts
  - Check domain availability

**Time**: ~1 hour
**Cost**: $5 (Chrome dev) + ~$12 (domain) = ~$17

---

## Phase 1: Build MVP (Days 2-5)

**Goal**: Working Chrome extension that can decode errors + backend API + Stripe payments. Ugly is fine. Functional is required.

### Day 2: Extension Core + Backend API Skeleton

- [ ] **1.1** Scaffold Chrome extension (Manifest V3, TypeScript)
  - Content script: detect selected text / right-click context menu
  - Popup UI: show results, usage counter, upgrade CTA
  - Background service worker: handle API calls
  - Options page: account settings, plan status
- [ ] **1.2** Scaffold backend API (Node.js/Bun on Vercel serverless)
  - POST `/api/decode` — accepts error text, returns AI explanation
  - Rate limiting middleware (3/day free, unlimited paid)
  - API key authentication
- [ ] **1.3** Set up Supabase tables
  - `users` (id, email, api_key, plan, stripe_customer_id, created_at)
  - `decodes` (id, user_id, error_text_hash, response, model_used, input_tokens, output_tokens, cost_cents, cache_hit, response_time_ms, thumbs_up, error_category, page_url_domain, detected_framework, created_at) — full analytics per decode
  - `daily_usage` (user_id, date, count)
  - `response_cache` (error_text_hash, response, hit_count, created_at) — cache short generic errors (<200 chars, no file paths)

### Day 3: AI Integration + Core UX

- [ ] **1.4** Implement Anthropic AI integration
  - Anthropic SDK only — Haiku for all decodes, Sonnet for deep analysis
  - Enable API-level prompt caching (reuse system prompt across calls, ~50% savings on prompt tokens)
  - System prompt (see System Prompt Architecture section above)
  - Response caching: hash error text, check Supabase cache before calling API
  - Calculate and store cost_cents on every decode for analytics
- [ ] **1.5** Build the decode flow end-to-end
  - User selects text → right-click "Decode this error" → extension calls API → shows result in sidebar/popup
  - Also support: click extension icon → paste error → decode
  - Bundled code detection: if minified references found, add note about source maps
  - Loading state, error state, success state
- [ ] **1.6** Implement usage tracking
  - Count decodes per day per user (free tier)
  - Show remaining free decodes in popup ("2 of 3 remaining today")
  - Block at limit with upgrade CTA
  - Free tier: 1,000 char input limit

### Day 4: Payments + Auth

- [ ] **1.7** Stripe integration
  - Create products + prices in Stripe ($9/mo and $79/year)
  - Checkout session creation endpoint
  - Webhook handler: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`
  - Customer portal for subscription management
- [ ] **1.8** Auth flow (REQUIRED for all users including free)
  - First decode attempt → "Create free account to get 3 decodes/day" → email or Google OAuth
  - Extension opens web page for auth (Supabase Auth handles magic link + Google OAuth)
  - On auth: generate API key, store in extension's chrome.storage
  - One-time friction, then logged in forever
  - Why required: can't rate-limit without identity, can't build email list without emails, IP tracking is unreliable (VPNs, dynamic IPs). Every dev tool requires signup. 10 seconds of friction.

### Day 5: Polish + Testing

- [ ] **1.9** Extension UI polish
  - Clean popup design (dark mode friendly — most devs use dark mode)
  - Results formatting: sections for "What Happened", "Why", "How to Fix", "Code Example"
  - Copy-to-clipboard for code suggestions
  - Thumbs up/down feedback on every decode (for prompt iteration later)
  - Link to upgrade page for free users hitting limit
  - Pro badge / "Deep Analysis" button for Sonnet decodes
- [ ] **1.10** Test on real error scenarios
  - Stack Overflow error pages
  - GitHub issue pages
  - Console error pages / browser DevTools
  - Various languages: JavaScript, Python, Java, Go, Rust, C#
  - SPA bundled code stack traces (minified references)
  - CORS errors (multiple variants)
  - HTTP status code pages
  - Database errors
  - Edge cases: partial errors, non-English text, extremely long stack traces
- [ ] **1.11** Create Chrome Web Store listing
  - Extension icon (128x128, 48x48, 16x16)
  - Promotional images (1280x800 screenshot, 440x280 tile)
  - Description copy (keyword optimized for Chrome Web Store search)
  - Privacy policy page (required by Chrome Web Store)
  - Category: Developer Tools

---

## Phase 2: Landing Page (Days 5-6)

**Goal**: A single-page website that explains the product and converts visitors to installs/subscribers.

- [ ] **2.1** Build landing page (can be part of the Vercel app)
  - Hero: headline + 15-second demo GIF + "Add to Chrome" button
  - How It Works: 3 steps with screenshots
  - Error types showcase: "Works with CORS, HTTP errors, stack traces, build errors, and more"
  - Pricing: Free vs Pro comparison table
  - FAQ: 5-6 common questions
  - Footer: privacy policy, terms, contact
- [ ] **2.2** SEO basics
  - Meta tags, Open Graph tags for social sharing
  - Structured data (Product schema)
  - Fast load time (static page on Vercel = instant)
- [ ] **2.3** Analytics
  - Vercel Analytics (free) or Plausible (privacy-friendly, ~$9/mo)
  - Track: page views, CTA clicks, Chrome Web Store click-throughs

---

## Phase 3: Pre-Launch (Days 6-7)

**Goal**: Build anticipation and have launch posts READY before going live. Do NOT launch cold.

### Day 6: Content Preparation

- [ ] **3.1** Record demo GIF / short video (30-60 seconds)
  - Show: find error on Stack Overflow → right-click → instant explanation
  - Include a CORS error decode (relatable to everyone)
  - Tools: OBS for screen recording, ezgif.com for GIF conversion
- [ ] **3.2** Write ALL launch posts in advance (don't wing it):

**Reddit Post (r/webdev) — Draft:**
```
Title: I built a Chrome extension that instantly explains error messages with AI

Body: Hey r/webdev — I'm a developer who got tired of copy-pasting errors
into ChatGPT, so I built a Chrome extension that does it automatically.

Select any error message or stack trace on any webpage (Stack Overflow,
GitHub, your logs) → right-click → get an instant explanation of what
went wrong and how to fix it.

Works with CORS errors, HTTP status codes, JavaScript exceptions,
build errors, database issues — basically anything you'd normally
Google or paste into ChatGPT.

Free tier: 3 decodes/day.

[Demo GIF]

Would love feedback from the community. What errors do you run into
most often?

[Link to Chrome Web Store]
```

**Reddit Post (r/programming) — Draft:**
```
Title: Show r/programming: AI-powered error decoder Chrome extension
(supports JS, Python, Go, Rust, Java, C#, and more)

Body: Built this because I kept doing the same thing — see an error,
copy it, open ChatGPT, paste it, wait. Figured I'd automate that
workflow.

It's a Chrome extension. Select any error text on any page, right-click,
and get a structured breakdown: what happened, why, how to fix it,
and a code example when relevant.

Handles everything from CORS and HTTP errors to framework-specific
issues (React hydration, Express middleware, Django templates, etc.)

Uses GPT-4o mini for the free tier (3/day), Claude Haiku and Sonnet
for Pro users who want deeper analysis.

[Demo GIF]

Technical details: Manifest V3, TypeScript, Vercel serverless backend.
Open to questions about the architecture.

[Link]
```

**Hacker News Post — Draft:**
```
Title: Show HN: [Product Name] – Chrome extension that explains errors with AI

Body: I built a Chrome extension that adds "Decode this error" to the
right-click menu on any webpage. Select an error message or stack trace,
and it returns a structured explanation: what happened, why, how to fix,
with code examples.

Free tier (3/day) uses GPT-4o mini. Paid tier uses Claude Haiku with
optional Sonnet for complex errors.

Tech stack: Manifest V3, TypeScript, Vercel serverless, Supabase,
Stripe. Caches responses for common errors to keep API costs near zero.

Interested in feedback on the prompt engineering approach — I'm using
a single general-purpose system prompt rather than error-category-specific
prompts. Seems to work well but curious if others have found otherwise.

[Link]
```

**Indie Hackers Post — Draft:**
```
Title: Day 1 revenue: $0. Here's what I'm building to pay off $80K in debt.

Body: I'm a full-time developer with $80K in debt. I did a bunch of market
research and decided to build a Chrome extension that explains error
messages with AI.

Why this specifically:
- 70-85% profit margins on Chrome extensions (ExtensionPay data)
- Dev tool freemium converts at 11.7% vs 2.6% for general SaaS
- API costs are under $7/month for 500 free users (GPT-4o mini is absurdly cheap)
- Every "how to fix [error]" blog post is a marketing channel

Pricing: Free (3/day, GPT-4o mini) → Pro $9/mo (unlimited, Claude Haiku/Sonnet)

I'll be posting transparent revenue updates here. Hold me accountable.

[Demo GIF]
[Link]
```

**Twitter/X Post — Draft:**
```
I built a Chrome extension that explains error messages with AI.

Select any error → right-click → instant explanation + fix.

Works with:
- CORS errors
- HTTP status codes
- Stack traces (any language)
- Build/compile errors
- Database errors

Free for 3 decodes/day.

[Demo GIF]
[Link]
```

**Dev.to Article — Draft Outline:**
```
Title: I Built a Chrome Extension That Decodes Error Messages With AI — Here's How

Sections:
1. The problem (copy-pasting errors into ChatGPT is tedious)
2. The solution (right-click → instant decode)
3. How it works technically (Manifest V3, multi-model AI, caching)
4. Interesting prompt engineering decisions
5. What's next
6. Try it out [link]
```

- [ ] **3.3** Prepare a simple email/message for friends/colleagues
  - "Hey, I built this thing, would you try it and give me honest feedback?"
  - Send to 10-20 people you know who code

### Day 7: Pre-Launch Testing

- [ ] **3.4** Install extension yourself, use it for a real work day
- [ ] **3.5** Have 2-3 friends install and test (catch bugs you missed)
- [ ] **3.6** Fix any showstopper bugs
- [ ] **3.7** Submit to Chrome Web Store (review takes 1-3 business days)

---

## Phase 4: Launch Week (Days 8-14)

**Goal**: Maximum visibility in the first week. This is your one shot at launch momentum.

### Day 8 (Monday — best day for Reddit/HN): LAUNCH DAY

- [ ] **4.1** Chrome Web Store should be approved by now (submitted Day 7)
- [ ] **4.2** Morning (8-9 AM EST):
  - Post on Hacker News (Show HN) — morning posts get more traction
  - Post on Reddit r/webdev
- [ ] **4.3** Mid-morning (10-11 AM EST):
  - Post on Reddit r/programming
  - Post on Twitter/X with demo GIF
- [ ] **4.4** Afternoon:
  - Post on Indie Hackers
  - Publish Dev.to article
  - Respond to EVERY comment on every platform. Engagement signals boost visibility.
- [ ] **4.5** Evening:
  - Check analytics: installs, page views, sign-ups
  - Note what questions people ask — these become FAQ items and blog topics
  - Reply to any remaining comments

### Day 9: Ride the Wave + Engage

- [ ] **4.6** Continue responding to all comments from Day 8 (check every 2-3 hours)
- [ ] **4.7** Post in additional subreddits ONLY if you have something valuable to add:
  - r/javascript, r/python, r/reactjs, r/node
  - Don't spam — contribute to existing error-related discussions and mention the tool naturally
- [ ] **4.8** Share any positive feedback/testimonials on Twitter/X
- [ ] **4.9** Note feature requests in todos, respond acknowledging them

### Day 10: Transparent Update Post

- [ ] **4.10** Post Day 3 numbers on Indie Hackers
  - "3 days after launch: X installs, Y sign-ups, $Z revenue. Here's what I learned."
  - People LOVE transparent indie hacker stories. This builds audience.
- [ ] **4.11** Twitter thread: "Lessons from my first 3 days launching a product"

### Day 11-12: Expand to New Channels

- [ ] **4.12** LinkedIn post about the journey
  - "I'm a developer with $80K in debt. Here's what I'm building to pay it off faster."
  - Personal story + product mention = LinkedIn gold
- [ ] **4.13** Find and join 2-3 developer Discord/Slack communities
  - Share in #showcase or #self-promotion channels (follow community rules!)
  - Examples: Theo's Discord, Web Dev community servers, language-specific servers
- [ ] **4.14** If any blog post ideas emerged from user questions, draft them

### Day 13-14: Week 1 Retrospective

- [ ] **4.15** Compile Week 1 metrics:
  - Chrome Web Store installs
  - Free sign-ups
  - Paid conversions
  - Revenue
  - Top referring sources
  - Most common errors decoded (insights for content strategy)
  - User feedback themes
  - Thumbs up/down ratio on decodes (prompt quality signal)
- [ ] **4.16** Write "Week 1 Retrospective" post for Indie Hackers + Twitter
- [ ] **4.17** Adjust pricing, free tier limits, or features based on feedback (if needed)

---

## Phase 5: Content Marketing Engine (Weeks 3-8)

**Goal**: Build the SEO machine that compounds over time. This is the REAL growth engine after launch hype fades.

**Evidence**: Solo founders report SEO drives 31%+ of traffic without extensive link building. Senja.io ($1M ARR) credits SEO + PLG as their two compounding growth channels. First paying customer from a blog post by month 3.

### Weekly Rhythm (5-7 hours/week total)

| Day | Activity | Time | Details |
|-----|----------|------|---------|
| **Monday** | Write blog post #1 | 1-1.5 hrs | Target a specific error message keyword (see list below) |
| **Tuesday** | Reddit engagement | 30-45 min | Answer questions in dev subreddits. Be helpful, NOT promotional. |
| **Wednesday** | Write blog post #2 | 1-1.5 hrs | Different error/topic than Monday |
| **Thursday** | Reddit/Twitter engagement | 30-45 min | Share insights, reply to threads about debugging |
| **Friday** | Weekly metrics + planning | 30 min | Check analytics, plan next week's content topics |
| **Weekend** | Optional: feature work | 0-2 hrs | Bug fixes, small improvements, user requests |

### Blog Post Strategy

**Format for each post:**
1. Title: "How to Fix [Specific Error Message] in [Language/Framework]"
2. What the error means (plain English)
3. Common causes (numbered list)
4. Step-by-step fix for each cause
5. Code examples
6. "Want instant error explanations? Try [Product Name] — free Chrome extension"
7. Related errors (internal links to other posts)

**First 16 Blog Post Topics (Weeks 3-10):**

Week 3:
1. "TypeError: Cannot read properties of undefined (reading 'X') — Complete Fix Guide"
2. "CORS Error Explained: Why Your API Call Is Blocked and How to Fix It"

Week 4:
3. "Module not found: Can't resolve — 5 Common Causes and Fixes"
4. "MySQL Error 1045 Access Denied — Troubleshooting Guide"

Week 5:
5. "React Error: Too many re-renders — What It Means and How to Fix"
6. "Python ModuleNotFoundError — Why It Happens After pip install"

Week 6:
7. "npm ERR! ERESOLVE unable to resolve dependency tree — The Fix"
8. "JavaScript Heap Out of Memory — How to Fix Node.js Memory Errors"

Week 7:
9. "Git Error: fatal: refusing to merge unrelated histories"
10. "Docker Error: port is already allocated — Quick Fix"

Week 8:
11. "TypeScript Error TS2339: Property does not exist on type"
12. "PostgreSQL ERROR: relation does not exist — Causes and Solutions"

Week 9:
13. "Next.js Hydration Error: Text content does not match"
14. "Python ImportError vs ModuleNotFoundError — What's the Difference?"

Week 10:
15. "Segmentation Fault Explained: What It Is and How to Debug It"
16. "AWS Lambda Timeout Error — How to Diagnose and Fix"

**Why these topics**: Every one of these gets googled thousands of times per month by developers. Each article is a potential funnel to the extension.

**How Claude helps**: Claude can draft these articles. Patrick reviews, adds personal touches, publishes. 1-1.5 hours per article is realistic with AI drafting.

### Month 2 Milestone Check

By end of Month 2, you should have:
- [ ] 8-10 blog posts published
- [ ] 500+ Chrome Web Store installs
- [ ] 10-30 paid users
- [ ] $90-270 MRR
- [ ] Clear data on which content drives installs
- [ ] User feedback on top feature requests

If you DON'T have this by Month 2, diagnose with data:
- People installing but not paying? → pricing problem. Test $5 or add Pro features.
- People not installing? → discovery/messaging problem. Change landing page copy, try different communities.
- People uninstalling quickly? → product problem. Check thumbs down data, fix prompt, improve UX.
- Each diagnosis has a different fix. Don't guess — look at the data.

---

## Phase 6: Growth & Iteration (Months 3-6)

### Month 3: Feature Expansion

Based on user feedback, likely additions:
- [ ] **6.1** Error history (see past decodes) — Pro feature
- [ ] **6.2** "Decode from clipboard" — paste any error without being on a webpage
- [ ] **6.3** Language/framework auto-detection — enhance system prompt with context
- [ ] **6.4** Category-specific prompts — NOW we have data on which errors are most common. Optimize prompts for top 3-5 categories.
- [ ] **6.5** VS Code extension (same backend, new frontend) — doubles addressable market

### Month 4: Content Doubling Down

- [ ] **6.6** By now SEO should be showing traction. Double down on what works.
- [ ] **6.7** Create a "Common Errors" directory page (link hub for SEO juice)
- [ ] **6.8** Consider guest posting on Dev.to, freeCodeCamp, Medium (free, high authority domains)
- [ ] **6.9** Product Hunt launch (they allow launches after major updates)

### Month 5-6: Compounding

- [ ] **6.10** SEO traffic should be compounding now — articles from Month 1-2 ranking
- [ ] **6.11** Consider annual plan promotion (lock in revenue, reduce churn)
- [ ] **6.12** Email list: send monthly "Top Errors This Month" newsletter to free users
- [ ] **6.13** Evaluate: Is this hitting revenue targets? If yes, keep going. If plateaued, consider Idea 1 (DB Schema Explorer) as second product.

---

## Key Metrics to Track

| Metric | Tool | Check Frequency |
|--------|------|-----------------|
| Chrome Web Store installs | Chrome Developer Console | Daily (week 1), Weekly after |
| Active users (DAU/WAU) | Supabase + custom analytics | Weekly |
| Free → Paid conversion rate | Stripe + Supabase | Weekly |
| MRR | Stripe Dashboard | Weekly |
| Churn rate | Stripe | Monthly |
| Blog traffic by post | Vercel Analytics / Plausible | Weekly |
| Top error types decoded | Supabase query | Monthly (informs content + prompts) |
| Chrome Web Store rating | Chrome Developer Console | Weekly |
| Thumbs up/down ratio | Supabase | Weekly (prompt quality signal) |
| API costs by model | OpenAI + Anthropic dashboards | Weekly |
| Cache hit rate | Supabase query | Monthly |

**Target benchmarks:**
- Install → Free signup: 30-50%
- Free → Paid conversion: 8-12% (dev tool average is 11.7%)
- Monthly churn: under 5% (target under 3%)
- Chrome Web Store rating: 4.5+ stars
- Thumbs up rate: 85%+ (if below, iterate on prompt)
- Cache hit rate: 30%+ after month 1

### Analytics SQL Queries (Run in DataGrip — No Dashboard Needed)

**Weekly cost check — am I losing money?**
```sql
SELECT date_trunc('month', created_at) as month,
  CASE WHEN u.plan = 'free' THEN 'free' ELSE 'pro' END as tier,
  count(*) as total_decodes,
  sum(cost_cents) / 100.0 as total_cost_dollars,
  count(distinct d.user_id) as unique_users,
  sum(cost_cents) / 100.0 / nullif(count(distinct d.user_id), 0) as cost_per_user
FROM decodes d JOIN users u ON u.id = d.user_id
WHERE created_at >= date_trunc('month', now())
GROUP BY 1, 2;
```

**Cache savings report:**
```sql
SELECT
  count(*) filter (where cache_hit) as cache_hits,
  count(*) filter (where not cache_hit) as api_calls,
  round(100.0 * count(*) filter (where cache_hit) / count(*), 1) as cache_hit_pct,
  sum(cost_cents) filter (where not cache_hit) / 100.0 as actual_cost
FROM decodes WHERE created_at >= date_trunc('month', now());
```

**Abuse detection — top cost users:**
```sql
SELECT d.user_id, u.email, u.plan, count(*) as decodes,
  sum(cost_cents) / 100.0 as cost
FROM decodes d JOIN users u ON u.id = d.user_id
WHERE d.created_at >= now() - interval '7 days'
GROUP BY 1, 2, 3 ORDER BY cost DESC LIMIT 20;
```

**Conversion signal — users hitting free limit:**
```sql
SELECT count(distinct user_id) as users_at_limit
FROM daily_usage
WHERE count >= 3
  AND user_id IN (SELECT id FROM users WHERE plan = 'free')
  AND date >= now() - interval '7 days';
```

**Quality check — thumbs down rate by model:**
```sql
SELECT model_used,
  count(*) filter (where thumbs_up = true) as up,
  count(*) filter (where thumbs_up = false) as down,
  round(100.0 * count(*) filter (where thumbs_up = false) /
    nullif(count(*) filter (where thumbs_up is not null), 0), 1) as pct_negative
FROM decodes WHERE thumbs_up IS NOT NULL GROUP BY model_used;
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Nobody installs | Medium | High | Validate with launch posts before heavy investment. If <100 installs in 2 weeks, pivot messaging not product. |
| People install but don't pay | Medium | Medium | Test pricing ($5, $7, $9). Add more Pro-only features. Survey free users. |
| AI answers are wrong/unhelpful | Low-Medium | High | Thumbs up/down on every decode. Iterate on system prompt weekly based on low-rated decodes. Cache good answers. |
| Chrome Web Store rejects extension | Low | Medium | Follow Manifest V3 guidelines strictly. Minimal permissions. Clear privacy policy. |
| API costs spike unexpectedly | Low | Medium | GPT-4o mini is $0.0005/decode. Monitor weekly. Response caching. Monthly budget cap. Can reduce free tier limit. |
| Competitor launches same thing | Medium | Low | First mover + SEO content moat + user base = defensible. Focus on execution speed. |
| Patrick loses motivation | Medium | High | Ship FAST. First paying customer = dopamine hit. Track progress visually. Celebrate small wins. Weekly IH updates create accountability. |
| GPT-4o mini quality drops / pricing changes | Low | Medium | Multi-model architecture means we can swap models. Gemini Flash-Lite is backup. |
| Free users abuse the system | Low | Low | Rate limiting + input size limits + IP-based fallback limits for unauthenticated |

---

## Budget Summary

### Startup Costs (One-Time)

| Item | Cost |
|------|------|
| Chrome Developer account | $5 |
| Domain name (1 year) | ~$12 |
| **Total** | **~$17** |

### Monthly Operating Costs (All Anthropic — Haiku for both tiers)

| Scale | Free Tier API | Pro Tier API | Hosting | Database | Total Cost | Revenue | Margin |
|-------|--------------|-------------|---------|----------|-----------|---------|--------|
| 100 users | ~$10 | ~$2 | $0 | $0 | ~$12 | ~$108 | 89% |
| 500 users | ~$48 | ~$10 | $0 | $0 | ~$58 | ~$522 | 89% |
| 1,000 users | ~$95 | ~$21 | $20 | $0 | ~$136 | ~$1,053 | 87% |
| 2,500 users | ~$238 | ~$53 | $20 | $25 | ~$336 | ~$2,637 | 87% |

All hosting/DB on free tiers until revenue justifies upgrading. Response caching will reduce API costs by 30-50% at scale. All API costs are deductible business expenses.

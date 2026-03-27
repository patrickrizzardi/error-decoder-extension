# Todos: Error Decoder

## Current Goal
Build and launch the AI Error Decoder Chrome extension. Get to first paying customer ASAP.

## Phase 0: Project Scaffold ✅ DONE
- [x] 0.1 Root configs (package.json, tsconfig, .gitignore)
- [x] 0.2 Docker Compose (api, stripe, web services) — no custom Dockerfile, using oven/bun:1 directly
- [x] 0.3 Scaffold API package (Hono + Bun, 10 route stubs, middleware, lib clients)
- [x] 0.4 Scaffold extension package (Manifest V3, content script, sidepanel, popup, options)
- [x] 0.5 Scaffold web package (landing page placeholder with SEO)
- [x] 0.6 Shared types package
- [x] 0.7 Supabase migration SQL (4 tables, RLS, triggers, atomic usage function)
- [x] 0.8 Stripe sync script skeleton
- [ ] 0.9 Verify: docker compose up works, extension loads in Chrome — PENDING Patrick commit + test

## Phase 1: Backend API (mock → real) ⏳ IN PROGRESS
- [x] 1.1 Health endpoint (implemented)
- [x] 1.2 Decode endpoint (mock response, will be real in Phase 5)
- [x] 1.3 Auth middleware (API key validation via Supabase)
- [x] 1.4 Rate limit middleware (atomic DB increment, 3/day free)
- [ ] 1.5 Input validation (Valibot schemas) — schemas created, wiring into routes in progress
- [x] 1.6 CORS config (extension, localhost, errordecoder.dev)
- [x] 1.7 Error handling (consistent format, no leaking internals)

## Phase 2: Database — ⚠️ BLOCKED: Patrick needs to run migration
- [ ] 2.1 Run migration on Supabase (Patrick: paste supabase/migrations/001_initial.sql into SQL Editor)
- [ ] 2.2 User creation trigger (included in migration SQL)
- [ ] 2.3 RLS policies tested
- [ ] 2.4 increment_daily_usage() function tested

## Phase 3: Extension Shell ✅ SCAFFOLDED (needs build config)
- [x] 3.1 Context menu registration ("Decode this error" on text selection)
- [x] 3.2 Side panel opens from context menu
- [x] 3.3 Content script: text selection + page context detection
- [x] 3.4 Popup: paste mode UI
- [x] 3.5 Options page: account info shell
- [ ] 3.6 Vite build config for extension (CRXJS or manual)

## Phase 4: Auth Flow
- [ ] 4.1 Supabase Auth config (email/pass + Google OAuth)
- [ ] 4.2 Auth web page (signup/login forms)
- [ ] 4.3 Extension ↔ web auth handshake
- [ ] 4.4 API key generation + storage in chrome.storage
- [ ] 4.5 Manual API key paste fallback

## Phase 5: AI Integration ⏳ NEXT UP
- [ ] 5.1 Anthropic SDK setup + system prompt
- [ ] 5.2 Prompt caching (cache_control on system message)
- [ ] 5.3 Response caching (hash, check, store)
- [ ] 5.4 Cost tracking (actual tokens from API response)
- [ ] 5.5 Sonnet deep analysis (Pro only)

## Phase 6: Wire End-to-End
- [ ] 6.1 Select text → context menu → side panel → API → result
- [ ] 6.2 Paste mode → popup → API → result
- [ ] 6.3 Test 5+ error types end-to-end

## Phase 7: Usage Tracking
- [ ] 7.1 Daily count enforcement (3/day free)
- [ ] 7.2 Remaining count in extension UI
- [ ] 7.3 Input length limit (1000 chars free)
- [ ] 7.4 Sonnet monthly limit tracking
- [ ] 7.5 Upgrade CTA when limit hit

## Phase 8: Stripe Payments
- [ ] 8.1 stripe-setup.ts sync script (products, prices, webhooks)
- [ ] 8.2 Checkout session creation
- [ ] 8.3 Webhook handlers (checkout.completed, subscription.deleted, etc.)
- [ ] 8.4 Customer portal
- [ ] 8.5 Webhook signature verification
- [ ] 8.6 Extension upgrade flow (button → checkout → re-check plan)

## Phase 9: UI Polish
- [ ] 9.1 Dark/light mode
- [ ] 9.2 Side panel result layout (sections, copy, feedback)
- [ ] 9.3 Loading skeleton
- [ ] 9.4 Error states (rate limited, offline, API error, not authed)
- [ ] 9.5 Pro badge + deep analysis button

## Phase 10: Landing Page
- [ ] 10.1 Hero section + demo GIF placeholder
- [ ] 10.2 How it works (3 steps)
- [ ] 10.3 Pricing cards (free vs pro)
- [ ] 10.4 FAQ section
- [ ] 10.5 SEO meta tags + OG tags + structured data
- [ ] 10.6 Privacy policy page
- [ ] 10.7 Terms of service page
- [ ] 10.8 Blog section (ready but empty)

## Phase 11: Testing & QA
- [ ] 11.1 15+ error types tested
- [ ] 11.2 7+ sites tested
- [ ] 11.3 Edge cases (empty selection, offline, chrome:// pages, etc.)
- [ ] 11.4 Full user journey (signup → decode → limit → upgrade → unlimited)

## Phase 12: Chrome Web Store Prep
- [ ] 12.1 Icons (128, 48, 16)
- [ ] 12.2 Screenshots (1280x800 x3)
- [ ] 12.3 Store listing copy
- [ ] 12.4 Permission justifications

## Phase 13: Verification Sweep
- [ ] 13.1 TODO/FIXME grep
- [ ] 13.2 Security scan (no secrets in code)
- [ ] 13.3 Quality checklist pass

## Completed
- [x] [2026-03-27] Market research and competitive analysis (20+ sources)
- [x] [2026-03-27] Evidence-based strategy document with citations
- [x] [2026-03-27] Project folder structure and CLAUDE.md created
- [x] [2026-03-27] Detailed implementation + GTM plan written
- [x] [2026-03-27] Execution plan written and approved
- [x] [2026-03-27] Product name chosen: ErrorDecoder (errordecoder.dev)
- [x] [2026-03-27] Domain purchased on Cloudflare
- [x] [2026-03-27] GitHub repo created + pushed
- [x] [2026-03-27] .gitignore created
- [x] [2026-03-27] Supabase project created, keys in .env
- [x] [2026-03-27] Anthropic API key in .env
- [x] [2026-03-27] Stripe account created (restricted test keys), keys in .env
- [x] [2026-03-27] Phase 0 scaffold — 47 files, all packages, Docker Compose, migration SQL

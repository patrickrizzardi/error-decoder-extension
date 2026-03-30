# Todos: ErrorDecoder

## Current Goal
Build an always-on AI debugging sidebar Chrome extension. Real-time error stream + network monitoring + element inspection + batch AI decode. Ship and get first paying customer.

## PIVOT TASKS (Priority) ⏳
- [ ] P.1 Fix console error capture chain (broken — script injection → CustomEvent → content script → background → sidebar)
- [ ] P.2 Add chrome.webRequest network monitoring (background worker, no DevTools needed)
- [ ] P.3 Redesign sidebar as real-time debugging dashboard (error feed + element inspector + decode panel)
- [ ] P.4 Build element inspection mode (hover highlight, click select, computed styles, AI Q&A)
- [ ] P.5 Build POST /api/decode-batch endpoint (last 10-15 errors, holistic AI analysis)
- [ ] P.6 Update manifest permissions (webRequest, host_permissions)
- [ ] P.7 Test full flow: errors stream into sidebar → decode single → decode batch → element inspect

## Phase 1: Backend API ✅ DONE (pre-pivot, still valid)
- [x] 1.1-1.7 All API routes, middleware, validation, error handling — working

## Phase 2: Database ✅ DONE
- [x] 2.1-2.4 All tables, RLS, triggers, functions — live on Supabase

## Phase 3: Extension Shell ✅ SCAFFOLDED (being pivoted)
- [x] 3.1 Context menu "Decode this error" — working
- [x] 3.2 Sidebar injection (iframe) — working
- [x] 3.3 Content script — scaffolded, capture broken
- [x] 3.4 Popup paste mode — working with inline results
- [x] 3.5 Options page with manual API key input — working
- [x] 3.6 DevTools panel — scaffolded but capture not working (deprioritized — sidebar is the product now)

## Phase 4: Auth Flow
- [ ] 4.1 Supabase Auth config (email/pass + Google OAuth)
- [ ] 4.2 Auth web page (signup/login forms) — scaffolded
- [ ] 4.3 Extension ↔ web auth handshake
- [ ] 4.4 API key generation + storage in chrome.storage
- [x] 4.5 Manual API key paste — working (options page)

## Phase 5: AI Integration ✅ DONE
- [x] 5.1-5.5 Anthropic SDK, system prompt, caching, cost tracking, Sonnet — all working

## Phase 6: Wire End-to-End (POST-PIVOT)
- [ ] 6.1 Console errors stream into sidebar in real time
- [ ] 6.2 Network errors stream into sidebar in real time
- [ ] 6.3 Click error → decode → result in sidebar
- [ ] 6.4 "Decode All" → batch analysis
- [ ] 6.5 Element inspect → AI Q&A
- [ ] 6.6 Test on real sites with real errors

## Phase 7: Usage Tracking (same as before)
- [ ] 7.1-7.5 Daily limits, remaining count, upgrade CTA

## Phase 8: Stripe Payments ✅ MOSTLY DONE
- [x] 8.1-8.5 Checkout, webhooks, portal, signature verification — all implemented
- [ ] 8.6 Extension upgrade flow (button → checkout → re-check plan)

## Phase 9-13: Polish, Landing Page, Testing, CWS, Verification
- Not started — do after pivot tasks complete

## Completed
- [x] [2026-03-27] All research, planning, account setup, domain
- [x] [2026-03-27] Phase 0 scaffold (47 files)
- [x] [2026-03-27] Full API with real Anthropic integration
- [x] [2026-03-27] Database live on Supabase
- [x] [2026-03-27] Extension builds and loads in Chrome + Opera
- [x] [2026-03-27] Sidebar injection working (slides in from right)
- [x] [2026-03-27] Popup paste mode with inline results working
- [x] [2026-03-27] DevTools panel scaffolded
- [x] [2026-03-28] Product pivot: "error decoder" → "always-on debugging sidebar"

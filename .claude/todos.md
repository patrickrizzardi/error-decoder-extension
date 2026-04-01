# Todos: ErrorDecoder

## Current Goal
Build an always-on AI debugging sidebar Chrome extension. Real-time error stream + network monitoring + element inspection + tech stack detection + source map resolution + AI decode. Ship and get first paying customer.

## Completed Features ✅
- [x] Real-time error capture (console.error, console.warn, unhandled exceptions, promise rejections)
- [x] Network monitoring (chrome.webRequest — 4xx, 5xx, CORS, connection failures)
- [x] Per-tab error isolation (errors don't leak across tabs)
- [x] Injected sidebar (iframe, pushes page content over, resizable width with drag handle)
- [x] 3-tab UI: Errors feed | Decode | Inspect
- [x] Multi-select errors with checkboxes + "Decode Selected" / "Decode All"
- [x] Decode tab: paste/right-click text → pick Haiku or Sonnet → results
- [x] No auto-decode — user controls when to spend API calls
- [x] Markdown rendering for AI responses (marked library)
- [x] Tech stack detection (90+ technologies: frameworks, UI libs, build tools, analytics, payments, crypto, monitoring, chat, auth, hosting, CMS, databases)
- [x] Tech stack badges in sidebar header
- [x] Tech context sent to AI for framework-specific answers
- [x] Source map resolution for JS stack traces (resolves bundled filenames to original source)
- [x] CSS source map resolution for element inspector
- [x] Element inspection (hover highlight, click select, computed styles, CSS rules, AI Q&A)
- [x] "No source maps" warning on production sites
- [x] System prompts: error decode, batch decode, element inspect (all markdown, tech-aware)
- [x] Loading states on all buttons (no double-click spam)
- [x] Dark/light mode support
- [x] Custom dark scrollbars
- [x] Resizable textarea with grip pill
- [x] Resizable sidebar width with grip pill (saved to localStorage)
- [x] Context menu "Decode this error" → opens sidebar with text in decode tab
- [x] Extension icon click toggles sidebar
- [x] Close button, ESC to cancel inspect, re-inspect button
- [x] Copy buttons on code blocks (clipboard-write permission on iframe)
- [x] Admin email bypass (ADMIN_EMAILS env var → Pro without Stripe)
- [x] Test user seed script
- [x] Test errors page with realistic multi-signal scenarios

## Completed Infrastructure ✅
- [x] API: all routes (decode, decode-batch, auth, checkout, portal, webhook, feedback, account, usage, health)
- [x] Database: all tables, RLS, triggers, functions live on Supabase
- [x] Stripe: declarative sync script, checkout, webhooks, portal, signature verification
- [x] Docker Compose: api (4001), web (4000), stripe-cli
- [x] Anthropic SDK: Haiku + Sonnet, prompt caching setup, cost tracking
- [x] Response caching (DB-level, smart heuristic for short errors)
- [x] Valibot validation on all endpoints
- [x] CORS, auth middleware, rate limiting

## Code Audit ✅ COMPLETE (2026-03-30)
- [x] A.1–A.8 all done (bugs, perf, cleanup, redundancy, consistency, consolidation, docs, UX)

## Auth & Payment Flow ✅ COMPLETE (2026-03-31)
- [x] Logout race condition fixed (signOut before client init, autoRefreshToken:false, scope:"global")
- [x] "Log Out" button on auth.html success state + auth page logout button
- [x] Background script handles LOGOUT + PLAN_UPGRADED messages
- [x] Sidebar reloads on logout (apiKey removal detected via storage listener)
- [x] Sidebar updates live on plan upgrade (userPlan storage listener → loadUserPlan)
- [x] Checkout success page messages extension with PLAN_UPGRADED
- [x] Smooth checkout flow: spinner loading state instead of API key flash
- [x] Single "Upgrade to Pro" button in sidebar → opens homepage/#pricing
- [x] Payment methods: card, Link, PayPal, CashApp (no bank/wire)
- [x] Failed payment handling: immediate downgrade on invoice.payment_failed, re-upgrade on successful retry
- [x] Manual API key paste (options page fallback)

## Remaining Phases

### Phase 4: Auth Flow — remaining items
- [x] 4.2 Wire auth.html placeholders via web server — ALREADY WORKING
- [x] 4.3 Sign Up button in sidebar decode tab — ALREADY WORKING (auth-prompt CTA)
- [x] 4.4 chrome.runtime.onMessageExternal listener — ALREADY WORKING
- [ ] 4.1 Supabase Auth config (enable email provider, disable email confirmation for instant signup)
- [ ] 4.5 Pin extension ID in manifest.json for dev (needed for web → extension messaging)
- [ ] 4.6 Test full flow end-to-end: sidebar → sign up → auth page → extension gets API key → decode works

### Phase 7: Usage Tracking UI ✅
- [x] 7.1 Free tier limit enforced in sidebar UI — API returns 429, sidebar shows upgrade CTA
- [x] 7.2 Remaining count visible in sidebar — "X of 3 free decodes used today" shown for free users
- [x] 7.3 Upgrade CTA when limit hit — single button → homepage pricing
- [x] 7.4 Sonnet monthly limit display — "(X left)" shown on Sonnet button for Pro users

### Phase 10: Landing Page ✅
- [x] 10.1 Full landing page (hero, how it works, pricing, FAQ)
- [x] 10.2 SEO meta tags, OG tags, structured data
- [x] 10.3 Privacy policy + terms of service pages — fully written, routed, linked from footer
- [ ] 10.4 Blog section ready for content marketing — POST-LAUNCH (not a blocker)

### Phase 11: Testing & QA (Patrick — manual)
- [ ] 11.1 Test on 15+ real error types across sites
- [ ] 11.2 Full user journey (signup → decode → limit → upgrade → unlimited)
- [ ] 11.3 Edge cases (offline, restricted pages, long errors, etc.)

### Phase 12: Chrome Web Store Prep
- [ ] 12.1 Final icons (128, 48, 16) — placeholders exist (Patrick — design)
- [ ] 12.2 Screenshots (1280x800 x3) — (Patrick — browser)
- [x] 12.3 Store listing copy — DONE (saved in .claude/plans/cws-listing.md)
- [x] 12.4 Permission justifications — DONE (saved in .claude/plans/cws-listing.md)
- [x] 12.5 Privacy policy hosted on errordecoder.dev — DONE (already at /privacy)

### Phase 13: Verification Sweep ✅
- [x] 13.1 TODO/FIXME grep — clean, zero code TODOs
- [x] 13.2 Security scan — clean, no secrets in code (test password in seed script is fine)
- [x] 13.3 Quality checklist — code audit done, DRY pass done, all findings addressed
- [x] 13.4 Code audit findings addressed

### Stripe Dashboard Config (manual — Patrick)
- [x] Set retry schedule: 4 retries in 1 week, then cancel subscription — DONE
- [ ] Enable PayPal + CashApp payment methods in Stripe Dashboard

---

## MVP2 — Post-Launch Priority (ship these within first week)

### M2.1 Google OAuth (PRIORITY #1)
- [ ] Create Google Cloud project + OAuth consent screen + credentials
- [ ] Configure Google provider in Supabase Auth dashboard
- [ ] Get stable extension ID from Chrome Web Store (upload stub if needed)
- [ ] Add Google OAuth redirect URL to Supabase
- [ ] Update auth.html Google button to use real Supabase OAuth flow
- [ ] Test full Google OAuth flow: extension → auth page → Google consent → back to extension

### M2.2 Usage Limit UI in Sidebar
- [ ] Show "2 of 3 free decodes remaining" after each decode
- [ ] Upgrade CTA when limit hit ("Upgrade to Pro for unlimited decodes")
- [ ] Sonnet remaining count for Pro users

### M2.3 Stripe Upgrade Flow from Extension
- [x] "Upgrade" button in sidebar → opens pricing page — DONE

---

## Future Features (post-MVP2, roadmap ideas)

### GitHub Repo Integration (premium feature)
- Connect GitHub account via OAuth
- When decoding errors on localhost, search user's actual repo for relevant files
- AI gets real source code context → responses reference THEIR code specifically
- Huge differentiator — no competing tool does this
- Could justify a "Super Pro" tier ($29/mo?) or be a Pro-only feature

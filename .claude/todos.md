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
- [x] A.1 Ran 8 analyzers (bugs, perf, cleanup, redundancy, consistency, consolidation, docs, UX)
- [x] A.2 Verified all findings manually — confirmed 30+, rejected 4 false positives
- [x] A.3 Fixed critical bugs: appendCapturedError race condition, inspect session killer, escapeHtml crash, message listener return true, unbounded buffer
- [x] A.4 DRY consolidation: shared/html.ts, shared/ui.ts, updated storage.ts + api.ts + types.ts, eliminated 5 duplicate definitions
- [x] A.5 Performance: rAF gating, VLQ lookup table + memoization, Range headers for source maps, CSS rule cap at 500, SPA cache invalidation, parallel builds
- [x] A.6 Cleanup: removed decodeBatch, basicMarkdownToHtml, togglePanel, orphaned HTML elements
- [x] A.7 Docs: VLQ algorithm, content script realm architecture, magic constants
- [x] A.8 UX: focus-visible CSS (WCAG), better empty state text

## Remaining Phases

### Phase 4: Auth Flow (MVP — email/password only)
- [ ] 4.1 Supabase Auth config (enable email provider, disable email confirmation for instant signup)
- [ ] 4.2 Wire auth.html placeholders (%%SUPABASE_URL%%, %%SUPABASE_PUBLISHABLE_KEY%%, %%API_BASE%%) via web server
- [ ] 4.3 Add "Sign Up" button in sidebar decode tab (shows when no API key, opens errordecoder.dev/auth in new tab)
- [ ] 4.4 Add chrome.runtime.onMessageExternal listener in background (receives AUTH_SUCCESS from web page)
- [ ] 4.5 Pin extension ID in manifest.json for dev (needed for web → extension messaging)
- [ ] 4.6 Test full flow: sidebar → sign up → auth page → extension gets API key → decode works
- [x] 4.7 Manual API key paste — working (options page, fallback)

### Phase 7: Usage Tracking UI
- [ ] 7.1 Free tier limit enforced in sidebar UI (3/day)
- [ ] 7.2 Remaining count visible in sidebar
- [ ] 7.3 Upgrade CTA when limit hit
- [ ] 7.4 Sonnet monthly limit display

### Phase 9: UI Polish
- [x] 9.1 Code cleanup / DRY pass — done via audit
- [x] 9.2 Final visual polish based on audit findings — done via audit

### Phase 10: Landing Page
- [ ] 10.1 Full landing page (hero, how it works, pricing, FAQ)
- [ ] 10.2 SEO meta tags, OG tags, structured data — basic version exists
- [ ] 10.3 Privacy policy + terms of service pages
- [ ] 10.4 Blog section ready for content marketing

### Phase 11: Testing & QA
- [ ] 11.1 Test on 15+ real error types across sites
- [ ] 11.2 Full user journey (signup → decode → limit → upgrade → unlimited)
- [ ] 11.3 Edge cases (offline, restricted pages, long errors, etc.)

### Phase 12: Chrome Web Store Prep
- [ ] 12.1 Final icons (128, 48, 16) — placeholders exist
- [ ] 12.2 Screenshots (1280x800 x3)
- [ ] 12.3 Store listing copy (keyword optimized)
- [ ] 12.4 Permission justifications
- [ ] 12.5 Privacy policy hosted on errordecoder.dev

### Phase 13: Verification Sweep
- [ ] 13.1 TODO/FIXME grep
- [ ] 13.2 Security scan (no secrets in code)
- [ ] 13.3 Quality checklist pass
- [x] 13.4 Code audit findings addressed

---

## MVP2 — Post-Launch Priority (ship these within first week)

### M2.1 Google OAuth (PRIORITY #1)
- [ ] Create Google Cloud project + OAuth consent screen + credentials
- [ ] Configure Google provider in Supabase Auth dashboard
- [ ] Get stable extension ID from Chrome Web Store (upload stub if needed)
- [ ] Add Google OAuth redirect URL to Supabase
- [ ] Update auth.html Google button to use real Supabase OAuth flow
- [ ] Test full Google OAuth flow: extension → auth page → Google consent → back to extension
- **Why first**: 20-35% more signups. Devs are already logged into Google in Chrome — it's one click.

### M2.2 Usage Limit UI in Sidebar
- [ ] Show "2 of 3 free decodes remaining" after each decode
- [ ] Upgrade CTA when limit hit ("Upgrade to Pro for unlimited decodes")
- [ ] Sonnet remaining count for Pro users

### M2.3 Stripe Upgrade Flow from Extension
- [ ] "Upgrade" button in sidebar → opens checkout page → re-checks plan after return

---

## Future Features (post-MVP2, roadmap ideas)

### GitHub Repo Integration (premium feature)
- Connect GitHub account via OAuth
- When decoding errors on localhost, search user's actual repo for relevant files
- AI gets real source code context → responses reference THEIR code specifically
- Huge differentiator — no competing tool does this
- Could justify a "Super Pro" tier ($29/mo?) or be a Pro-only feature
- Needs: GitHub OAuth, GitHub API search, repo indexing strategy, token/scope management

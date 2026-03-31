# UX Analysis Report — Error Decoder Extension

**Analyzed**: 2026-03-30
**Scope**: Chrome extension UI layer (popup, sidepanel, options page, devtools); error messages; loading states; empty states; accessibility; navigation patterns
**Issues Found**: 18 (Critical: 2, High: 7, Medium: 6, Low: 3)

---

## CRITICAL — Missing Authentication Flow & Empty State Guidance

**Category**: Error Messages | Information Architecture
**Location**: `sidepanel/index.ts:345-349`, `options/index.ts:10-14`
**User Journey Affected**: User installs extension → clicks "Decode" → sees cryptic "API key not set" message with no next steps

**Current Behavior**:
- When no API key is configured, user sees: `"API key not set. Open extension settings and paste your key."`
- This appears in `decodeSingle()` at sidepanel line 347
- No visible link to settings, user must know how to navigate to Chrome extension options
- Options page shows "Not signed in" but provides no sign-up flow or instructions

**Impact**:
- First-time users hit a dead end immediately after installing
- No onboarding path visible
- Users unfamiliar with Chrome extension settings cannot proceed
- Critical for free tier sign-up (plan requires email signup)

**Current Code**:
```typescript
// sidepanel/index.ts:346-349
if (!apiKey) {
  decodeResult.innerHTML = `<p style="color: var(--error-red);">API key not set. Open extension settings and paste your key.</p>`;
  return;
}
```

**Recommended Fix**:
- Add inline "Settings" link (not just text) that opens options page
- In options page, when `userEmail` is "Not signed in", show a "Sign Up" button or link to web signup flow (errordecoder.dev/auth)
- Consider a one-time welcome/setup modal on first install
- Error message should be: `"No API key found. [Go to Settings] or [Sign up]"` with clickable buttons

**Why This Matters**:
- Activation funnel breaks at the first critical step
- Users don't know they need to visit a web page to sign up, then return to extension to paste key
- This is friction that prevents ANY usage, free or paid

---

## CRITICAL — No Free Tier Signup Flow or Inline Auth

**Category**: Error Messages | Information Architecture | Navigation
**Location**: `options/index.html:62-102`, sidepanel API calls
**User Journey Affected**: Free user → clicks "Decode" → realizes they need an API key → no sign-up visible anywhere in extension

**Current Behavior**:
- Extension has no built-in authentication (no sign-up, no login)
- Users must leave the extension, go to web app, sign up, copy API key, return to extension
- Options page shows only account settings for already-authenticated users
- For unauthenticated users: settings page is useless (shows "Not signed in" with no action button)

**Impact**:
- Friction barrier prevents most free users from even trying the extension
- User must context-switch to web → sign up → copy → return to extension
- No indication that sign-up is even required (could think extension is broken or incomplete)
- Unauthenticated free tier never gets activated

**Current Code**:
```html
<!-- options/index.html:65-68 -->
<div class="field">
  <label>Email</label>
  <div class="value" id="email">Not signed in</div>
</div>
```

**Recommended Fix**:
- Add "Sign Up" button in options page that opens errordecoder.dev/auth in new tab
- Or: embed a lightweight signup form directly in extension (OAuth + email/password)
- Popup should show: "New? [Sign Up Now]" instead of just "Open Settings"
- Consider a persistent banner on first 3 uses: "Sign up for free decodes"

**Why This Matters**:
- Extension-only sign-up is standard for tools (Grammarly, Clearbit, 1Password)
- Right now, users cannot activate without leaving the extension entirely
- This is the biggest barrier to free tier adoption

---

## HIGH — No Loading State Feedback on API Check (Usage Endpoint)

**Category**: Loading States | Feedback
**Location**: `sidepanel/index.ts:274-293` (`loadUserPlan()`)
**User Journey Affected**: Sidebar opens → no visible loading while fetching plan/Sonnet limit

**Current Behavior**:
- `loadUserPlan()` fires silently on sidebar init without any visual feedback
- Network request to `/usage` can take 500-2000ms
- User sees nothing, then Sonnet button suddenly appears (or doesn't)
- No indicator that a check is happening
- If request fails (network error, timeout), user never knows

**Impact**:
- User doesn't know why Sonnet button appears after a delay
- No feedback if API check fails silently (caught with empty try-catch)
- Appears like a UI glitch or unresponsive extension
- Pro users may not realize they have Sonnet available if timing is off

**Current Code**:
```typescript
// sidepanel/index.ts:274-293
const loadUserPlan = async () => {
  const apiKey = await getApiKey();
  if (!apiKey) return;

  const apiBase = typeof __API_BASE__ !== "undefined" ? __API_BASE__ : "http://localhost:4001/api";
  try {
    const res = await fetch(`${apiBase}/usage`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const json = await res.json();
    if (json.data) {
      if (json.data.plan === "pro") {
        sonnetBtn.classList.remove("hidden");
        const remaining = json.data.sonnetLimit - json.data.sonnetUsed;
        sonnetRemaining.textContent = `(${remaining} left)`;
      }
      chrome.storage.local.set({ userPlan: json.data.plan });
    }
  } catch {}  // Silent failure
};
```

**Recommended Fix**:
- Add a small "Loading..." indicator in tab bar while plan check is happening
- Show skeleton/pulse on Sonnet button area during load
- If request fails, don't silently fail—log to console or show a tiny warning badge
- Add timeout (2s) so indicator doesn't hang indefinitely

**Why This Matters**:
- User mental model breaks when UI suddenly changes
- No feedback feels like the extension is unresponsive
- Pro users with 0 Sonnet remaining won't see `(0 left)` until sidebar reopens

---

## HIGH — Decode Button Text Changes During Load (Confusing State Transition)

**Category**: Loading States | Feedback
**Location**: `sidepanel/index.ts:299-305`
**User Journey Affected**: User clicks "Decode (Haiku)" → text changes to "Resolving source maps..." → "Decoding..." → back to "Decode (Haiku)"

**Current Behavior**:
- Button changes text multiple times during a single decode request
- Sequence: "Decode (Haiku)" → "Resolving source maps..." → "Decoding..." → back to "Decode (Haiku)"
- User sees three state changes, unclear which phase they're in
- "Resolving source maps" is jargon; unclear to non-developers what's happening

**Impact**:
- Excessive state updates feel janky and unfinished
- "Resolving source maps" is internal implementation detail, not user-friendly
- User might think something's wrong if they see unexpected text changes
- Pattern breaks consistency with typical UI design (stable loading state)

**Current Code**:
```typescript
// sidepanel/index.ts:351-368
setDecoding(true, "Resolving source maps...");
decodeInput.classList.remove("has-results");
decodeResult.innerHTML = "";

const enrichedText = await resolveSourceMaps(errorText);

setDecoding(true, "Decoding...");
decodeResult.innerHTML = `<div class="skeleton"></div><div class="skeleton short"></div><div class="skeleton"></div>`;
```

**Recommended Fix**:
- Lock button text to single state during entire request: "Decoding..." (only)
- Remove "Resolving source maps" phase from user-visible text
- Show single skeleton loader while entire decode (including source maps) happens
- Reserve multi-phase text for long operations (>5s), not normal flow

**Why This Matters**:
- UX principle: minimize visual noise during loading
- Users interpret text changes as progress/feedback but here it's just internal phases
- Single stable state reduces cognitive load and feels more polished

---

## HIGH — Empty State on Errors Tab Is Unclear

**Category**: Information Architecture | Empty States
**Location**: `sidepanel/index.html:31-34`, `sidepanel/index.ts:150-163`
**User Journey Affected**: User opens extension → clicks "Errors" tab → sees "Waiting for errors..." message

**Current Behavior**:
- Empty state shows: `"Waiting for errors..."` and a long disclaimer about what gets captured
- Disclaimer is too long (86 words) and technical: "Captures console errors, failed network requests, and unhandled exceptions from your code. Some browser-level errors (ad blocker blocks, script parse errors from third-party scripts) may only appear in DevTools Console."
- Users don't know if they should go to the website being debugged, reload the page, or do something else
- No CTA (call-to-action) to trigger test errors

**Impact**:
- Users feel lost in empty state
- Disclaimer text is not actionable—user doesn't know what to do with that info
- Users might think extension isn't working (no indication of what to expect)
- "Waiting for errors" sounds passive; user doesn't know they need to trigger them on a webpage

**Current Code**:
```html
<!-- sidepanel/index.html:31-34 -->
<div id="empty-state" class="empty">
  <p>Waiting for errors...</p>
  <p class="empty-note">Captures console errors, failed network requests, and unhandled exceptions from your code. Some browser-level errors (ad blocker blocks, script parse errors from third-party scripts) may only appear in DevTools Console.</p>
</div>
```

**Recommended Fix**:
- Change "Waiting for errors..." to "No errors captured yet"
- Rewrite disclaimer to be shorter and actionable:
  - "Errors on this page will appear here automatically. Try visiting a page with errors or opening DevTools to trigger them."
- Add a link: "Open DevTools" that triggers F12
- Consider a "Try it" button that opens errordecoder.dev/demo with a test error
- Move technical disclaimer to a collapsible "?" help icon instead of always-visible

**Why This Matters**:
- Empty states must tell users what to do next (action-oriented)
- Disclaimers should answer "why isn't this working?" not appear in empty state
- Users need a clear path from empty to populated state

---

## HIGH — No Error State Recovery for Failed API Requests

**Category**: Error Messages | Navigation
**Location**: `sidepanel/index.ts:379-383`, `sidepanel/index.ts:420-427`
**User Journey Affected**: User clicks "Decode" → API request fails → sees generic error → no way to retry

**Current Behavior**:
- When API request fails: `"Failed to connect to API."`
- No retry button, no "Try Again" button
- User must close sidebar, re-paste error, click again
- Same applies to inspect tab (`line 590`)
- Errors are not specific: "Failed to connect" could be timeout, auth failure, server down, or network error

**Impact**:
- Temporary network errors feel permanent
- Users think they need to sign out and back in (common error recovery behavior)
- Friction adds 3-4 clicks to recover from a transient failure
- No indication of what went wrong (DNS failure vs. auth vs. rate limit)

**Current Code**:
```typescript
// sidepanel/index.ts:379-383
} catch {
  decodeResult.innerHTML = `<p style="color: var(--error-red);">Failed to connect to API.</p>`;
} finally {
  setDecoding(false);
}
```

**Recommended Fix**:
- Show specific error: `"Network error: {statusCode} or {error message}"`
- Add inline "Retry" button with the error
- Log error to console for debugging: `console.error('Decode failed:', error)`
- For auth failures (401), show: `"Authentication failed. [Check Settings]"`
- For rate limits (429): `"Too many requests. Try again in {n} seconds."`

**Why This Matters**:
- Users need recovery path for transient failures
- Specific errors enable self-service troubleshooting
- Generic "Failed to connect" makes users think the extension is broken

---

## HIGH — Sonnet Button Visibility Requires Sidebar Reopen

**Category**: Information Architecture | State Management
**Location**: `sidepanel/index.ts:274-293` (`loadUserPlan()`)
**User Journey Affected**: Pro user upgrades → clicks sidebar → Sonnet button still hidden until sidebar closes and reopens

**Current Behavior**:
- `loadUserPlan()` only runs once on sidebar init (`init()` at line 101)
- If user upgrades to Pro mid-session, Sonnet button never appears
- User must close and reopen sidebar to see Sonnet button
- Plan upgrade happens in web app → user doesn't know to come back to extension

**Impact**:
- Pro users don't discover Sonnet feature after upgrading
- Feels like a bug (button suddenly appears on sidebar reopen)
- Reduces Sonnet usage for paying customers
- No notification that they now have Pro features available

**Current Code**:
```typescript
// sidepanel/index.ts:76-101 init() runs once
const init = async () => {
  await resolveTabId();
  // ... other setup ...
  loadUserPlan();  // Only called once at startup
};
```

**Recommended Fix**:
- Call `loadUserPlan()` periodically (every 60s) or on storage change
- Or: call it whenever user switches tabs within sidebar
- Or: add message listener from backend that triggers plan refresh on purchase completion
- Show a badge/toast: "Pro activated! Sonnet decode now available" when plan changes

**Why This Matters**:
- New Pro features should be discoverable without sidebar restart
- Users won't manually restart sidebar if they don't know it's needed
- Leaves money on table (Pro feature unused)

---

## HIGH — Copy Button Feedback Destroys "Copy Code" Text Label (Accessibility)

**Category**: Accessibility | Feedback
**Location**: `sidepanel/index.ts:620-627`, `popup/index.ts:71-77`, `devtools/panel.ts:156-162`
**User Journey Affected**: User clicks copy button → text changes to "Copied!" → button still says "Copied!" 2s later if they look back

**Current Behavior**:
- Copy button changes text to "Copied!" for 2 seconds
- During that time, button is unlabeled/misleading if user hovers
- After 2 seconds, changes back to "Copy"
- For screen reader users, the button label just vanished and reappeared
- Multiple copy buttons across panels do the same, no unified pattern

**Impact**:
- Accessibility: screen reader users hear "Copied!" then silence, then "Copy!" back — confusing narrative
- Visual: button looks clickable with "Copied!" text, but it's not
- Pattern inconsistency: copy behavior works the same in 3 places but no reusable component
- 2-second timeout is arbitrary; user might not see the feedback

**Current Code**:
```typescript
// sidepanel/index.ts:620-627
btn.addEventListener("click", async () => {
  const code = pre.textContent || "";
  await navigator.clipboard.writeText(code);
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = "Copy"; }, 2000);
});
```

**Recommended Fix**:
- Preserve button label: change `aria-label` instead of text
- Or: keep text change but add `aria-live="polite"` so screen readers announce it
- Use a success icon + keep "Copy" label: `✓ Copy` or `☑ Copy`
- Extract to reusable function: `attachCopyButton(pre)` used across all panels
- Consider toast notification instead of button text change for better visibility

**Why This Matters**:
- Accessibility: screen reader users lose context when button text vanishes
- UX principle: don't remove affordance during feedback (keep "Copy" visible)
- Code reuse: same pattern in 3 places = maintenance burden

---

## MEDIUM — "Listening..." Status Message Never Updates

**Category**: Feedback | State Management
**Location**: `sidepanel/index.ts:41, 170`
**User Journey Affected**: Sidebar opens → shows "Listening..." → status never changes even when errors are captured

**Current Behavior**:
- Header shows `status: "Listening..."` on init (line 14, 41)
- `updateCounts()` updates error count but `statusEl` is set to `"N captured"` only when errors added (line 170)
- If sidebar is open when errors arrive, status text might not update synchronously
- User sees static "Listening..." even after multiple errors captured

**Impact**:
- Status text feels stale/misleading
- User doesn't get reassurance that errors are being captured
- No indication of real-time activity
- "Listening..." sounds like waiter mode, not active capture

**Current Code**:
```typescript
// sidepanel/index.ts:170
const updateCounts = (count: number) => {
  errorCountEl.textContent = `${count} error${count !== 1 ? "s" : ""}`;
  statusEl.textContent = `${count} captured`;  // Only when errors exist
  errorBadge.textContent = String(count);
  errorBadge.classList.toggle("hidden", count === 0);
};
```

**Recommended Fix**:
- Update `statusEl` on sidebar init and whenever error count changes
- Change "Listening..." to "Ready" or remove status text entirely (error count is the status)
- Or: show live activity: "Listening (5 errors)" with count
- Consider a small activity indicator (pulsing dot) instead of text

**Why This Matters**:
- Status must reflect current state, not startup state
- Users need assurance that extension is actively working
- "Captured" is clearer than "Listening..." (no ambiguity)

---

## MEDIUM — Character Counter on Paste Tab Doesn't Enforce Limit

**Category**: Feedback | Form Validation
**Location**: `popup/index.html:20-22`, `popup/index.ts:42-44`
**User Journey Affected**: Free user pastes error > 1000 chars → counter shows "1200 / 1,000" → clicks decode → API rejects (if enforced server-side)

**Current Behavior**:
- Popup shows character count: `0 / 1,000` (line 21)
- Character counter updates in real-time (line 42-44)
- User can paste 5000 chars and counter shows "5000 / 1,000"
- Counter is visual feedback only, doesn't prevent submission
- If server enforces 1000-char limit for free tier, user sees API error after decode fails

**Impact**:
- False affordance: counter suggests a limit that isn't enforced
- User gets error message instead of inline validation
- If char limit is hard limit, should prevent submission; if soft limit, should remove counter
- No guidance on what to do if they exceed (truncate? delete lines? upgrade?)

**Current Code**:
```html
<!-- popup/index.html:20-22 -->
<div id="char-count">
  <span id="char-current">0</span> / <span id="char-limit">1,000</span>
</div>
```

**Recommended Fix**:
- If 1,000 is a hard limit: disable "Decode" button when textarea exceeds 1000 chars
- Add inline message: "Free tier limited to 1,000 characters. [Upgrade to Pro]"
- Or: truncate input automatically with warning
- Or: remove counter entirely if limit is not enforced (move to Pro-only feature list)
- In sidepanel, add same limit enforcement with warning

**Why This Matters**:
- Limits should be enforced at the UI boundary, not discovered via error
- Character counter without enforcement is a broken affordance
- Users blame the extension, not their input

---

## MEDIUM — No Visibility into Network Error Causes (Status Codes Hidden)

**Category**: Error Messages | Debugging
**Location**: `background/index.ts:33-50`, `background/index.ts:52-67`
**User Journey Affected**: Network request fails → error appears in sidebar as generic "Network Error: ..."

**Current Behavior**:
- Network errors captured: `Network Error: {error name} — {method} {url}` (line 57-64)
- HTTP errors captured: `Network {statusCode}: {method} {url}` (line 39)
- No distinction between 4xx (client), 5xx (server), or DNS/timeout errors
- In sidebar error feed, all show same red badge, no severity differentiation
- User sees "Network Error: net::ERR_CONNECTION_TIMEOUT" but doesn't know what it means

**Impact**:
- Network errors are cryptic to non-developers
- No priority signal (ERR_BLOCKED_BY_RESPONSE vs. ERR_INVALID_ARGUMENT feel the same)
- User can't diagnose if error is their problem, server problem, or infrastructure
- No actionable next step for network errors

**Current Code**:
```typescript
// background/index.ts:52-67
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.url.startsWith("chrome-extension://") || details.tabId < 0) return;

    appendCapturedError({
      text: `Network Error: ${details.error} — ${details.method} ${details.url}`,
      level: "error",
      // ...
    });
  },
  { urls: ["<all_urls>"] }
);
```

**Recommended Fix**:
- Categorize network errors: DNS, timeout, CORS, blocked, connection-refused, etc.
- Show human-friendly category in error feed (not raw error code)
- Use different badge colors: orange for timeout (transient), red for blocked (config issue)
- In decode tab, provide hints: "CORS error — this might be blocked by the server's cross-origin policy. Try decoding from localhost."
- Optional: batch similar network errors (don't show 50 identical failures)

**Why This Matters**:
- Network errors are debugging clues, not just noise
- UX principle: translate technical errors into user-actionable categories
- Different errors require different fixes (timeout vs. CORS vs. DNS)

---

## MEDIUM — Inspect Tab Sourcemap Tip Appears but Is Conditional (Confusing)

**Category**: Information Architecture | Conditional Messaging
**Location**: `sidepanel/index.ts:512-531`
**User Journey Affected**: Pro user inspects element → sometimes sees sourcemap tip, sometimes doesn't

**Current Behavior**:
- Sourcemap tip shows only if: not localhost AND no resolved files AND not all inline CSS
- Logic is buried in JavaScript, user doesn't understand why tip appears/disappears
- Tip says: "No source maps detected — file paths can't be resolved. For exact file references, test on localhost or enable source maps in your build config."
- This is correct but technical; suggests action (build config) that requires dev knowledge
- Inconsistent: tip disappears when user inspects different elements on same page

**Impact**:
- Users see a message on one element but not another, appears like a glitch
- Jargon ("source maps", "build config") not explained
- User doesn't know if they should care about this message
- Actionable for devs, confusing for designers/QA

**Current Code**:
```typescript
// sidepanel/index.ts:514-531
const hasResolvedFiles = el.cssRules?.some((r: any) => r.originalFile);
const allInline = el.cssRules?.every((r: any) => r.file === "inline");
const tipEl = document.getElementById("sourcemap-tip");

if (tipEl) {
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    const pageUrl = tab?.url || "";
    const isLocal = pageUrl.includes("localhost") || pageUrl.includes("127.0.0.1");

    if (!isLocal && !hasResolvedFiles && !allInline) {
      tipEl.classList.remove("hidden");
    } else {
      tipEl.classList.add("hidden");
    }
  });
}
```

**Recommended Fix**:
- Always show a brief status: "Source maps: ✓ Resolved" or "Source maps: × Not available on production"
- Hide the conditional tip for now (keep code but show only on demand)
- If user clicks element with no source maps, show: "Can't resolve source file names on production builds. Test on localhost for file references."
- Or: add a "?" help icon that explains source maps in plain English

**Why This Matters**:
- Conditional UI that disappears feels broken, not smart
- Users need consistent feedback about state (always show status, hide details)
- Technical caveats should be opt-in (help icon), not always visible

---

## MEDIUM — No Indication That "Decode Selected" Batches Errors

**Category**: Information Architecture | Form Validation
**Location**: `sidepanel/index.ts:176-195`
**User Journey Affected**: User selects 3 errors → clicks "Decode Selected (3)" → all 3 errors appear in one markdown response in decode tab

**Current Behavior**:
- Checkbox allows multi-select, button shows count: "Decode Selected (3)"
- Clicking button pastes all errors concatenated into decode tab: `Error 1 [level]: {error}\n\nError 2 [level]: {error}`
- Response is a single AI markdown block covering all 3 errors
- User doesn't know upfront that AI will batch them (no preview, no warning)
- Could lead to long/slow response if many errors selected

**Impact**:
- User might expect 3 separate decode results
- Unexpected batch processing confuses the workflow
- No indication of batch size limit (how many errors can be batched?)
- No progress indication for large batches

**Current Code**:
```typescript
// sidepanel/index.ts:176-195
document.getElementById("decode-selected")!.addEventListener("click", async () => {
  // ...
  if (selected.length === 1) {
    textarea.value = selected[0].text;
  } else {
    textarea.value = selected.map((e: CapturedError, i: number) => `Error ${i + 1} [${e.level}]: ${e.text}`).join("\n\n");
  }
  switchTab("decode");
});
```

**Recommended Fix**:
- Show a preview/summary before decoding: "Batch decode 3 errors?" with error titles listed
- Or: auto-switch to decode tab and show the concatenated text with a note: "This will decode all 3 errors as a batch. [Decode] [Decode Separately]"
- Add a limit: "Selected 5 errors (max 10 per batch)"
- If batch is large (> 5), warn: "This might take longer. Decode separately or in smaller batches?"

**Why This Matters**:
- Users need to consent to behavior before it happens
- Batching is an implementation detail the UI should surface
- Large batch decodes should have warnings (time, cost in Pro)

---

## MEDIUM — "How to Fix" Section Unclear (Is It a List or Narrative?)

**Category**: Information Architecture | Visual Hierarchy
**Location**: `popup/index.html:45-48`, `sidepanel/index.html:no equivalent` (uses markdown)
**User Journey Affected**: User decodes error → sees "How to Fix" with numbered list → unclear if steps are sequential or just notes

**Current Behavior**:
- Popup renders as ordered list: `<ol>` with `howToFix` items
- No clear structure: is step 2 dependent on step 1? Can they be done in parallel?
- For batch decodes in sidepanel, AI returns markdown that's parsed—structure depends on AI output quality
- In popup: if AI returns a single multi-line fix, it becomes one list item (broken structure)

**Impact**:
- Users don't know the order/dependency of steps
- Multi-step fixes lose structure when rendered as flat list
- Inconsistent between popup (strict <ol>) and sidepanel (markdown)
- "How to Fix" doesn't always mean "steps" (sometimes just "options")

**Current Code**:
```html
<!-- popup/index.html:45-48 -->
<section>
  <h3>How to Fix</h3>
  <ol id="fix-list"></ol>
</section>
```

**Recommended Fix**:
- In popup: use markdown from AI instead of structured JSON fields (whatHappened, why, howToFix)
- Or: document in system prompt that howToFix must be exact ordered steps, each in own string
- Add visual cue: "Step 1 of 3" under heading to show it's sequential
- Option: use `<ol start="1">` and add step counter in AI prompt
- Consider converting to prose paragraphs if steps have dependencies

**Why This Matters**:
- Users need to understand step relationships
- Ordered lists imply sequence; if not sequential, use bullets or paragraphs
- Consistent structure across UI builds trust

---

## LOW — Accessibility: Missing Focus Indicators on Tabs

**Category**: Accessibility
**Location**: `sidepanel/styles.css:118-132`
**User Journey Affected**: Keyboard-only user tabs through sidebar → tabs don't show focus ring

**Current Behavior**:
- Tab buttons (`.tab`) have `:hover` styles but no `:focus` styles
- Keyboard nav works (tabs are clickable) but no visual focus indicator
- Hard to see which tab is currently focused
- Only `.active` shows the accent color, not focus state

**Impact**:
- Keyboard-only users can't tell which tab is focused
- WCAG AA requires visible focus indicator (1.4.7)
- Screen readers work, but sighted keyboard users are lost
- Appears unfinished (no focus ring is unusual for modern UIs)

**Current Code**:
```css
/* sidepanel/styles.css:118-132 */
.tab {
  flex: 1;
  padding: 6px 0;
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}

.tab:hover { color: var(--text); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }
```

**Recommended Fix**:
```css
.tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: 2px;
}
```

**Why This Matters**:
- WCAG compliance: focus indicators are required
- Keyboard users (accessibility + power users) deserve equal UX
- Modern web standard (most sites have focus indicators)

---

## LOW — Empty String in Model Picker (Sonnet Button Positioning)

**Category**: Visual Design
**Location**: `sidepanel/index.html:52, sidepanel/index.ts:287`
**User Journey Affected**: Free user sees empty space next to "Decode (Haiku)" where Sonnet button would be (hidden)

**Current Behavior**:
- `.model-picker` is a flex row with two buttons
- Sonnet button is hidden by default (`.hidden` class)
- For free users, empty space appears where button would be (buttons don't fill flex container)
- Haiku button is `flex: 1` but Sonnet is not, so layout shifts when Sonnet appears
- Visual imbalance

**Impact**:
- Layout looks unfinished for free users (gap in button row)
- Layout shifts when Sonnet button appears, feels janky
- No indication that a button is hidden/pending

**Current Code**:
```html
<!-- sidepanel/index.html:49-54 -->
<div class="model-picker">
  <button id="decode-haiku" class="btn-primary">Decode (Haiku)</button>
  <button id="decode-sonnet" class="btn-sonnet hidden" title="Uses Claude Sonnet for deeper analysis">
    Sonnet <span id="sonnet-remaining"></span>
  </button>
</div>
```

**Recommended Fix**:
- Make Haiku button `flex: 1` always, Sonnet `flex: 1` when visible
- Or: use width: 100% for Haiku when Sonnet is hidden, split 50-50 when visible
- Or: show Sonnet button always but disabled + message "Upgrade to Pro"
- Or: hide entire button row for free tier, show upgrade prompt instead

**Why This Matters**:
- Layout stability = perceived quality
- Users shouldn't see holes in the UI (gaps where hidden elements would go)
- Explicit disabled state is better than hidden state for feature discovery

---

## LOW — No Indication That Network Errors are Captured in Real-Time

**Category**: Information Architecture | Expectations
**Location**: `background/index.ts:33-50`
**User Journey Affected**: User does not know extension captures network failures until they see one in error feed

**Current Behavior**:
- Background script listens to `webRequest.onCompleted` and `onErrorOccurred` silently
- User never knows this is happening (no UI indication or onboarding)
- First network error appears in feed with no context ("Network 404: GET ...")
- Users might think the extension is capturing their errors, not the page's

**Impact**:
- Users don't understand the feature until it proves itself
- No activation signal (no indication of capability)
- May create confusion: "Why is the extension showing my API failures?"
- Opportunity for discovery missed

**Current Code**:
```typescript
// background/index.ts:33-50 - silent capture
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.statusCode >= 400 && details.tabId > 0) {
      // ... append error silently
    }
  },
  { urls: ["<all_urls>"] }
);
```

**Recommended Fix**:
- Add a tooltip or hint on first visit: "Tip: Network errors on this page will appear in the Errors tab"
- In empty state, mention: "Will show console errors and network failures (4xx, 5xx) from this page"
- Consider a small indicator when network error is captured: "Network error captured" toast (non-blocking)
- Log discovery opportunity: track when first network error is captured (analytics)

**Why This Matters**:
- Silent features are invisible features
- Users discover this capability by accident, not by design
- A small hint can drive engagement and set expectations

---

## LOW — Decode Tab Doesn't Show Last Request Details (Latency, Cost)

**Category**: Feedback | Transparency
**Location**: `sidepanel/index.ts:362-383`
**User Journey Affected**: Pro user decodes several errors → doesn't see cost/latency feedback

**Current Behavior**:
- Decode response shows markdown content only
- No indication of API latency, cost (Sonnet vs. Haiku), or token usage
- Free user doesn't know how many decodes they have left today
- No transparency into what happened server-side

**Impact**:
- Users on limited free tier don't know they're running low until blocked
- No feedback on response quality (fast responses might be cached, no indication)
- Pro users don't see Sonnet cost/usage breakdown
- Missed opportunity for engagement ("You've saved $2.15 with cached responses!")

**Current Code**:
```typescript
// sidepanel/index.ts:377-384
renderMarkdown(json.data.markdown, decodeResult);
decodeInput.classList.add("has-results");
// No feedback about latency, cost, cache hit
```

**Recommended Fix**:
- Add metadata footer to decode results: "Haiku | 234ms | Free decode 2/3 left"
- For Sonnet: "Sonnet | 1.2s | Cost: $0.08 | 19 remaining this month"
- Show cache hit indicator: "⚡ Cached (instant)" if from response cache
- Optional: show token usage: "142 input | 487 output tokens"

**Why This Matters**:
- Transparency builds trust
- Users on free tier need to know limits
- Pro users care about cost and usage
- Cache hits are a performance win worth celebrating

---

## Summary

| Category | Count |
|----------|-------|
| Error Messages | 4 |
| Loading States | 3 |
| Information Architecture | 7 |
| Accessibility | 2 |
| Feedback | 5 |
| Navigation | 2 |
| Visual Design | 1 |

## Priority

### Fix Now (Blocking Users)
1. **CRITICAL**: Missing authentication flow / no free tier signup (blocks all first-time users)
2. **CRITICAL**: No onboarding or settings guidance when API key is missing (dead end)
3. **HIGH**: No inline auth in extension (requires context-switch to web, high friction)

### Fix Soon (Substantial Friction)
1. Plan refresh should happen on sidebar tab switch (Pro users missing Sonnet)
2. Add retry button to failed API requests (transient failures feel permanent)
3. Specific error messages for API failures (users can't self-diagnose)
4. Empty state on Errors tab needs clearer guidance (users don't know what to do)
5. Copy button feedback should not destroy accessibility (screen readers confused)
6. Multi-phase loading states are confusing (Sonnet resolution vs. decode phase)

### Backlog (Polish)
1. Conditional sourcemap tip is confusing (appears/disappears unexpectedly)
2. Character counter doesn't enforce limit (false affordance)
3. Network error categorization (DNS vs. CORS vs. timeout)
4. Batch decode preview (users don't consent to batching)
5. Focus indicators on tabs (WCAG compliance)
6. Model picker button layout shift (hidden Sonnet button gap)

---

## What's Working Well

1. **Tabbed organization** — Errors | Decode | Inspect is intuitive and logical
2. **Resizable sidepanel** — User-controlled width is excellent UX, grip is well-designed
3. **Real-time error capture** — Network + console errors appear automatically with no user action
4. **Inspector with CSS context** — Element selection + CSS rules + "Ask a question" flow is smooth
5. **Markdown rendering** — Code blocks with copy buttons, proper formatting
6. **Keyboard navigation on inspector** — ESC to cancel is discoverable and expected
7. **Tech stack detection** — React/Vue/Express badges provide context without being invasive
8. **Multi-select on errors** — Checkbox pattern is familiar, batch decode is efficient
9. **Dark mode support** — Light/dark theme CSS variables work throughout
10. **Service worker pattern** — Background capture doesn't block user experience, scales well

---

## Design Patterns to Preserve

- **Passive capture with active retrieval**: Extension captures in background, user decides when to decode (don't auto-analyze)
- **Tab-based organization**: Three distinct flows (observe, decode, inspect) in separate tabs
- **Inline code copy**: Copy buttons on all code blocks for quick action
- **Contextual help via hover/tooltip**: Tech badges, sourcemap tips on demand
- **Color coding by severity**: Error (red), warning (yellow), network (orange)
- **Local state persistence**: Panel width, API key stored locally for offline-first behavior


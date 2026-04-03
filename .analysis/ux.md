# UX Analysis Report

**Analyzed**: 2026-04-02  
**Scope**: Chrome extension error decoder (all UX layers: frontend UI, API responses, auth flows, error handling)  
**Friction Issues Found**: 12 (Critical: 1, High: 4, Medium: 5, Low: 2)  
**Opportunities Identified**: 8 (High: 3, Medium: 4, Low: 1)

---

# Part 1: Friction Analysis

## CRITICAL — User Has No Feedback While Source Maps Are Resolving

**Category**: Loading States | Missing Feedback  
**Location**: `packages/extension/src/sidepanel/index.ts:584-591`  
**User Journey Affected**: Decode flow (sidepanel)

**Current Behavior**:
```typescript
setDecoding(true, "Resolving source maps...");
decodeInput.classList.remove("has-results");
decodeResult.innerHTML = "";
// 5s timeout, then silent fallback
const enrichedText = await resolveSourceMaps(errorText);
setDecoding(true, "Decoding...");
decodeResult.innerHTML = `<div class="skeleton"></div>...`;
```

The button text changes to "Resolving source maps..." but:
- No visual feedback in the result area (blank state, confusing)
- If source map resolution times out silently after 5s, user sees abrupt button text change without knowing why
- The skeleton loader appears only AFTER source maps resolve, leaving a gap where nothing visually happens

**Impact**: User is confused about whether the extension is frozen or working. On slow connections or error-heavy pages, this is frustrating.

**Why This Matters**: Users need continuous visual feedback during async operations. A blank result area with just button text "Resolving..." doesn't communicate progress.

**Recommended Fix**: Show a loading skeleton in the result area while source maps resolve, not just button text. Or show inline text like "Getting source file names..." in the result area itself.

---

## HIGH — Invalid API Key Errors Show Complex Technical Message Instead of Action

**Category**: Error Messages | Clarity  
**Location**: `packages/extension/src/sidepanel/index.ts:604-620`  
**User Journey Affected**: Decode flow when API key is invalid/expired

**Current Behavior**:
```typescript
if (response.status === 401) {
  decodeResult.innerHTML = `
    <div class="auth-prompt">
      <p>Your API key is invalid or expired.</p>
      <p class="auth-sub">Sign in again or paste a new key in Settings.</p>
      <button class="btn btn-primary auth-signup-btn">Sign In</button>
      <p class="auth-fallback"><a href="#" class="auth-settings-link">Open Settings</a></p>
    </div>`;
}
```

The error message is clear, but two problems:
1. User doesn't know what caused the key to become invalid (rotation? session expired? plan downgrade?)
2. Two competing CTAs: "Sign In" vs "Open Settings" — user doesn't know which to choose

**Impact**: User confusion about next steps. Is the key broken? Do I need to re-sign-in? Do I need to paste a different key?

**Why This Matters**: Error messages should explain WHAT happened and WHO caused it, not just that it failed.

**Recommended Fix**: Differentiate the error states:
- If API returns 401 on an otherwise-valid request structure → "Your session expired. Sign in again."
- If API returns 400 with invalid-token code → "Your API key is invalid. [Open Settings to paste a new key]" (single CTA)

---

## HIGH — No Feedback for Successful Sensitive Data Scan Before Send

**Category**: Missing Feedback  
**Location**: `packages/extension/src/sidepanel/index.ts:568-582`  
**User Journey Affected**: Decode flow (when user has sensitive data in error, but no matches found)

**Current Behavior**:
```typescript
const sensitiveMatches = checkSensitiveData(errorText);
if (sensitiveMatches.length > 0) {
  // Show modal if matches found
  const proceed = await showConfirmModal({ ... });
}
// If no matches: no feedback at all, continues silently to decode
```

**Problem**: 
- If sensitive data IS found, user sees a modal (good).
- If NO sensitive data is found, user gets no confirmation that the check happened at all.
- User doesn't know if the check is a real security feature or just marketing.

**Impact**: User loses trust in the feature. They can't tell if it's actually scanning or if they're just being sent unprotected.

**Why This Matters**: Security features that don't communicate their success feel invisible and therefore fake.

**Recommended Fix**: Show a brief inline indicator: "✓ Scanned for sensitive data — none found. Sending..." before proceeding. Or a success toast: "No sensitive data detected."

---

## HIGH — Free Tier Upgrade Nudge Triggers On Every 3rd Decode But Has No CTA Prominence

**Category**: Conversion | Messaging Clarity  
**Location**: `packages/extension/src/sidepanel/index.ts:779-804`  
**User Journey Affected**: Free user after every 3rd decode

**Current Behavior**:
```typescript
if (currentPlan !== "pro" && sessionDecodeCount % 3 === 0) {
  renderUpgradeNudge(decodeResult);
}
```

The nudge is appended inline to results:
```html
<span class="upgrade-nudge-text">
  Liked this? Pro gives unlimited decodes + Deep Analysis. 
  <a href="#" class="upgrade-nudge-link">Upgrade</a>
</span>
```

**Problems**:
1. Nudge appears AFTER the result has loaded — user may have already closed the result or moved on
2. Link is inline text, not a button — low visual prominence
3. No clear messaging about WHEN the limit will hit ("You have 0 decodes left today" would be more urgent)

**Impact**: Nudges are ignored because they're contextually disconnected from usage reality. User doesn't realize they're about to hit a limit.

**Why This Matters**: Upgrade messaging is more effective when tied to scarcity (approaching limit) not arbitrary intervals.

**Recommended Fix**: 
- Show nudge at 2 decodes remaining (not every 3rd), or when usage bar hits 80%
- Use a button style instead of inline text
- Add urgency: "Only 1 decode left today — upgrade to unlimited"

---

## HIGH — Auth Flow Shows API Key in Success State But Doesn't Auto-Copy to Clipboard or Explain Why It Matters

**Category**: Onboarding | Information Architecture  
**Location**: `packages/web/src/auth.html:244-256` and `packages/web/src/auth.html:438-443`  
**User Journey Affected**: First-time signup → auth success state

**Current Behavior**:
```html
<div id="success-state" class="success-state hidden">
  <h2>You're in!</h2>
  <p>Your API key for the extension:</p>
  <div class="api-key-display">
    <span id="api-key-text"></span>
    <button class="copy-btn" id="copy-key">Copy</button>
  </div>
  <p class="note">
    The extension should pick this up automatically.
    If not, paste it in the extension's options page.
  </p>
  <button class="btn-logout" id="logout-btn">Log Out</button>
</div>
```

**Problems**:
1. No explanation of what the API key is or why the user is seeing it
2. "The extension should pick this up automatically" — vague (should? might? definitely will?)
3. No success indication if the key was successfully transferred to extension
4. User doesn't know if they can close this tab or need to stay

**Impact**: User confusion about whether the auth flow is complete. Some users will panic and manually paste the key even though extension auto-received it.

**Why This Matters**: Onboarding flows should confirm task completion, not leave users guessing.

**Recommended Fix**:
- Show: "Your account is ready! The extension will sync automatically." (no key display at all, cleaner flow)
- Add a secondary message if extension is detected: "Extension updated ✓"
- If not detected after 3s, show the key with: "Or paste this in extension settings: [Copy]"

---

## MEDIUM — "Air Is Busy" Error Message Is Unclear; No Retry Guidance

**Category**: Error Messages | Actionability  
**Location**: `packages/api/src/routes/decode.ts:125-127`  
**User Journey Affected**: Decode when AI service hits rate limit

**Current Behavior**:
```typescript
if (message.includes("rate_limit") || message.includes("429")) {
  return c.json({ 
    error: { message: "AI service is busy. Try again.", code: errorCodes.aiUnavailable } 
  }, 429);
}
```

The message "AI service is busy. Try again." is generic. User doesn't know:
- How long to wait
- Will retrying immediately work or cause the same error?
- Is this a 30-second blip or a 10-minute outage?

**Impact**: User retries immediately and hits the same error, wasting their daily decode quota (free tier).

**Why This Matters**: Transient errors should suggest a reasonable retry backoff time.

**Recommended Fix**: "Claude API is temporarily rate-limited. Please wait 30 seconds and try again."

---

## MEDIUM — No Indication When Decode Is Cached vs Fresh

**Category**: Missing Feedback | Transparency  
**Location**: `packages/extension/src/sidepanel/index.ts:639-664` (response does include cached flag, but UI doesn't show it)  
**User Journey Affected**: User decodes the same error twice in a session

**Current Behavior**:
```typescript
const { markdown, decodeId, cached } = json.data;
// cached flag is received but never displayed to user
renderMarkdown(markdown, decodeResult);
```

The response includes `cached: true/false` but:
- UI never shows "This result was cached" or similar
- User doesn't know if they got instant cached results or waited for AI

**Impact**: User double-decodes the same error (e.g., for verification) but gets the same result without knowing it's cached. No transparency.

**Why This Matters**: When a system behaves differently (instant vs 2-second latency), users should understand why.

**Recommended Fix**: Add a footer badge in decode results: "Instant (cached)" vs "AI-powered (fresh)"

---

## MEDIUM — History Dropdown Shows Time + Preview But No Timestamp Context (AM/PM)

**Category**: Usability | Clarity  
**Location**: `packages/extension/src/sidepanel/index.ts:754-757`  
**User Journey Affected**: User loads a decode from history

**Current Behavior**:
```typescript
const time = new Date(entry.timestamp).toLocaleTimeString([], { 
  hour: "2-digit", minute: "2-digit" 
});
option.textContent = `${time} — ${entry.errorPreview}`;
```

Shows format like "14:32 — ReferenceError: x is not defined" but:
- No AM/PM indicator in 12-hour locales (ambiguous if 14:32 is formatted in 24-hour mode in some locales)
- No date (if history spans multiple days, "14:32" is meaningless)
- No indication if decodes succeeded or had errors

**Impact**: User can't distinguish between two decodes of the same error from different times.

**Why This Matters**: History timestamps need context to be useful across sessions.

**Recommended Fix**: Show "Today 2:32 PM — ReferenceError" or "Yesterday 2:32 PM — ReferenceError" and include an icon/badge for feedback state (👍/👎) if available.

---

## MEDIUM — Sonnet Model Button Appears Hidden for Pro Users But Has No Explanation of Why It's Limited

**Category**: Information Architecture | Expectation Setting  
**Location**: `packages/extension/src/sidepanel/index.ts:482-487` and HTML  
**User Journey Affected**: Pro user tries to use Sonnet, hits 20/month limit

**Current Behavior**:
```typescript
if (plan === "pro") {
  sonnetBtn.classList.remove("hidden");
  const remaining = sonnetLimit - sonnetUsed;
  sonnetRemaining.textContent = `(${remaining} left)`;
}
```

Button shows "(0 left)" when limit is reached, but:
- No explanation of WHY there's a limit (monthly cap is arbitrary, but should be justified)
- No indication of when the limit resets (which month?)
- No upsell or workaround (should suggest using Haiku instead or upgrading plan)

**Impact**: Pro user feels punished for being pro. The limit feels arbitrary without context.

**Why This Matters**: Usage limits should be transparent about their reasoning and reset schedule.

**Recommended Fix**: Show "(0 left — resets April 1st)" and when limit is hit, show tooltip: "Deep Analysis is limited to 20 per month. Use Haiku for unlimited decodes."

---

## MEDIUM — Empty State Onboarding Takes Up Too Much Space in Small Sidepanel

**Category**: Information Architecture | Space Efficiency  
**Location**: `packages/extension/src/sidepanel/index.html:33-56`  
**User Journey Affected**: New user opens sidebar for the first time (Errors tab)

**Current Behavior**:
The empty state shows a three-step numbered onboarding card:
```html
<div class="onboarding">
  <div class="onboarding-step">
    <div class="onboarding-icon">1</div>
    <div class="onboarding-text">
      <strong>Errors appear here</strong>
      <span>Console errors, failed requests...</span>
    </div>
  </div>
  <!-- x3 steps -->
</div>
```

**Problem**: 
- Sidepanel is narrow (default ~400px), so three steps with icons + text takes up most vertical space
- User can't see any actual errors until errors occur (catch-22: need to trigger an error to learn the UI)
- No visible CTA to switch to Decode tab or trigger an action

**Impact**: User doesn't know what to do while waiting for an error to occur. They may think the extension is broken.

**Why This Matters**: Empty states should guide users to the next action, not just explain what the panel does.

**Recommended Fix**: Condense to 1-2 sentences + button: "No errors yet. Try the Decode tab to analyze an error manually → [Try Decode]"

---

## LOW — Copy Button Feedback Is Silent; No Toast Notification

**Category**: Feedback | User Confirmation  
**Location**: `packages/extension/src/shared/ui.ts:40-49`  
**User Journey Affected**: User copies code from a decode result

**Current Behavior**:
```typescript
export const copyToClipboard = async (
  btn: HTMLElement,
  getText: () => string | Promise<string>,
  originalText = "Copy"
) => {
  const text = await Promise.resolve(getText());
  await navigator.clipboard.writeText(text);
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = originalText; }, 2000);
};
```

Button text changes "Copy" → "Copied!" → "Copy" but:
- No visual styling change (just text)
- No sound or toast
- If user clicks elsewhere before 2s, they might miss the "Copied!" state

**Impact**: Low confidence that copy actually worked. User might copy twice.

**Why This Matters**: Copy-to-clipboard is a critical action; feedback matters.

**Recommended Fix**: Add a brief toast: "Copied to clipboard" that appears for 1.5s, or change button background color to green briefly.

---

## LOW — Char Counter in Popup Uses `toLocaleString()` But User Likely Expects Simple Number

**Category**: UX Polish | Clarity  
**Location**: `packages/extension/src/popup/index.ts:46`  
**User Journey Affected**: User pastes error into popup and checks character count

**Current Behavior**:
```typescript
textarea.addEventListener("input", () => {
  charCurrent.textContent = textarea.value.length.toLocaleString();
});
```

Uses `toLocaleString()` which formats as "1,023" (locale-aware), but:
- For small numbers (0-999), this adds commas: "543" → "543" (no change, fine)
- For larger numbers: "1234" → "1,234" which adds visual clutter
- User doesn't need locale formatting for a simple char count

**Impact**: Minimal, but feels over-engineered for a simple display.

**Why This Matters**: Not a real friction point, but removes unnecessary complexity.

**Recommended Fix**: Use plain `String(textarea.value.length)` instead of `toLocaleString()`.

---

# Part 2: Opportunity Analysis

## HIGH OPPORTUNITY — Keyboard Shortcuts for Common Actions

**Category**: Missing Interaction | Accessibility  
**Relevant Area**: Sidebar (`packages/extension/src/sidepanel/index.ts`)  
**User Story**: As a developer, I would expect to press Cmd+D or Ctrl+D to decode the selected error, so that I don't have to reach for the mouse every time.

**What's Missing**: 
- No keyboard shortcut to trigger Decode (Haiku or Sonnet)
- No shortcut to switch tabs in sidebar
- No shortcut to clear errors
- ESC already cancels inspect (good), but should extend to other flows

**What Users Probably Do Instead**: Click buttons for everything, breaking flow between keyboard work and mouse.

**Suggested Approach**: 
- Cmd/Ctrl+Enter to decode current textarea (Haiku)
- Cmd/Ctrl+Shift+Enter to decode with Sonnet
- Cmd/Ctrl+Shift+E to switch to Errors tab
- Tab numbers (1, 2, 3) to switch tabs quickly

**Effort Estimate**: Small (20 lines of event listeners)

**Impact**: Dramatically improves power-user flow and accessibility. Developers hate leaving the keyboard.

---

## HIGH OPPORTUNITY — No Undo/Redo for Cleared Errors or Deleted Decode History

**Category**: Missing Interaction | Error Recovery  
**Relevant Area**: Sidebar tabs (Errors, Decode)  
**User Story**: As a developer, I accidentally cleared my error feed. I would expect an "Undo" button to appear so that I can recover the errors without reloading the page.

**What's Missing**:
- "Clear errors" button deletes all captured errors permanently
- No undo toast
- No recovery mechanism except refreshing the page and re-triggering errors
- History is per-session (IndexedDB), so clearing also loses history
- No confirmation dialog on "Clear" (only dangerous actions like delete account have dialogs)

**What Users Probably Do Instead**: Reload the page and hope the errors replay, or manually re-trigger errors.

**Suggested Approach**:
- Add confirmation dialog before clearing: "This will clear captured errors. Continue?"
- On clear, show a toast with "Undo" button for 5 seconds
- Store last 50 errors in session storage temporarily so undo can restore them
- Same for history deletes

**Effort Estimate**: Medium (need session state management for undo stack)

**Impact**: Reduces anxiety around destructive actions. Users will be more confident clearing data.

---

## HIGH OPPORTUNITY — Multi-Select Decode Shows Combined Error But Doesn't Show Which Errors Are Being Decoded

**Category**: Missing Feedback | Workflow Gap  
**Relevant Area**: Sidebar Errors tab (`packages/extension/src/sidepanel/index.ts:334-354`)  
**User Story**: As a developer, I select 3 errors and click "Decode Selected." I would expect to see a summary of which errors are about to be sent (or are being sent) so that I don't accidentally send sensitive data from a subset.

**What's Missing**:
```typescript
// Current: just pastes all selected into textarea with minimal formatting
textarea.value = selected.map((e: CapturedError, i: number) => 
  `Error ${i + 1} [${e.level}]: ${e.text}`
).join("\n\n");
```

User sees combined error text but:
- No visual list of which errors are included
- No way to remove one error from the batch before sending
- No indication of total combined character count
- For free users, no warning if combined text exceeds 1000 char limit

**What Users Probably Do Instead**: Manually copy-paste individual errors instead of using batch decode.

**Suggested Approach**:
- Show a checklist in decode tab: "[✓] Error 1: ReferenceError [✓] Error 2: CORS Error [✓] Error 3: Timeout"
- Add inline edit buttons: "[✗] Remove" for each error
- Show total char count with free tier warning
- Only paste into textarea after user confirms

**Effort Estimate**: Medium (UI refactor + state management)

**Impact**: Users batch-decode more confidently, using the feature more often.

---

## MEDIUM OPPORTUNITY — No Success Confirmation After Completing Destructive Actions

**Category**: Missing Feedback  
**Relevant Area**: Account management (`packages/extension/src/options/index.ts`)  
**User Story**: As a user, I delete my account. I would expect a success message before being logged out, so I know the action actually completed.

**What's Missing**:
- Delete account: shows error dialog on failure, but no success message on completion before redirect
- Logout: no confirmation (just clears and redirects)
- Save API key: shows status message ("Saved!") that disappears, then reloads page (jarring)

**What Users Probably Do Instead**: Assume it worked because no error appeared. Or navigate manually to verify, wasting time.

**Suggested Approach**:
- Delete account: show "Account deleted. You will be logged out..." then redirect after 2s
- Logout: show toast "Logged out" before redirect
- Save API key: show toast with checkmark, wait 1s, then reload (smoother than instant reload)

**Effort Estimate**: Small (add toast notifications)

**Impact**: Users have confidence in action completion.

---

## MEDIUM OPPORTUNITY — No Real-Time Feedback When API Key Validation Fails

**Category**: Missing Feedback | Workflow Gap  
**Relevant Area**: Options page (`packages/extension/src/options/index.ts:38-75`)  
**User Story**: As a user, I paste an invalid API key. I would expect the validation to fail with a clear error so that I don't waste time trying to use it.

**What's Missing**:
```typescript
// Current: waits for API response, then shows error in status element
try {
  const res = await api.usage();
  if ("data" in res) {
    // Success
  } else {
    statusEl.textContent = "Invalid API key. Check and try again.";
  }
} catch {
  statusEl.textContent = "Could not validate key. Check your connection.";
}
```

**Problems**:
- No loading indicator while validating (looks frozen for 1-2 seconds)
- Error message doesn't say WHY it's invalid (format? revoked? wrong env?)
- No keyboard focus management (user doesn't know where the next action is)

**What Users Probably Do Instead**: Paste key, wait silently, see error, give up and contact support.

**Suggested Approach**:
- Show spinner: "Validating..." while checking
- On 401: "API key not found. Check you're using the correct key from your account."
- On 403: "API key is revoked. Generate a new one in your account."
- On network error: "Can't reach server. Check your internet connection."
- Auto-focus input field on error so user can quickly retype

**Effort Estimate**: Small (add loading state + better error mapping)

**Impact**: Self-serve validation reduces support burden.

---

## MEDIUM OPPORTUNITY — No Export/Download for Decode History

**Category**: Missing Workflow  
**Relevant Area**: Sidebar Decode tab (`packages/extension/src/sidepanel/index.ts:737-773`)  
**User Story**: As a developer, I have a month of decode history. I would like to export it as JSON or CSV so that I can reference it later or share with a team member.

**What's Missing**:
- History is session-only (IndexedDB), no export option
- History UI only shows dropdown, no grid or table view
- No way to see all decodes at once

**What Users Probably Do Instead**: Screenshot individual results or manually compile notes.

**Suggested Approach**:
- Add "Export history" button that downloads JSON with all entries
- Include: error text, AI response, model used, timestamp, feedback given
- Optionally: "Export as CSV" for spreadsheet import

**Effort Estimate**: Small (JSON stringify + blob download)

**Impact**: Increases product stickiness. Users keep history around instead of discarding it.

---

## MEDIUM OPPORTUNITY — No Indication of AI Compute Time Per Decode

**Category**: Missing Feedback | Transparency  
**Relevant Area**: Decode results (`packages/extension/src/sidepanel/index.ts:639`)  
**User Story**: As a power user, I would like to know how fast the AI responded so that I can judge response quality and notice if there are performance issues.

**What's Missing**:
- API logs response_time_ms but UI never shows it
- User doesn't know if response took 500ms or 5s
- No way to see if cache hit or fresh decode (covered in earlier friction, but related)

**What Users Probably Do Instead**: Trust it's working and move on.

**Suggested Approach**:
- Show footer badge: "Decoded in 1.2s" or "Instant (cached)"
- For cached hits, show: "Cached response (<50ms)"
- Helps diagnose slow API or network issues

**Effort Estimate**: Small (show response_time_ms from API response)

**Impact**: Transparency builds trust. Power users appreciate seeing the machinery.

---

## LOW OPPORTUNITY — No Breadcrumb Navigation in Settings

**Category**: Information Architecture  
**Relevant Area**: Options page  
**User Story**: As a user in the Settings page, I would expect a "Back" button or breadcrumb so I can return to the sidebar without opening it separately.

**What's Missing**:
- Options page opens in new tab, no navigation back to sidebar/popup
- User must manually close tab and click extension icon again
- No indication they're in "extension settings" (context is lost)

**What Users Probably Do Instead**: Close tab and re-open extension.

**Suggested Approach**:
- Add header breadcrumb: "ErrorDecoder > Settings"
- Add "Back to Sidebar" button that closes tab and opens sidebar in current tab

**Effort Estimate**: Small (chrome.tabs.close + reopen sidebar)

**Impact**: Improves navigation flow for users who frequently jump between sidebar and settings.

---

## LOW OPPORTUNITY — No Detect When User Browsers Offline; Show Graceful Degradation

**Category**: Missing Feedback | Error Recovery  
**Relevant Area**: All network-dependent features  
**User Story**: As a user on a flight, I would like the extension to tell me it's offline so that I know why decode requests fail.

**What's Missing**:
- Network errors show generic "Failed to connect to API" message
- No offline detection or status indicator
- Doesn't cache AI responses for when user goes online

**What Users Probably Do Instead**: Think the extension is broken.

**Suggested Approach**:
- Listen to `navigator.onoffline` and `window.online` events
- Show banner: "You're offline. Decoding unavailable until connection restored."
- Cache last 10 decode responses; allow view-only access while offline

**Effort Estimate**: Medium (offline state management + cache storage)

**Impact**: Improves UX during network interruptions. Niche but meaningful for remote workers.

---

# Summary

## Friction Issues

**By Category:**
- Error Messages: 3 (Unclear AI error, invalid API key flow, technical language)
- Missing Feedback: 4 (Source maps, sensitive data scan, cache indication, copy confirmation)
- Navigation/Information Architecture: 2 (Empty state, timestamp context)
- Constraint communication: 2 (Sonnet limit details, free tier limit awareness)
- UX Polish: 1 (Char counter formatting)

**Critical**: 1 (Source map resolution has no loading state)  
**High**: 4 (API key messaging, nudge timing, auth onboarding, rate limit message)  
**Medium**: 5 (Cache indication, history timestamps, Sonnet limit context, empty state, copy feedback)  
**Low**: 2 (Char formatting, offline detection)

## Opportunities

**By Category:**
- Missing Interactions: 2 (Keyboard shortcuts, undo/redo)
- Missing Feedback: 2 (Destructive action confirmation, API key validation feedback)
- Workflow Gaps: 2 (Multi-select batch summary, history export)
- Information Architecture: 2 (Compute time display, breadcrumb navigation)

**High Opportunity**: 3 (Keyboard shortcuts, undo/redo, batch decode feedback)  
**Medium Opportunity**: 4 (Success confirmations, API key validation, history export, compute time display)  
**Low Opportunity**: 1 (Breadcrumb navigation)

## Priority

### Fix Now (Blocking Users)
1. **Source map resolution has no loading state** (CRITICAL) — user sees blank area, thinks extension is frozen
2. **API key error messages are confusing** (HIGH) — user doesn't know if key is broken or just session expired
3. **Free tier upgrade nudge is ineffective** (HIGH) — should tie to actual usage limit, not arbitrary interval

### Fix Soon (Substantial Friction)
1. **Auth success state shows key but doesn't explain it** (HIGH) — new users confused about what just happened
2. **Rate limit error message lacks retry guidance** (HIGH) — users retry immediately and waste quota
3. **Decode history shows times without AM/PM or dates** (MEDIUM) — useless across sessions
4. **Sonnet limit appears but has no context** (MEDIUM) — feels arbitrary without reset schedule
5. **Sensitive data scan shows modal on match but no feedback on safe path** (HIGH) — feature feels fake

### High-Value Opportunities
1. **Keyboard shortcuts for common actions** (HIGH) — developers expect Ctrl+D to decode, improves power-user flow
2. **Undo/redo for destructive actions** (HIGH) — reduces anxiety around clearing errors/history
3. **Batch decode shows combined error but not which errors** (HIGH) — user can't see what they're sending

### Backlog (Polish + Low-Priority Opportunities)
- Success confirmations on destructive actions (delete account, logout)
- API key validation feedback (loading + better errors)
- History export as JSON/CSV
- Response time display in results
- Breadcrumb navigation in settings
- Offline detection + graceful degradation

## What's Working Well

- **Error state messages are specific**: Free tier char limit clearly states the limit and upgrade path ("Free tier limited to 1,000 chars. Upgrade to Pro for unlimited.")
- **Sensitive data detection exists and warns before send**: The feature proactively protects users from leaking secrets.
- **Confirmation modals for destructive actions**: Delete account and logout both have warnings (good pattern).
- **Tab switching in sidebar is clear**: Active tab is visually highlighted with underline; switching feels responsive.
- **Copy-to-clipboard buttons are abundant**: Code examples and API keys can all be copied with one click (good UX for dev tools).
- **Tech stack detection is non-intrusive**: Framework badges appear in header without cluttering the main UI.
- **Keyboard support for inspect mode**: ESC to cancel inspect is discoverable and expected.
- **Loading skeletons during decode**: Shows progress with placeholder content (good practice).
- **Auth page has both signup and login on same page**: No need to navigate between signup/login flows; tabs make it obvious.

---

## What Requires Escalation

**This analysis identifies UX problems and opportunities, but does NOT require escalation.** All findings are:
- Self-contained UX improvements (no business requirements needed)
- Align with existing product strategy (Chrome extension, fast iteration)
- Standard interaction patterns (keyboard shortcuts, undo, confirmations are industry norms)

The only strategic question: **Should nudges drive free → pro conversion via scarcity (limit approaching) or via value proposition (feature highlight)?** Current approach mixes both inconsistently. Recommend: **Decide if free tier limit is a hard constraint (must upgrade) or soft suggestion (can still use but with slowdown).** This affects nudge messaging.

---

**Report generated**: 2026-04-02 | Analyzed: Full codebase (API + Extension + Web)

# UX Analysis Report

**Analyzed**: 2026-04-02  
**Scope**: Chrome extension (UI, popup, sidepanel, options) + API backend + web landing/auth pages  
**Issues Found**: 13 (Critical: 2, High: 5, Medium: 4, Low: 2)

---

## CRITICAL — Generic "Internal server error" masks actual problem

**Category**: Error Messages  
**Location**: `packages/api/src/lib/error-handler.ts:4-16`  
**User Journey Affected**: Any API error path; user sees "Internal server error" regardless of what actually broke

**Current Behavior**:
```typescript
export const errorHandler: ErrorHandler = (err, c) => {
  console.error(`[API Error] ${err.message}`);
  return c.json(
    {
      error: {
        message: "Internal server error",
        code: errorCodes.serverError,
      },
    },
    500
  );
};
```

All errors (authentication failures, validation, rate limits, AI service timeouts) get collapsed into one message. The extension shows "Internal server error" to the user, who has no idea what went wrong or how to fix it.

**Impact**: User cannot distinguish between "API is down," "their API key is invalid," "they hit rate limits," or "the AI service crashed." This kills trust in a brand-new product and prevents proper error recovery.

**Recommended Fix**: Route errors through typed error handlers before the catch-all. At minimum:
- Distinguish between client errors (4xx) and server errors (5xx)
- For auth failures, show "Your API key is invalid" not "Internal server error"
- For rate limits, show "Too many requests. Try again in X seconds"
- For AI unavailability, show "AI service is temporarily unavailable. Try again soon"

**Why This Matters**: Error messages are the only communication channel when things break. A generic message leaves users stranded. The extension already has some context-specific error handling in sidepanel (401 handling at line 473-489), but the API layer doesn't.

---

## CRITICAL — Free tier daily usage check has no user feedback on when limit resets

**Category**: Navigation / Information Architecture  
**Location**: `packages/extension/src/sidepanel/index.ts:317-346`  
**User Journey Affected**: Free user hits 3 daily decode limit; doesn't know when they can decode again

**Current Behavior**:
```typescript
const updateUsageDisplay = (used: number, limit: number, plan: string) => {
  if (plan === "pro") {
    haikuRemaining.textContent = "";
    haikuBtn.disabled = false;
    usageBar.classList.add("hidden");
    return;
  }
  const remaining = Math.max(0, limit - used);
  haikuRemaining.textContent = `(${remaining} left)`;
  usageBar.classList.remove("hidden");
  if (remaining === 0) {
    haikuBtn.disabled = true;
    haikuRemaining.textContent = "(limit reached)";
    usageBar.className = "usage-bar limit-hit";
    usageBar.innerHTML = `<a href="#" id="upgrade-cta" class="btn btn-primary btn-upgrade">Upgrade to Pro</a>`;
  }
```

When a free user hits 0 remaining, the UI shows "(limit reached)" and a button to upgrade. **There is no indication of WHEN the limit resets** — midnight UTC? Same time tomorrow? The endpoint returns `resetsAt` (line 42 in usage.ts) but it's never displayed to the user.

**Impact**: Free user wastes time trying to decode, gets confused why button is disabled. No path forward except "upgrade" (which is the goal, but UX should still be clear). Leads to support tickets.

**Recommended Fix**:
1. Store and display the reset time: "Limit resets at 12:00 AM UTC" or "Try again in 8 hours"
2. Update the usage display to show: "3 of 3 used today. Resets at midnight UTC."
3. Consider adding a countdown timer if desired

**Why This Matters**: Users need to know whether their action blocked them for 10 minutes or 24 hours. Ambiguity creates confusion and frustration.

---

## HIGH — Sonnet monthly limit message doesn't explain what "Deep Analysis" means or how to get more

**Category**: Error Messages  
**Location**: `packages/api/src/routes/decode.ts:60-65`  
**User Journey Affected**: Pro user who has used 20 Sonnet decodes this month tries to use Sonnet again

**Current Behavior**:
```typescript
if (sonnetUsed >= 20) {
  return c.json({
    error: { message: "Monthly Sonnet limit reached (20/month).", code: errorCodes.sonnetLimitReached },
  }, 429);
}
```

The extension displays: "Monthly Sonnet limit reached (20/month)." A Pro user sees this and doesn't know:
- What Sonnet is for (vs Haiku)
- Why they have a limit
- When the limit resets
- How to get more

**Impact**: Pro user thinks they're blocked entirely. They don't realize they can still decode with Haiku. The message should guide them.

**Recommended Fix**: "You've used all 20 monthly Deep Analysis decodes. Switch to standard decoding (Haiku) or wait until next month."

**Why This Matters**: A Pro user hitting this error should know they can still use the product. The current message suggests they've hit a wall.

---

## HIGH — No loading state feedback when resolving source maps (5s silent wait)

**Category**: Feedback / Clarity  
**Location**: `packages/extension/src/sidepanel/index.ts:388-401, 453`  
**User Journey Affected**: User clicks Decode → waits 5 seconds for source map resolution → no indication anything is happening

**Current Behavior**:
```typescript
setDecoding(true, "Resolving source maps...");
decodeInput.classList.remove("has-results");
decodeResult.innerHTML = "";

// Resolve source maps to get actual file names + source code
const enrichedText = await resolveSourceMaps(errorText);

setDecoding(true, "Decoding...");
decodeResult.innerHTML = `<div class="skeleton"></div><div class="skeleton short"></div><div class="skeleton"></div>`;
```

The code calls `setDecoding(true, "Resolving source maps...")` which updates button text. But:
1. If source map resolution times out (5s), it silently returns the original error text
2. No skeleton loading state is shown until **after** source maps are resolved
3. User sees disabled button + blank result area for 5+ seconds with zero feedback

**Impact**: User thinks the extension froze. They don't know if it's working or broken. Poor signal of system responsiveness.

**Recommended Fix**:
1. Show skeleton loading immediately after the button is clicked
2. If source map resolution takes >2s, show a progress indicator
3. If it times out, show a subtle message: "Couldn't resolve source maps. Decoding with original traces."

**Why This Matters**: Loading states are critical UX. A 5-second silent wait damages perceived performance and trust.

---

## HIGH — Sensitive data warning uses "confirmDanger=true" but doesn't make the action sound dangerous

**Category**: Clarity / Color Coding  
**Location**: `packages/extension/src/sidepanel/index.ts:441-451`  
**User Journey Affected**: User has sensitive data in error; sees warning modal with red "Send Anyway" button

**Current Behavior**:
```typescript
const sensitiveMatches = checkSensitiveData(errorText);
if (sensitiveMatches.length > 0) {
  const proceed = await showConfirmModal({
    title: "Sensitive Data Detected",
    message: formatSensitiveWarning(sensitiveMatches),
    confirmText: "Send Anyway",
    cancelText: "Go Back & Edit",
    confirmDanger: true,  // Makes button RED
  });
  if (!proceed) return;
}
```

The modal is styled with a red danger button (`confirmDanger: true`), but the message tone doesn't match the urgency:

```
Possible sensitive data detected:

• AWS Access Key: AKIA****••••
• Stripe Key: sk_li****••••

This text will be sent to our API and processed by AI. Consider removing secrets before decoding.
```

The word "Consider" is weak. A red button + "Consider removing" don't align. Either the button should be less aggressive, or the message should be stronger.

**Impact**: User sees red button (which signals danger) but the message sounds optional ("consider"). Inconsistency creates confusion about severity.

**Recommended Fix**: Either:
1. Change message to match danger level: "Do not send this error — secrets will be exposed to AI processing. Remove them first."
2. Or downgrade confirmDanger to false and use normal colors since it's a "consider" action

**Why This Matters**: Color + messaging consistency is critical for user trust. Red danger buttons must match danger-level language.

---

## HIGH — Account deleted but extension doesn't know; stale API key sits in storage

**Category**: Navigation / State Management  
**Location**: `packages/extension/src/options/index.ts:106-120`  
**User Journey Affected**: User deletes account on options page; extension doesn't clear stored API key

**Current Behavior**:
```typescript
document.getElementById("delete-account")?.addEventListener("click", async () => {
  const confirmed = await showConfirmModal({
    title: "Delete Account",
    message: "This will permanently delete your account, cancel your subscription, and erase all decode history. This cannot be undone.",
    confirmText: "Delete My Account",
    confirmDanger: true,
  });
  if (!confirmed) return;

  const { api, AUTH_URL } = await import("../shared/api");
  await api.deleteAccount();  // Sends DELETE to backend
  await storage.clear();      // Clears extension storage
  chrome.tabs.create({ url: `${AUTH_URL}?logout=true` });
  loadProfile();
});
```

The code:
1. Calls `api.deleteAccount()` (fires the API call)
2. Calls `storage.clear()` (clears extension storage)
3. Opens logout page
4. Calls `loadProfile()` (runs on the now-cleared storage)

**But if the API call fails**, the extension doesn't know. It clears storage and logs out anyway. User is logged out locally but their account still exists on the server.

**Impact**: If deleteAccount() fails (network error, server error), the user is left in an inconsistent state: logged out locally but account still exists remotely. They can't delete it again without signing back in.

**Recommended Fix**:
```typescript
const { api, AUTH_URL } = await import("../shared/api");
const deleteRes = await api.deleteAccount();
if ('error' in deleteRes) {
  // Show error, don't clear storage
  showMessage("Failed to delete account. Try again.");
  return;
}
// Only clear storage after successful delete
await storage.clear();
```

**Why This Matters**: Account deletion is a critical operation. Partial failures must be caught and reported.

---

## HIGH — Decode with batch errors shows "Error 1 [error]:" but doesn't explain the context

**Category**: Information Architecture  
**Location**: `packages/extension/src/sidepanel/index.ts:241, 256`  
**User Journey Affected**: User selects 2+ errors to decode together; gets concatenated list with no context

**Current Behavior**:
```typescript
// Decode Selected errors
if (selected.length === 1) {
  textarea.value = selected[0].text;
} else {
  textarea.value = selected.map((e: CapturedError, i: number) => `Error ${i + 1} [${e.level}]: ${e.text}`).join("\n\n");
}

// Decode All — batch last 15 errors
const recent = (result[key] || []).slice(-15);
textarea.value = recent.map((e: CapturedError, i: number) => `Error ${i + 1} [${e.level}]: ${e.text}`).join("\n\n");
```

When you batch multiple errors, the UI shows:
```
Error 1 [error]: TypeError: Cannot read property 'x' of undefined

Error 2 [error]: ReferenceError: foo is not defined

Error 3 [warning]: ...
```

No indication of timestamps, which page they occurred on, or the order they happened in. The AI is getting multiple unrelated errors with no context about which ones are related.

**Impact**: AI produces generic answers when errors could be causally linked. User doesn't know if they're looking at 15 separate problems or a chain reaction.

**Recommended Fix**:
```typescript
Error 1 [error] at 2:34 PM from /dashboard:
TypeError: Cannot read property 'x' of undefined

Error 2 [error] at 2:34 PM from /dashboard:
ReferenceError: foo is not defined
```

Or add a note above: "These 15 errors were captured over 3 minutes. They may be related."

**Why This Matters**: Context is crucial for AI to give good answers. Removing timestamps and URLs creates ambiguity.

---

## MEDIUM — API error response structure is inconsistent (sometimes `error`, sometimes `error.message`)

**Category**: API Design  
**Location**: Multiple routes consume errors inconsistently  
**Files**: `packages/api/src/routes/decode.ts:472-503`, `packages/extension/src/sidepanel/index.ts:472-504`  
**User Journey Affected**: Extension has to parse error responses with defensive code

**Current Behavior**:

Auth routes return:
```typescript
{ error: { message: "Invalid token", code: errorCodes.authInvalid } }
```

Decode route returns:
```typescript
{ error: { message: "Free tier limited to 1,000 characters...", code: errorCodes.inputTooLong }, upgradeUrl: "..." }
```

The extension handles both:
```typescript
if (json.error) {
  if (response.status === 401) {
    // Show auth error
  }
  if (json.upgradeUrl) {
    // Show upgrade prompt
  } else {
    decodeResult.innerHTML = `<p class="error-msg">${escapeHtml(json.error.message)}</p>`;
  }
}
```

The shape is `{ error: { message, code }, upgradeUrl? }` in some places but different elsewhere. There's no clear specification.

**Impact**: Extension code is defensive (checking for presence of fields). If a new endpoint has a different shape, the extension breaks silently.

**Recommended Fix**: Define a standard error shape:
```typescript
type ApiResponse<T> = 
  | { data: T }
  | { error: { code: string; message: string; details?: unknown } }
```

All endpoints return this. No side keys like `upgradeUrl` at the top level.

**Why This Matters**: Consistency prevents bugs and makes the API easier to use.

---

## MEDIUM — "Decode Another" button doesn't clear error message or reset tab state

**Category**: Navigation  
**Location**: `packages/extension/src/popup/index.ts:78-83`  
**User Journey Affected**: User decodes an error, gets result, clicks "Decode Another", still sees previous error message

**Current Behavior**:
```typescript
document.getElementById("new-decode-btn")?.addEventListener("click", () => {
  textarea.value = "";
  charCurrent.textContent = "0";
  showState("paste");
  textarea.focus();
});
```

This resets the textarea and shows the paste mode, but the previous success/error message might still be visible depending on how `showState` works.

**Impact**: User sees mixed states (old message + new form). Minor but sloppy.

**Recommended Fix**: Clear the result container before showing paste mode:
```typescript
document.getElementById("new-decode-btn")?.addEventListener("click", () => {
  textarea.value = "";
  charCurrent.textContent = "0";
  resultState.innerHTML = "";  // Clear previous result
  showState("paste");
  textarea.focus();
});
```

**Why This Matters**: Clean state transitions improve perceived polish.

---

## MEDIUM — No indication that "Element Inspector" requires a separate action after clicking the button

**Category**: Navigation / Clarity  
**Location**: `packages/extension/src/sidepanel/index.ts:523-541`  
**User Journey Affected**: User clicks "Click to inspect an element" button but doesn't understand they now need to click on a page element

**Current Behavior**:
```typescript
const startInspect = () => {
  if (!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId, { type: "START_INSPECT" });
  inspectBtn.textContent = "🔍 Click an element...";  // Button text changes
  inspectBtn.disabled = true;
  inspectCancelBtn.classList.remove("hidden");
};
```

The button text changes to "Click an element..." but:
1. The button is disabled (can't click it)
2. The UI doesn't explain "now click on the page, not the button"
3. New users might click the button repeatedly thinking it's broken

**Impact**: Discovery issue. Users don't understand the two-step interaction model.

**Recommended Fix**: Show a tooltip/banner when inspect mode starts:
```
⚠️ Inspect mode active. Click any element on the page to analyze it.
```

Or change the button text to something clearer:
```
"Inspect mode active — click an element on the page"
```

**Why This Matters**: Two-step interactions need clear affordances.

---

## MEDIUM — Successful Sonnet decode doesn't confirm which model was used; user might think they used Haiku

**Category**: Clarity  
**Location**: `packages/extension/src/sidepanel/index.ts:506-514`  
**User Journey Affected**: Pro user clicks "Decode (Sonnet)" and gets a result, but doesn't see confirmation they used Sonnet

**Current Behavior**:
```typescript
renderMarkdown(json.data.markdown, decodeResult);
decodeInput.classList.add("has-results");
```

After decoding, the response is rendered but there's no badge/label saying "Decoded with Claude Sonnet" or showing that a Sonnet query was used. The user doesn't know if they burned one of their 20 monthly Sonnet queries or used Haiku.

**Impact**: Pro user can't track their Sonnet usage. They might be surprised when they hit the limit.

**Recommended Fix**: Add a small badge above the result:
```html
<div class="model-badge">🤖 Analyzed with Claude Sonnet</div>
```

Or add it to the result: "**Analyzed with Claude Sonnet** (18 remaining this month)"

**Why This Matters**: Users need visibility into quota-limited resource usage.

---

## MEDIUM — Auth page "Sign Up" and "Log In" tab switching clears error messages without user seeing them

**Category**: Information Architecture  
**Location**: `packages/web/src/auth.html:301-310`  
**User Journey Affected**: User tries to sign up, gets error, clicks "Log In" tab, error disappears

**Current Behavior**:
```typescript
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const isSignup = tab.dataset.tab === "signup";
    document.getElementById("signup-form").classList.toggle("hidden", !isSignup);
    document.getElementById("login-form").classList.toggle("hidden", isSignup);
    messageEl.className = "message";  // ← Clears the error message
  });
});
```

User sees "Email already exists" → clicks "Log In" → message cleared. They might forget what they were trying to do.

**Impact**: User loses context. Minor but sloppy UX.

**Recommended Fix**: Don't clear messages when switching tabs, or show a prompt: "You have an error. Switch anyway?"

**Why This Matters**: Don't discard user-facing information without warning.

---

## LOW — Checkout success page has no clear next steps

**Category**: Navigation  
**Location**: `packages/web/src/checkout/success.html` (needs to be read)  
**User Journey Affected**: User completes Stripe checkout; lands on success page with unclear next actions

**Impact**: User paid successfully but doesn't know if the extension automatically upgraded or if they need to do something.

**Recommended Fix**: Show:
```
✓ Payment successful!
Your Pro plan is now active. The extension will update within 5 seconds.
Still waiting? Refresh the extension or reload the page.
```

**Why This Matters**: Post-purchase UX is critical.

---

## LOW — No visual distinction between clickable "Upgrade" links and regular text links

**Category**: Visual Hierarchy  
**Location**: `packages/extension/src/sidepanel/index.ts:332-345`  
**User Journey Affected**: Free user at limit sees "Upgrade to Pro" link but styling might make it look like regular text

**Current Behavior**:
```typescript
usageBar.innerHTML = `
  <a href="#" id="upgrade-cta" class="btn btn-primary btn-upgrade">Upgrade to Pro</a>`;
```

The link uses CSS classes but if the CSS doesn't render properly or if dark mode dims it, it might not stand out.

**Impact**: User might miss the upgrade CTA when they hit the limit.

**Recommended Fix**: Ensure `btn-upgrade` class is highly visible (bright color, bold text, possibly animated).

**Why This Matters**: CTAs are revenue-critical; they must be obvious.

---

## Summary

| Category | Count |
|----------|-------|
| Error Messages | 3 |
| Navigation / State | 3 |
| Information Architecture | 3 |
| Clarity / Feedback | 2 |
| API Design | 1 |
| Visual Hierarchy | 1 |

## Priority

### Fix Now (Blocking Users)
1. **Generic "Internal server error" hides actual problems** — Users can't recover from errors
2. **Free tier daily limit has no reset time display** — Users don't know when they can decode again
3. **Account deletion doesn't handle API failure** — Partial failure leaves user in inconsistent state

### Fix Soon (Substantial Friction)
4. Sonnet limit message doesn't explain fallback option
5. 5-second silent wait for source map resolution with no feedback
6. Sensitive data warning styling doesn't match message tone
7. Batch decode doesn't include timestamps/context
8. Error response structure inconsistency in API

### Backlog (Polish)
9. Decode Another button doesn't fully reset state
10. Element Inspector interaction model is unclear (two-step)
11. Sonnet usage confirmation missing
12. Auth tab switching clears errors silently
13. Checkout success page lacks next steps
14. Upgrade link visibility

## What's Working Well

- **Right-click context menu UX** — "Decode this error" is frictionless discovery
- **Tech stack auto-detection badge** — Users immediately see framework support
- **Sensitive data detection is comprehensive** — Regex patterns cover real-world secrets (AWS keys, JWT, connection strings)
- **Panel resize handle is polished** — Visual feedback (grip changes on hover), smooth animations, saved width preference
- **Markdown rendering in results** — Copy buttons on code blocks, proper formatting
- **Storage sync across tabs** — Extension updates in real-time when user plan changes in options page
- **Modal accessibility** — ESC key cancels, overlay click cancels, focus management
- **Skeleton loading states** — Shows while AI is processing, sets expectations
- **Free vs Pro distinction** — Landing page clearly communicates what each tier includes

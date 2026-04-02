# Redundancy Analysis Report

**Analyzed**: 2026-04-02  
**Scope**: Error Decoder Extension + API (packages/api/src, packages/extension/src, scripts, shared)  
**Duplication Patterns Found**: 8  
**Lines That Could Be Consolidated**: ~200+

---

## CRITICAL — Identical Validation Error Handling Pattern

**Instances**: 3 occurrences  
**Locations**:
- `packages/api/src/routes/decode.ts:26-30`
- `packages/api/src/routes/checkout.ts:15-22`
- `packages/api/src/routes/feedback.ts:14-21`

**Current State**:
```typescript
// All three routes do this identically:
const parsed = v.safeParse(schemaHere, rawBody);
if (!parsed.success) {
  const message = parsed.issues[0]?.message ?? "Invalid input";
  return c.json({ error: { message, code: errorCodes.validationError } }, 400);
}
```

**Proposed Solution**: Extract to a reusable middleware or utility function in `packages/api/src/lib/validation.ts`. Create a generic validation handler that wraps Valibot parsing.

**Implementation**:
```typescript
// packages/api/src/lib/validation.ts
export const parseRequest = async <T>(
  c: Context,
  schema: v.BaseSchema<T>
): Promise<{ success: true; data: T } | { success: false; response: Response }> => {
  const rawBody = await c.req.json();
  const parsed = v.safeParse(schema, rawBody);
  
  if (!parsed.success) {
    const message = parsed.issues[0]?.message ?? "Invalid input";
    return {
      success: false,
      response: c.json(
        { error: { message, code: errorCodes.validationError } },
        400
      ),
    };
  }
  
  return { success: true, data: parsed.output };
};

// Usage in routes:
const { success, data, response } = await parseRequest(c, decodeRequestSchema);
if (!success) return response;
const { errorText, model } = data;
```

**Benefits**: Single source of truth for validation errors, consistent error messages across all endpoints, easier to add validation logging/metrics

---

## HIGH — Identical Sonnet Usage Tracking Logic

**Instances**: 2 occurrences  
**Locations**:
- `packages/api/src/routes/decode.ts:49-65` (usage check)
- `packages/api/src/routes/usage.ts:26-30` (usage calculation)

**Current State**:
```typescript
// In decode.ts:
const currentMonth = new Date().toISOString().slice(0, 7);
const { data: userRow } = await supabase
  .from("users")
  .select("sonnet_uses_this_month, sonnet_month")
  .eq("id", user.id)
  .single();

const sonnetUsed = userRow?.sonnet_month === currentMonth
  ? (userRow?.sonnet_uses_this_month ?? 0) : 0;

if (sonnetUsed >= 20) {
  return c.json({ error: { message: "Monthly Sonnet limit reached (20/month).", code: errorCodes.sonnetLimitReached } }, 429);
}

// Later in same file:
if (useModel === "sonnet") {
  const currentMonth = new Date().toISOString().slice(0, 7);
  supabase.rpc("increment_sonnet_usage", { p_user_id: user.id, p_month: currentMonth }).then(() => {});
}

// In usage.ts (same logic):
const currentMonth = new Date().toISOString().slice(0, 7);
const sonnetUsed = userRow?.sonnet_month === currentMonth
  ? (userRow?.sonnet_uses_this_month ?? 0) : 0;
```

**Proposed Solution**: Extract Sonnet usage helpers to `packages/api/src/lib/sonnet-usage.ts`

**Implementation**:
```typescript
// packages/api/src/lib/sonnet-usage.ts
export const getCurrentMonth = (): string =>
  new Date().toISOString().slice(0, 7);

export const getSonnetUsageThisMonth = async (
  userId: string
): Promise<{ used: number; limit: number; canUse: boolean }> => {
  const currentMonth = getCurrentMonth();
  const { data: userRow, error } = await supabase
    .from("users")
    .select("sonnet_uses_this_month, sonnet_month")
    .eq("id", userId)
    .single();

  const used = userRow?.sonnet_month === currentMonth
    ? (userRow?.sonnet_uses_this_month ?? 0)
    : 0;

  return {
    used,
    limit: 20,
    canUse: used < 20,
  };
};

export const incrementSonnetUsage = (userId: string): Promise<void> =>
  supabase
    .rpc("increment_sonnet_usage", { p_user_id: userId, p_month: getCurrentMonth() })
    .then(() => {});
```

**Benefits**: DRY month calculation, centralized Sonnet limit (20/month is magic number, now a constant), easier to adjust limits or add logging

---

## HIGH — Auth/Plan Display HTML Pattern (Sidebar vs Popup)

**Instances**: 4 code blocks (similar structure, different locations)  
**Locations**:
- `packages/extension/src/sidepanel/index.ts:423-437` (decode not signed in)
- `packages/extension/src/sidepanel/index.ts:661-678` (inspect not signed in)
- `packages/extension/src/sidepanel/index.ts:474-488` (401 auth error)
- `packages/extension/src/popup/index.ts:54-68` (popup decode flow)

**Current State**:
All four blocks render nearly identical "Sign up" prompts with slight text variations:
```typescript
decodeResult.innerHTML = `
  <div class="auth-prompt">
    <p>Sign up to start decoding errors</p>
    <p class="auth-sub">Free account — 3 decodes per day</p>
    <button class="btn btn-primary auth-signup-btn">Sign Up Free</button>
    <p class="auth-fallback">Already have a key? <a href="#" class="auth-settings-link">Paste it in Settings</a></p>
  </div>`;
// Then identical event listeners attached
```

**Proposed Solution**: Extract to reusable component factory in `packages/extension/src/shared/auth-ui.ts`

**Implementation**:
```typescript
// packages/extension/src/shared/auth-ui.ts
export type AuthPromptType = "decode" | "inspect" | "error";

export const createAuthPrompt = (type: AuthPromptType = "decode"): HTMLElement => {
  const container = document.createElement("div");
  
  const messages = {
    decode: { primary: "Sign up to start decoding errors", sub: "Free account — 3 decodes per day" },
    inspect: { primary: "Sign up to ask about elements", sub: "Free account — 3 decodes per day" },
    error: { primary: "Your API key is invalid or expired.", sub: "Sign in again or paste a new key in Settings." },
  };
  
  const msg = messages[type];
  container.innerHTML = `
    <div class="auth-prompt">
      <p>${msg.primary}</p>
      <p class="auth-sub">${msg.sub}</p>
      <button class="btn btn-primary auth-signup-btn">${type === "error" ? "Sign In" : "Sign Up Free"}</button>
      <p class="auth-fallback">Already have a key? <a href="#" class="auth-settings-link">${type === "error" ? "Open Settings" : "Paste it in Settings"}</a></p>
    </div>`;
  
  const signupBtn = container.querySelector(".auth-signup-btn")!;
  const settingsLink = container.querySelector(".auth-settings-link")!;
  
  signupBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: AUTH_URL });
  });
  
  settingsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  
  return container;
};

// Usage:
decodeResult.appendChild(createAuthPrompt("decode"));
```

**Benefits**: Single place to update auth messaging, consistent event handling, ~40 lines reduced

---

## HIGH — Stripe Webhook ID Extraction Pattern

**Instances**: 2 occurrences (nearly identical)  
**Locations**:
- `packages/api/src/routes/webhook-stripe.ts:35-40` (checkout.session.completed)
- `packages/api/src/routes/webhook-stripe.ts:64-66` (customer.subscription.deleted)
- `packages/api/src/routes/webhook-stripe.ts:89-91` (customer.subscription.updated)
- `packages/api/src/routes/webhook-stripe.ts:110-112` (invoice.payment_failed)

**Current State**:
```typescript
// Repeated 4+ times:
const customerId = typeof subscription.customer === "string"
  ? subscription.customer
  : subscription.customer?.id;

// Same pattern for subscriptionId:
const subscriptionId = typeof session.subscription === "string"
  ? session.subscription
  : session.subscription?.id;
```

**Proposed Solution**: Extract to `packages/api/src/lib/stripe-types.ts`

**Implementation**:
```typescript
// packages/api/src/lib/stripe-types.ts
export const extractId = <T extends { id?: string }>(
  idOrObj: string | T | null | undefined
): string | undefined => {
  if (typeof idOrObj === "string") return idOrObj;
  if (idOrObj && typeof idOrObj === "object") return idOrObj.id;
  return undefined;
};

// Usage (cleaner):
const customerId = extractId(subscription.customer);
const subscriptionId = extractId(session.subscription);
```

**Benefits**: Handles type narrowing consistently, reduces Stripe API confusion, easier to test

---

## MEDIUM — Duplicate Sonnet Remaining Display Logic

**Instances**: 2 occurrences  
**Locations**:
- `packages/extension/src/sidepanel/index.ts:356-360` (loadUserPlan)
- `packages/extension/src/sidepanel/index.ts:356-360` (in same function)

**Current State**:
```typescript
// Calculates sonnet remaining twice in succession
if (plan === "pro") {
  sonnetBtn.classList.remove("hidden");
  const remaining = sonnetLimit - sonnetUsed;
  sonnetRemaining.textContent = `(${remaining} left)`;
}
```

Actually upon closer inspection, this is only once. Let me check for other patterns...

---

## MEDIUM — Device Type Detection (String Literals)

**Instances**: 2 locations (should be constants)  
**Locations**:
- `packages/extension/src/content/relay.ts:8` - hardcoded `"errordecoder-error"` event name
- `packages/extension/src/content/panel.ts:177` - hardcoded `"ERRORDECODER_CLOSE"` message type
- `packages/extension/src/background/index.ts:75, 89, 188` - hardcoded `errors_tab_` prefix
- `packages/extension/src/background/index.ts:89` - hardcoded `tech_tab_` prefix

**Current State**:
Strings repeated across files without centralization:
```typescript
// relay.ts
document.addEventListener("errordecoder-error", ...)

// panel.ts
if (event.data?.type === "ERRORDECODER_CLOSE") { ... }

// background/index.ts
chrome.storage.session.set({ [`errors_tab_${tabId}`]: errors });
chrome.storage.session.set({ [`tech_tab_${sender.tab.id}`]: message.tech });
```

**Proposed Solution**: Create `packages/extension/src/shared/constants.ts`

**Implementation**:
```typescript
// packages/extension/src/shared/constants.ts
export const EVENTS = {
  ERROR_CAPTURED: "errordecoder-error",
  CLOSE_PANEL: "ERRORDECODER_CLOSE",
} as const;

export const STORAGE_KEYS = {
  errorsByTab: (tabId: number) => `errors_tab_${tabId}`,
  techByTab: (tabId: number) => `tech_tab_${tabId}`,
  apiKey: "apiKey",
  userEmail: "userEmail",
  userPlan: "userPlan",
  panelWidth: "errordecoder-panel-width",
} as const;

// Usage:
document.addEventListener(EVENTS.ERROR_CAPTURED, ...);
chrome.storage.session.set({ [STORAGE_KEYS.errorsByTab(tabId)]: errors });
```

**Benefits**: Single source of truth for magic strings, easier to refactor key names, type-safe access

---

## MEDIUM — Error Handling Pattern in Sidepanel

**Instances**: 3 occurrences  
**Locations**:
- `packages/extension/src/sidepanel/index.ts:464-504` (fetch decode response)
- `packages/extension/src/sidepanel/index.ts:681-696` (fetch inspect response)
- `packages/extension/src/popup/index.ts:54-69` (fetch decode response)

**Current State**:
```typescript
// All three do nearly identical fetch + error handling:
try {
  const response = await fetch(`${API_BASE}/...`, {...});
  const json = await response.json();
  
  if (json.error) {
    // Different handling based on error code
    if (response.status === 401) { ... }
    if (json.upgradeUrl) { ... }
    else { errorMsg }
    return;
  }
  
  // Success path
  renderMarkdown(json.data.markdown, container);
} catch {
  container.innerHTML = `<p class="error-msg">Failed to connect to API.</p>`;
} finally {
  setDecoding(false);
}
```

**Proposed Solution**: Extract to `packages/extension/src/shared/api-helpers.ts`

**Implementation**:
```typescript
// packages/extension/src/shared/api-helpers.ts
export const fetchDecode = async (
  errorText: string,
  model: "haiku" | "sonnet",
  apiKey: string
): Promise<{ success: boolean; markdown?: string; error?: string; upgradeUrl?: string }> => {
  try {
    const response = await fetch(`${API_BASE}/decode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ errorText, model }),
    });

    const json = await response.json();
    if (json.error) {
      return { success: false, error: json.error.message, upgradeUrl: json.upgradeUrl };
    }
    return { success: true, markdown: json.data.markdown };
  } catch {
    return { success: false, error: "Failed to connect to API." };
  }
};
```

**Benefits**: Removes 30+ lines of duplicated fetch logic, centralized error handling, easier to add logging/retry logic

---

## MEDIUM — Validation Schema Exports

**Instances**: 3 separate schema files  
**Locations**:
- `packages/api/src/schemas/decode.ts`
- `packages/api/src/schemas/feedback.ts`
- `packages/api/src/schemas/checkout.ts`

**Current State**: Each schema file follows the same pattern:
```typescript
// decode.ts
export const decodeRequestSchema = v.object({ ... });
export type ValidatedDecodeRequest = v.InferInput<typeof decodeRequestSchema>;

// feedback.ts
export const feedbackRequestSchema = v.object({ ... });
export type ValidatedFeedbackRequest = v.InferInput<typeof feedbackRequestSchema>;

// Same pattern repeats...
```

**Proposed Solution**: This is _acceptable as-is_ since each schema is logically separate. However, if you add 3+ more schemas, consider a `schemas/index.ts` barrel export for cleaner imports. Currently fine.

**Status**: Not flagging as critical redundancy — each schema is distinct and benefit from being in separate files. Consolidation would hurt readability.

---

## LOW — HTML Escape Utility

**Instances**: 1 usage  
**Locations**:
- `packages/extension/src/shared/html.ts:1-2` (definition)
- `packages/extension/src/sidepanel/index.ts:5` (import)
- `packages/extension/src/sidepanel/index.ts:179, 493` (usage)

**Current State**: Defined once, used in sidepanel. Good pattern — no redundancy.

---

## LOW — Resizable Grip Setup (Minor Refactor Opportunity)

**Instances**: 3 similar calls  
**Locations**:
- `packages/extension/src/sidepanel/index.ts:15-17` (decode textarea)
- `packages/extension/src/sidepanel/index.ts:19-21` (inspect textarea)
- `packages/extension/src/sidepanel/index.ts:23-25` (element info)

**Current State**:
```typescript
const decodeGrip = document.getElementById("textarea-grip");
const decodeTextarea = document.getElementById("decode-input") as HTMLTextAreaElement | null;
if (decodeGrip && decodeTextarea) setupResizableGrip(decodeTextarea, decodeGrip);

const inspectGrip = document.getElementById("inspect-question-grip");
const inspectTextarea = document.getElementById("inspect-question") as HTMLTextAreaElement | null;
if (inspectGrip && inspectTextarea) setupResizableGrip(inspectTextarea, inspectGrip, 32);

// Repeated setup pattern...
```

**Proposed Solution**: Extract to `packages/extension/src/shared/setup-grips.ts` — but this is _low priority_ since the pattern is clear and only 3 instances.

**Implementation** (optional):
```typescript
export const setupResizableGrips = (specs: Array<{ elementId: string; gripId: string; minHeight?: number }>) => {
  for (const { elementId, gripId, minHeight } of specs) {
    const grip = document.getElementById(gripId);
    const element = document.getElementById(elementId) as HTMLTextAreaElement | null;
    if (grip && element) setupResizableGrip(element, grip, minHeight);
  }
};

// Usage:
setupResizableGrips([
  { elementId: "decode-input", gripId: "textarea-grip" },
  { elementId: "inspect-question", gripId: "inspect-question-grip", minHeight: 32 },
  { elementId: "element-info", gripId: "element-info-grip", minHeight: 60 },
]);
```

**Benefits**: Cleaner init code, but impact is minimal (4 lines saved). Defer unless code grows.

---

## LOW — Duplicate Tech Stack Caching Logic

**Instances**: 2 locations  
**Locations**:
- `packages/extension/src/content/tech-detect.ts:12-16` (cache setup)
- `packages/extension/src/sidepanel/index.ts:277-282` (loading from storage)

**Current State**:
```typescript
// tech-detect.ts: caches in memory
let cachedTech: DetectedTech[] | null = null;
window.addEventListener("popstate", () => { cachedTech = null; });
window.addEventListener("hashchange", () => { cachedTech = null; });

// sidepanel: loads from session storage
const loadTechStack = async () => {
  if (!currentTabId) return;
  const key = `tech_tab_${currentTabId}`;
  const result = await chrome.storage.session.get(key);
  const tech = result[key];
  if (tech?.length) renderTechBar(tech);
};
```

**Analysis**: These are _intentionally different_ — one is in-memory cache within content script, the other loads from extension storage. Not redundant, they serve different purposes. No consolidation needed.

---

## Priority

### Phase 1: Critical (exact duplicates, fix now)

1. **Validation Error Handling** (decode.ts, checkout.ts, feedback.ts) — Extract to `lib/validation.ts`
   - Time: 30 min
   - Lines saved: ~20
   - Risk: Low (well-tested pattern)

### Phase 2: High (near-identical, consolidate soon)

2. **Sonnet Usage Tracking** (decode.ts + usage.ts) — Extract to `lib/sonnet-usage.ts`
   - Time: 20 min
   - Lines saved: ~15
   - Risk: Low

3. **Auth Prompt HTML** (4 blocks in sidepanel.ts + popup.ts) — Extract to `shared/auth-ui.ts`
   - Time: 25 min
   - Lines saved: ~40
   - Risk: Low

4. **Stripe Webhook ID Extraction** (webhook-stripe.ts) — Extract to `lib/stripe-types.ts`
   - Time: 15 min
   - Lines saved: ~10
   - Risk: Low

### Phase 3: Medium (similar structure, consider consolidating)

5. **Fetch + Error Handling** (sidepanel.ts + popup.ts) — Extract to `shared/api-helpers.ts`
   - Time: 30 min
   - Lines saved: ~30
   - Risk: Medium (ensure error handling is consistent)

6. **Magic String Constants** (spread across extension files) — Create `shared/constants.ts`
   - Time: 15 min
   - Lines saved: ~5 (improves maintainability more than lines)
   - Risk: Low

---

## What's Already DRY

- **Schema definitions** (`schemas/` directory) — each schema is appropriately isolated
- **Shared utilities** (`shared/`) — api.ts, storage.ts, modal.ts are all well-factored
- **Tech detection** — complex logic properly contained in `tech-detect.ts`
- **Middleware** — auth, rate limit properly abstracted in `lib/middleware.ts`
- **Background logic** — error buffering/flushing well-structured in `background/index.ts`

---

## Recommended Action

1. Start with **Phase 1 (Critical)** — validation extraction is fastest ROI
2. Move to **Phase 2 (High)** — auth UI consolidation saves most duplicated code
3. **Phase 3 (Medium)** can wait until next refactor cycle

All Phase 1 & 2 changes are low-risk and improve code maintenance significantly.

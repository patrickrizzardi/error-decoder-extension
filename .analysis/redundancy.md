# Redundancy Analysis Report

**Analyzed**: 2025-04-02  
**Scope**: Complete codebase (API, Extension, Web packages)  
**Duplication Patterns Found**: 7  
**Lines That Could Be Consolidated**: ~150

---

## CRITICAL — Validation Error Response Pattern

**Instances**: 3 occurrences  
**Locations**:

- `packages/api/src/routes/decode.ts:30-34`
- `packages/api/src/routes/checkout.ts:15-21`
- `packages/api/src/routes/feedback.ts:14-20`

**Current State**:
```typescript
// decode.ts
const parsed = v.safeParse(decodeRequestSchema, rawBody);
if (!parsed.success) {
  const message = parsed.issues[0]?.message ?? "Invalid input";
  return c.json({ error: { message, code: errorCodes.validationError } }, 400);
}

// checkout.ts (identical pattern)
const parsed = v.safeParse(checkoutRequestSchema, rawBody);
if (!parsed.success) {
  const message = parsed.issues[0]?.message ?? "Invalid input";
  return c.json({ error: { message, code: errorCodes.validationError } }, 400);
}

// feedback.ts (identical pattern)
const parsed = v.safeParse(feedbackRequestSchema, rawBody);
if (!parsed.success) {
  const message = parsed.issues[0]?.message ?? "Invalid input";
  return c.json(
    { error: { message, code: errorCodes.validationError } },
    400
  );
}
```

**Proposed Solution**: Extract a reusable middleware or handler function that takes a schema and returns a validated result or early-exits with the error response.

**Implementation**:
```typescript
// lib/validation.ts
import type { Context } from "hono";
import * as v from "valibot";
import { errorCodes } from "@shared/types";

export const validateRequest = async <T>(
  c: Context,
  schema: v.BaseSchema,
  rawBody: unknown
): Promise<T | null> => {
  const parsed = v.safeParse(schema, rawBody);
  if (!parsed.success) {
    const message = parsed.issues[0]?.message ?? "Invalid input";
    c.json({ error: { message, code: errorCodes.validationError } }, 400);
    return null;
  }
  return parsed.output as T;
};

// Usage in routes:
const body = await validateRequest(c, decodeRequestSchema, rawBody);
if (!body) return;  // validateRequest already sent error response
const { errorText, model, mode } = body;
```

**Benefits**: Single source of truth for validation error responses; reduces boilerplate by 18 lines; easier to maintain consistent error messaging across routes

---

## HIGH — Current Month Calculation Duplication

**Instances**: 3 occurrences  
**Locations**:

- `packages/api/src/routes/decode.ts:54` and `108` (2x in same file)
- `packages/api/src/routes/usage.ts:18`

**Current State**:
```typescript
// decode.ts line 54
const currentMonth = new Date().toISOString().slice(0, 7);
const sonnetUsed = user.sonnetMonth === currentMonth
  ? (user.sonnetUsesThisMonth ?? 0) : 0;

// decode.ts line 108 (again in same route)
const currentMonth = new Date().toISOString().slice(0, 7);
supabase.rpc("increment_sonnet_usage", { p_user_id: user.id, p_month: currentMonth });

// usage.ts line 18
const currentMonth = new Date().toISOString().slice(0, 7);
const sonnetUsed = userRow?.sonnet_month === currentMonth
  ? (userRow?.sonnet_uses_this_month ?? 0) : 0;
```

**Proposed Solution**: Create a utility function in `lib/` for date operations; also opportunity to reduce duplication in decode.ts itself (line 54 and 108 could use one calculation).

**Implementation**:
```typescript
// lib/dates.ts
export const getCurrentMonth = (): string =>
  new Date().toISOString().slice(0, 7);

// Usage:
import { getCurrentMonth } from "../lib/dates";

// In decode.ts
const currentMonth = getCurrentMonth();
const sonnetUsed = user.sonnetMonth === currentMonth
  ? (user.sonnetUsesThisMonth ?? 0) : 0;

if (useModel === "sonnet") {
  supabase.rpc("increment_sonnet_usage", { 
    p_user_id: user.id, 
    p_month: currentMonth  // reuse same value
  });
}
```

**Benefits**: Eliminates repeated date calculation logic; single point of change if format ever needs to update; reduces lines by 6

---

## HIGH — Markdown Rendering + Code Block Enhancement

**Instances**: 2 occurrences  
**Locations**:

- `packages/extension/src/popup/index.ts:23-39`
- `packages/extension/src/sidepanel/index.ts:1006-1023`

**Current State**:
```typescript
// popup/index.ts
const renderResult = (result: { markdown: string }) => {
  const resultContent = document.getElementById("result-content")!;
  resultContent.innerHTML = DOMPurify.sanitize(marked.parse(result.markdown) as string);

  resultContent.querySelectorAll("pre").forEach((pre) => {
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => copyToClipboard(btn, () => pre.textContent || ""));
    wrapper.appendChild(btn);
  });

  showState("result");
};

// sidepanel/index.ts
const renderMarkdown = (markdown: string, container: HTMLElement) => {
  container.innerHTML = DOMPurify.sanitize(marked.parse(markdown) as string);

  container.querySelectorAll("pre").forEach((pre) => {
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => copyToClipboard(btn, () => pre.textContent || ""));
    wrapper.appendChild(btn);
  });
};
```

**Proposed Solution**: Extract a reusable `renderMarkdownWithCopyButtons` utility that both popup and sidepanel can use.

**Implementation**:
```typescript
// shared/markdown.ts
import { marked } from "marked";
import DOMPurify from "dompurify";
import { copyToClipboard } from "./ui";

export const renderMarkdownWithCopyButtons = (
  markdown: string,
  container: HTMLElement
): void => {
  container.innerHTML = DOMPurify.sanitize(marked.parse(markdown) as string);

  container.querySelectorAll("pre").forEach((pre) => {
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => 
      copyToClipboard(btn, () => pre.textContent || "")
    );
    wrapper.appendChild(btn);
  });
};

// Usage in popup/index.ts:
import { renderMarkdownWithCopyButtons } from "../shared/markdown";

// Replace renderResult:
const renderResult = (result: { markdown: string }) => {
  const resultContent = document.getElementById("result-content")!;
  renderMarkdownWithCopyButtons(result.markdown, resultContent);
  showState("result");
};

// Usage in sidepanel/index.ts:
renderMarkdownWithCopyButtons(markdown, container);
```

**Benefits**: Eliminates 28 lines of duplication; shared behavior is harder to get wrong; both UI surfaces now evolve together if changes needed to code block rendering

---

## HIGH — Supabase Fire-and-Forget RPC Calls with `.then(() => {})`

**Instances**: 2 occurrences  
**Locations**:

- `packages/api/src/routes/decode.ts:109`
- `packages/api/src/routes/decode.ts:117`

**Current State**:
```typescript
// Increment Sonnet counter
if (useModel === "sonnet") {
  const currentMonth = new Date().toISOString().slice(0, 7);
  supabase.rpc("increment_sonnet_usage", { p_user_id: user.id, p_month: currentMonth }).then(() => {});
}

// Increment daily usage only on success (free users)
if (user.plan === "free" && !user.isAdmin) {
  supabase.rpc("increment_daily_usage", { p_user_id: user.id }).then(() => {});
}
```

**Proposed Solution**: Create a utility wrapper that explicitly communicates "fire-and-forget, errors silently ignored" intent and reduces boilerplate.

**Implementation**:
```typescript
// lib/supabase.ts (add to existing file)
export const fireAndForget = async (
  promise: Promise<any>,
  context: string = "background operation"
): Promise<void> => {
  return promise
    .catch((err) => {
      // Log silently for debugging, but don't throw
      console.warn(`[FireAndForget] ${context} failed:`, err);
    });
};

// Usage in decode.ts:
import { fireAndForget } from "../lib/supabase";

if (useModel === "sonnet") {
  const currentMonth = new Date().toISOString().slice(0, 7);
  fireAndForget(
    supabase.rpc("increment_sonnet_usage", { p_user_id: user.id, p_month: currentMonth }),
    "increment sonnet usage"
  );
}

if (user.plan === "free" && !user.isAdmin) {
  fireAndForget(
    supabase.rpc("increment_daily_usage", { p_user_id: user.id }),
    "increment daily usage"
  );
}
```

**Benefits**: Clearer intent (fire-and-forget is explicit); optional error logging for debugging; easier to audit which operations are non-critical; reduces noise by 4 lines

---

## MEDIUM — Console Error Logging Pattern (Inconsistent)

**Instances**: 6 occurrences with variations  
**Locations**:

- `packages/api/src/routes/decode.ts:123` — uses template string with prefix
- `packages/api/src/routes/feedback.ts:32` — uses array format
- `packages/api/src/routes/account.ts:25,36,49` — multiple styles
- `packages/api/src/routes/webhook-stripe.ts:23,50,76` — webhook-specific
- `packages/api/src/lib/middleware.ts:90` — middleware style

**Current State**:
```typescript
// decode.ts — template string
console.error(`[Decode] Error: ${message}`);

// feedback.ts — array (inconsistent)
console.error("[Feedback] Update failed:", error.message);

// account.ts — catch block with plain err
console.error("[Account] Stripe cancel failed:", err);

// webhook-stripe.ts — mixed styles
console.error(`[Stripe Webhook] Signature verification failed: ${message}`);
console.error(`[Stripe Webhook] Failed to upgrade user ${userId}:`, error.message);
```

**Proposed Solution**: Create a standardized logging utility that enforces prefix + context pattern across all handlers.

**Implementation**:
```typescript
// lib/logger.ts
export const createLogger = (context: string) => ({
  error: (msg: string, err?: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[${context}] ${msg}${errMsg ? `: ${errMsg}` : ""}`);
  },
  warn: (msg: string) => console.warn(`[${context}] ${msg}`),
  info: (msg: string) => console.log(`[${context}] ${msg}`),
});

// Usage:
import { createLogger } from "../lib/logger";

// In decode.ts:
const log = createLogger("Decode");
log.error("Error", err);

// In feedback.ts:
const log = createLogger("Feedback");
log.error("Update failed", error);
```

**Benefits**: Consistent formatting across all logs; easier to grep logs by context; reduces repetition of `[Context]` prefix; centralizes log format if it needs to change

---

## MEDIUM — Status Message Update Pattern (with timeout)

**Instances**: 2 occurrences  
**Locations**:

- `packages/extension/src/options/index.ts:44-73` (full flow with color state management)
- Similar pattern spread across options page

**Current State**:
```typescript
// options/index.ts
statusEl.textContent = "Validating key...";
statusEl.style.color = "var(--accent)";

// ... later ...

if ("data" in res) {
  statusEl.textContent = "Saved!";
  statusEl.style.color = "var(--accent)";
  // ...
} else {
  await storage.remove("apiKey");
  statusEl.textContent = "Invalid API key. Check and try again.";
  statusEl.style.color = "var(--error, #f44747)";
}

// ...

setTimeout(() => {
  statusEl.textContent = "";
}, 4000);
```

**Proposed Solution**: Create a UI helper that centralizes status message display with auto-clear timeout and color management.

**Implementation**:
```typescript
// shared/ui.ts (add to existing file)
export const showTemporaryMessage = (
  element: HTMLElement,
  message: string,
  options: {
    color?: string;  // CSS var or hex
    durationMs?: number;
  } = {}
): Promise<void> => {
  const { color = "var(--text)", durationMs = 4000 } = options;
  element.textContent = message;
  element.style.color = color;

  return new Promise((resolve) => {
    setTimeout(() => {
      element.textContent = "";
      element.style.color = "";
      resolve();
    }, durationMs);
  });
};

// Usage in options/index.ts:
import { showTemporaryMessage } from "../shared/ui";

await showTemporaryMessage(statusEl, "Validating key...", {
  color: "var(--accent)",
});

// After validation...
if ("data" in res) {
  await showTemporaryMessage(statusEl, "Saved!", {
    color: "var(--accent)",
  });
} else {
  await showTemporaryMessage(statusEl, "Invalid API key. Check and try again.", {
    color: "var(--error, #f44747)",
  });
}
```

**Benefits**: Reduces state management complexity; eliminates manual setTimeout boilerplate; color logic centralized; supports async/await flow naturally; 15 lines consolidated

---

## LOW — Repeated Tab Visibility Toggling (Minor Pattern)

**Instances**: 2 occurrences  
**Locations**:

- `packages/extension/src/popup/index.ts:16-21` (showState function)
- `packages/extension/src/sidepanel/index.ts:65-72` (switchTab function, slightly different)

**Current State**:
```typescript
// popup/index.ts
const showState = (state: "paste" | "loading" | "result" | "error") => {
  pasteMode.classList.toggle("hidden", state !== "paste");
  loadingState.classList.toggle("hidden", state !== "loading");
  resultState.classList.toggle("hidden", state !== "result");
  errorState.classList.toggle("hidden", state !== "error");
};

// sidepanel/index.ts
const switchTab = (tabName: string) => {
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));
  tabContents.forEach((c) => c.classList.toggle("active", c.id === `tab-${tabName}`));
};
```

**Proposed Solution**: Create a generic visibility/active-state toggling utility (patterns are fundamentally the same — toggle a class based on a condition).

**Implementation**:
```typescript
// shared/ui.ts (add)
export const toggleStateElements = <T extends string>(
  elements: Map<T, HTMLElement>,
  activeState: T
): void => {
  elements.forEach((el, state) => {
    el.classList.toggle("hidden", state !== activeState);
  });
};

// Or for attribute-based variants:
export const toggleActiveState = (
  elements: NodeListOf<Element> | HTMLElement[],
  matchFn: (el: Element) => boolean,
  activeClass: string = "active"
): void => {
  Array.from(elements).forEach((el) => {
    el.classList.toggle(activeClass, matchFn(el));
  });
};

// Usage in popup/index.ts:
const states = new Map<"paste" | "loading" | "result" | "error", HTMLElement>([
  ["paste", pasteMode],
  ["loading", loadingState],
  ["result", resultState],
  ["error", errorState],
]);

const showState = (state: "paste" | "loading" | "result" | "error") => {
  toggleStateElements(states, state);
};

// Usage in sidepanel/index.ts:
const switchTab = (tabName: string) => {
  toggleActiveState(tabs, (t) => (t as HTMLElement).dataset.tab === tabName, "active");
  toggleActiveState(tabContents, (c) => c.id === `tab-${tabName}`, "active");
};
```

**Benefits**: Generic utility applicable to any state-toggling scenario; reduces visual state management boilerplate; patterns are now discoverable and reusable

---

## What's Already DRY

- **API schemas** (`schemas/feedback.ts`, `schemas/checkout.ts`): Properly separated, minimal, not duplicated
- **Middleware layering** (`lib/middleware.ts`): `authMiddleware` and `rateLimitMiddleware` are well-factored; each has a single responsibility
- **Supabase initialization** (`lib/supabase.ts`): Clean singleton pattern, no duplication
- **Cache utilities** (`lib/cache.ts`): Well-encapsulated hash/normalize/cacheable logic; good separation of concerns
- **Anthropic SDK setup** (`lib/anthropic.ts`): Minimal, DRY initialization
- **HTML escaping** (`shared/html.ts`): Single utility, appropriately used
- **Storage wrapper** (`shared/storage.ts`): Generic typed wrapper with no duplication
- **Chrome message dispatch** (`content/index.ts`, `relay.ts`): Message types are distinct per context; no unnecessary overlap

---

## Priority

### Phase 1: Critical (exact duplicates, fix now)

1. **Validation Error Response Pattern** — 3 identical code blocks across routes; consolidates to reusable middleware
2. **Markdown + Code Block Rendering** — 2 identical blocks with UI behavior; highest ROI (28 lines consolidated, shared UI logic)

### Phase 2: High (near-identical, consolidate soon)

3. **Current Month Calculation** — 3 instances of `new Date().toISOString().slice(0, 7)`, with 2 in same file (quick win)
4. **Fire-and-Forget RPC Pattern** — `.then(() => {})` boilerplate; clearer intent when extracted

### Phase 3: Medium (similar structure, consider consolidating)

5. **Console Error Logging** — 6 instances with style variations; improves consistency and debuggability
6. **Status Message Updates** — 2 occurrences with timeout/color logic; reduces state management complexity

### Phase 3.5: Low (patterns exist but fewer instances)

7. **Tab Visibility Toggling** — 2 variants of the same pattern; generic utility is reusable but impact is minimal

# Code Cleanup Report

**Analyzed**: 2025-04-02  
**Scope**: Full codebase (packages/api/src/, packages/extension/src/, packages/web/src/)  
**Dead Code Found**: 2 instances

---

## Findings by Category

### Unused Exports (2 found)

#### 1. Unused Type Export
- **File**: `packages/api/src/schemas/feedback.ts:8`
- **Finding**: `ValidatedFeedbackRequest` type exported but never imported or used anywhere
- **Evidence**: 
  - Definition: `export type ValidatedFeedbackRequest = v.InferInput<typeof feedbackRequestSchema>;`
  - Grep search across entire codebase finds 0 usages in source files (only in previous .analysis/ reports)
  - The schema itself (`feedbackRequestSchema`) IS used in `packages/api/src/routes/feedback.ts`, but the type wrapper is not
- **Severity**: Low — Dead type export, no runtime impact but pollutes the public API
- **Action**: Remove line 8 entirely. The type is not needed; only the schema is used for validation.

#### 2. Unused Supabase Client
- **File**: `packages/api/src/lib/supabase.ts:21-23`
- **Finding**: `supabasePublic` exported const created but never imported by any route or service
- **Evidence**:
  - Definition: `export const supabasePublic = supabasePublishableKey ? createClient(supabaseUrl, supabasePublishableKey) : null;`
  - Comment indicates intent: "Public client — respects RLS. For verifying user JWTs."
  - Grep search finds 0 usages in source code (only in documentation)
  - All routes use the main `supabase` service-role client (e.g., lines 2-3 in decode.ts, auth.ts, etc.)
- **Severity**: Medium — Unused export, wasted compute at startup (creates Supabase client even if never used)
- **Action**: Either:
  - Remove lines 21-23 if RLS-based JWT verification is not currently needed
  - Or keep as-is if planning JWT verification in future (mark with TODO comment if so)

---

## Analysis Details

### Search Methodology

1. **Scanned all TypeScript source files** (65 .ts files across 3 packages)
2. **Excluded**:
   - Auto-generated .d.ts declaration files (packages/api/dist/)
   - Legitimate comments (docstrings, implementation notes)
   - Underscore-prefixed variables (intentionally unused)
   - Parameters required by interface signatures (e.g., error handlers)
   - Side-effect imports
   - Dynamic/string-referenced code
3. **Verified all**:
   - Route handlers mounted in index.ts (9 routes, all mounted)
   - Middleware usage (authMiddleware, rateLimitMiddleware both used)
   - Utility functions (cacheUtils methods all used, api object methods all used)
   - Shared components (all setupResizableGrip, copyToClipboard, showConfirmModal, storage, sensitive-check functions are used)
   - Tech detection and source map resolution (all exported functions called)

### What NOT Flagged (Intentional Code)

- **manifest.side_panel, manifest.action.default_popup deletions** (build.ts:72-73): Intentional per comments ("No popup — icon click toggles sidebar")
- **supabasePublishableKey null coalescing** (supabase.ts:21): Legitimate fallback pattern
- **Commented headers in routes**: All are descriptive comments, not dead code
- **Module-level state in sidepanel/index.ts**: Variables like `currentDecodeEntry`, `sessionDecodeCount`, `allErrors`, `renderedCount` are all actively used
- **Error handler parameters**: ErrorHandler signature requires (err, c) per Hono framework

---

## Priority

### Must Clean (High Confidence)

1. **Remove `ValidatedFeedbackRequest` export** (feedback.ts:8)
   - Zero references in codebase
   - Type inference happens automatically via Valibot's `InferInput`
   - Safe removal, no downstream impact

### Verify First (Medium Confidence)

1. **`supabasePublic` export** (supabase.ts:21-23)
   - May be planned for future JWT verification
   - Check git history or CLAUDE.md for intent
   - If not planned: remove and save `SUPABASE_PUBLISHABLE_KEY` env validation
   - If planned: add TODO comment explaining the deferred use case

---

## Notes

- Codebase is well-organized with minimal dead code
- All route files are mounted and functional
- No orphaned files detected
- No unreachable code paths found
- No commented-out feature code detected
- The small number of findings (2) suggests good code hygiene during development

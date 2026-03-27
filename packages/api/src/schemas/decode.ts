import * as v from "valibot";

export const decodeRequestSchema = v.object({
  errorText: v.pipe(
    v.string(),
    v.minLength(1, "Error text is required"),
    v.maxLength(10000, "Error text too long (max 10,000 characters)")
  ),
  pageContext: v.optional(
    v.object({
      url: v.optional(v.string()),
      domain: v.optional(v.string()),
      framework: v.optional(v.string()),
      isDev: v.optional(v.boolean()),
      isMinified: v.optional(v.boolean()),
      consoleErrors: v.optional(v.array(v.string())),
      networkFailures: v.optional(v.array(v.string())),
    })
  ),
  model: v.optional(v.picklist(["haiku", "sonnet"])),
});

export type ValidatedDecodeRequest = v.InferInput<typeof decodeRequestSchema>;

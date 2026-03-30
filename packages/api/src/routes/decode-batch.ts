import { Hono } from "hono";
import * as v from "valibot";
import { authMiddleware } from "../lib/middleware";
import { anthropic, models } from "../lib/anthropic";
import { supabase } from "../lib/supabase";
import { BATCH_SYSTEM_PROMPT } from "../lib/prompts";
import { errorCodes } from "@shared/types";

const batchRequestSchema = v.object({
  errors: v.pipe(
    v.array(
      v.object({
        text: v.string(),
        level: v.string(),
        source: v.optional(v.string()),
      })
    ),
    v.minLength(1, "At least one error required"),
    v.maxLength(20, "Max 20 errors per batch")
  ),
  techContext: v.optional(v.string()),
});

export const decodeBatchRoute = new Hono();

decodeBatchRoute.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const rawBody = await c.req.json();

  const parsed = v.safeParse(batchRequestSchema, rawBody);
  if (!parsed.success) {
    return c.json(
      { error: { message: parsed.issues[0]?.message ?? "Invalid input", code: errorCodes.validationError } },
      400
    );
  }

  const { errors, techContext } = parsed.output;

  // Build numbered error list for the AI
  const errorList = errors
    .map((e, i) => `Error ${i + 1} [${e.level}${e.source ? `, ${e.source}` : ""}]: ${e.text}`)
    .join("\n\n");

  const techSuffix = techContext || "";

  const startTime = Date.now();

  try {
    // Default to Haiku for batch too. Sonnet only when user explicitly picks it.
    const modelId = models.haiku;
    const modelName = "haiku" as const;

    const completion = await anthropic.messages.create({
      model: modelId,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: BATCH_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `${errors.length} errors captured from the same page:\n\n${errorList}${techSuffix}`,
        },
      ],
    });

    const responseTimeMs = Date.now() - startTime;
    let rawText = completion.content.find((c) => c.type === "text")?.text ?? "";

    // Strip markdown fences
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    // Extract JSON
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start !== -1 && end > start) {
      rawText = rawText.slice(start, end + 1);
    }

    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      result = { summary: rawText.slice(0, 500), rootCause: "Unable to parse AI response", groups: [], unrelatedErrors: [], confidence: "low" };
    }

    // Log cost
    const inputTokens = completion.usage.input_tokens;
    const outputTokens = completion.usage.output_tokens;
    const rates = modelName === "sonnet" ? { input: 3.0, output: 15.0 } : { input: 1.0, output: 5.0 };
    const costCents = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000 * 100;

    // Log to decodes table
    supabase.from("decodes").insert({
      user_id: user.id,
      error_text_hash: "batch",
      error_text_preview: `Batch: ${errors.length} errors`,
      response: result,
      model_used: modelName,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_cents: costCents,
      cache_hit: false,
      response_time_ms: responseTimeMs,
      error_category: "batch",
    }).then(({ error }) => {
      if (error) console.error("[Batch Decode] Log failed:", error.message);
    });

    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Batch Decode] Error: ${message}`);
    return c.json(
      { error: { message: "AI service temporarily unavailable.", code: errorCodes.aiUnavailable } },
      503
    );
  }
});

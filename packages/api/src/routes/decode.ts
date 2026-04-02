import { Hono } from "hono";
import * as v from "valibot";
import { authMiddleware, rateLimitMiddleware } from "../lib/middleware";
import { anthropic, models } from "../lib/anthropic";
import { supabase } from "../lib/supabase";
import { cacheUtils } from "../lib/cache";
import { SYSTEM_PROMPT, ELEMENT_SYSTEM_PROMPT } from "../lib/prompts";
import { errorCodes } from "@shared/types";

const FREE_TIER_CHAR_LIMIT = 1000;
const PRO_SONNET_MONTHLY_LIMIT = 20;
const AI_MAX_TOKENS = 1500;

const decodeRequestSchema = v.object({
  errorText: v.pipe(
    v.string(),
    v.minLength(1, "Error text is required"),
    v.maxLength(15000, "Error text too long")
  ),
  model: v.optional(v.picklist(["haiku", "sonnet"])),
  mode: v.optional(v.picklist(["error", "inspect"])),
});

export const decodeRoute = new Hono();

decodeRoute.post("/", authMiddleware, rateLimitMiddleware, async (c) => {
  const user = c.get("user");
  const rawBody = await c.req.json();

  const parsed = v.safeParse(decodeRequestSchema, rawBody);
  if (!parsed.success) {
    const message = parsed.issues[0]?.message ?? "Invalid input";
    return c.json({ error: { message, code: errorCodes.validationError } }, 400);
  }

  const { errorText, model: requestedModel, mode } = parsed.output;

  // Free tier: enforce char limit
  if (user.plan === "free" && errorText.length > FREE_TIER_CHAR_LIMIT) {
    return c.json({
      error: {
        message: `Free tier limited to ${FREE_TIER_CHAR_LIMIT} characters. Upgrade to Pro for unlimited.`,
        code: errorCodes.inputTooLong,
      },
      upgradeUrl: `${process.env.APP_URL}/#pricing`,
    }, 400);
  }

  // Determine model
  const useModel = requestedModel === "sonnet" && user.plan === "pro" ? "sonnet" : "haiku";

  // Sonnet limit check
  if (useModel === "sonnet") {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const sonnetUsed = user.sonnetMonth === currentMonth
      ? (user.sonnetUsesThisMonth ?? 0) : 0;

    if (sonnetUsed >= PRO_SONNET_MONTHLY_LIMIT) {
      return c.json({
        error: { message: "Monthly Deep Analysis limit reached (20/month). You can still decode with Haiku.", code: errorCodes.sonnetLimitReached },
      }, 429);
    }
  }

  // Check response cache (only for error mode, not inspect)
  const errorHash = cacheUtils.hash(errorText);
  const isCacheable = mode !== "inspect" && cacheUtils.isCacheable(errorText);

  if (isCacheable) {
    const cached = await cacheUtils.get(errorHash);
    if (cached) {
      const decodeId = await logDecode(user.id, errorHash, errorText, cached, useModel, true, 0, 0, 0, 0);
      return c.json({ data: { markdown: cached, model: useModel, cached: true, decodeId } });
    }
  }

  // Pick system prompt based on mode
  const systemPrompt = mode === "inspect" ? ELEMENT_SYSTEM_PROMPT : SYSTEM_PROMPT;

  // Call Anthropic
  const startTime = Date.now();

  try {
    const completion = await anthropic.messages.create({
      model: models[useModel],
      max_tokens: AI_MAX_TOKENS,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: errorText }],
    });

    const responseTimeMs = Date.now() - startTime;
    const textContent = completion.content.find((c) => c.type === "text");
    const markdown = textContent?.text ?? "No response from AI.";

    // Calculate cost
    const inputTokens = completion.usage.input_tokens;
    const outputTokens = completion.usage.output_tokens;
    const rates = useModel === "sonnet" ? { input: 3.0, output: 15.0 } : { input: 1.0, output: 5.0 };
    const costCents = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000 * 100;

    // Cache if eligible
    if (isCacheable) {
      cacheUtils.set(errorHash, markdown).catch(() => {});
    }

    // Increment Sonnet counter
    if (useModel === "sonnet") {
      const currentMonth = new Date().toISOString().slice(0, 7);
      supabase.rpc("increment_sonnet_usage", { p_user_id: user.id, p_month: currentMonth }).then(() => {});
    }

    // Log and get decode ID for feedback
    const decodeId = await logDecode(user.id, errorHash, errorText, markdown, useModel, false, inputTokens, outputTokens, costCents, responseTimeMs);

    // Increment daily usage only on success (free users)
    if (user.plan === "free" && !user.isAdmin) {
      supabase.rpc("increment_daily_usage", { p_user_id: user.id }).then(() => {});
    }

    return c.json({ data: { markdown, model: useModel, cached: false, decodeId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Decode] Error: ${message}`);

    if (message.includes("rate_limit") || message.includes("429")) {
      return c.json({ error: { message: "AI service is busy. Try again.", code: errorCodes.aiUnavailable } }, 429);
    }

    return c.json({ error: { message: "AI service temporarily unavailable.", code: errorCodes.aiUnavailable } }, 503);
  }
});

const logDecode = async (
  userId: string, errorHash: string, errorText: string, markdown: string,
  modelUsed: "haiku" | "sonnet",
  cacheHit: boolean, inputTokens: number, outputTokens: number,
  costCents: number, responseTimeMs: number
): Promise<string | null> => {
  const { data, error } = await supabase.from("decodes").insert({
    user_id: userId,
    error_text_hash: errorHash,
    error_text_preview: errorText.slice(0, 200),
    response: { markdown },
    model_used: modelUsed,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_cents: costCents,
    cache_hit: cacheHit,
    response_time_ms: responseTimeMs,
  }).select("id").single();

  if (error) {
    console.error("[Decode Log] Failed:", error.message);
    return null;
  }
  return data?.id ?? null;
};

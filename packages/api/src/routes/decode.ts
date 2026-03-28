import { Hono } from "hono";
import * as v from "valibot";
import { authMiddleware, rateLimitMiddleware } from "../lib/middleware";
import { anthropic, models } from "../lib/anthropic";
import { supabase } from "../lib/supabase";
import { cacheUtils } from "../lib/cache";
import { SYSTEM_PROMPT, buildUserPrompt } from "../lib/prompts";
import { decodeRequestSchema } from "../schemas/decode";
import { errorCodes } from "@shared/types";
import type { DecodeResponse } from "@shared/types";

export const decodeRoute = new Hono();

decodeRoute.post("/", authMiddleware, rateLimitMiddleware, async (c) => {
  const user = c.get("user");
  const rawBody = await c.req.json();

  // Validate input
  const parsed = v.safeParse(decodeRequestSchema, rawBody);
  if (!parsed.success) {
    const message = parsed.issues[0]?.message ?? "Invalid input";
    return c.json(
      { error: { message, code: errorCodes.validationError } },
      400
    );
  }

  const { errorText, pageContext, model: requestedModel } = parsed.output;

  // Free tier: enforce 1,000 char limit
  if (user.plan === "free" && errorText.length > 1000) {
    return c.json(
      {
        error: {
          message: "Free tier limited to 1,000 characters. Upgrade to Pro for unlimited.",
          code: errorCodes.inputTooLong,
        },
        upgradeUrl: "https://errordecoder.dev/#pricing",
      },
      400
    );
  }

  // Determine model
  const useModel = requestedModel === "sonnet" && user.plan === "pro" ? "sonnet" : "haiku";

  // Sonnet limit check for Pro users
  if (useModel === "sonnet") {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const { data: userRow } = await supabase
      .from("users")
      .select("sonnet_uses_this_month, sonnet_month")
      .eq("id", user.id)
      .single();

    const sonnetUsed =
      userRow?.sonnet_month === currentMonth
        ? (userRow?.sonnet_uses_this_month ?? 0)
        : 0;

    if (sonnetUsed >= 20) {
      return c.json(
        {
          error: {
            message: "Monthly Sonnet limit reached (20/month). Using Haiku instead.",
            code: errorCodes.sonnetLimitReached,
          },
        },
        429
      );
    }
  }

  // Check response cache
  const errorHash = cacheUtils.hash(errorText);
  const isCacheable = cacheUtils.isCacheable(errorText);

  if (isCacheable) {
    const cached = await cacheUtils.get(errorHash);
    if (cached) {
      // Log cached decode
      logDecode(user.id, errorHash, errorText, cached, true, 0, 0, 0, 0, pageContext);
      return c.json({ data: { ...cached, cached: true } });
    }
  }

  // Call Anthropic
  const startTime = Date.now();
  let response: DecodeResponse;

  try {
    const modelId = models[useModel];
    const userPrompt = buildUserPrompt(errorText, pageContext);

    const completion = await anthropic.messages.create({
      model: modelId,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const responseTimeMs = Date.now() - startTime;
    const textContent = completion.content.find((c) => c.type === "text");
    let rawText = textContent?.text ?? "";

    // Strip markdown code fences if present
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    // If still not valid JSON, try to extract JSON object from the text
    const extractJson = (text: string): string => {
      // Try the text as-is first
      try { JSON.parse(text); return text; } catch {}
      // Look for first { to last }
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end > start) {
        return text.slice(start, end + 1);
      }
      return text;
    };

    const jsonText = extractJson(rawText);

    // Parse AI response
    try {
      const parsed = JSON.parse(jsonText);
      response = {
        whatHappened: parsed.whatHappened ?? "Unable to parse error",
        why: Array.isArray(parsed.why) ? parsed.why : [],
        howToFix: Array.isArray(parsed.howToFix) ? parsed.howToFix : [],
        codeExample: parsed.codeExample ?? undefined,
        errorCategory: parsed.errorCategory ?? "other",
        confidence: parsed.confidence ?? "medium",
        model: useModel,
        cached: false,
      };
    } catch {
      // Genuinely unparseable — wrap raw text
      console.error("[Decode] Failed to parse AI response as JSON:", rawText.slice(0, 200));
      response = {
        whatHappened: rawText.slice(0, 500),
        why: [],
        howToFix: [],
        errorCategory: "other",
        confidence: "low",
        model: useModel,
        cached: false,
      };
    }

    // Calculate cost
    const inputTokens = completion.usage.input_tokens;
    const outputTokens = completion.usage.output_tokens;
    const rates = useModel === "sonnet"
      ? { input: 3.0, output: 15.0 }
      : { input: 1.0, output: 5.0 };
    const costCents =
      (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000 * 100;

    // Cache if eligible — only cache well-parsed responses
    if (isCacheable && response.confidence !== "low") {
      cacheUtils.set(errorHash, response).catch((err) => {
        console.error("[Cache] Write failed:", err);
      });
    }

    // Increment Sonnet counter atomically
    if (useModel === "sonnet") {
      const currentMonth = new Date().toISOString().slice(0, 7);
      supabase
        .rpc("increment_sonnet_usage", { p_user_id: user.id, p_month: currentMonth })
        .then(({ error: rpcErr }) => {
          if (rpcErr) console.error("[Sonnet] Usage increment failed:", rpcErr.message);
        });
    }

    // Log decode
    logDecode(
      user.id,
      errorHash,
      errorText,
      response,
      false,
      inputTokens,
      outputTokens,
      costCents,
      responseTimeMs,
      pageContext
    );

    return c.json({ data: response });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Decode] Anthropic API error: ${message}`);

    if (message.includes("rate_limit") || message.includes("429")) {
      return c.json(
        { error: { message: "AI service is busy. Try again in a moment.", code: errorCodes.aiUnavailable } },
        429
      );
    }

    return c.json(
      { error: { message: "AI service temporarily unavailable.", code: errorCodes.aiUnavailable } },
      503
    );
  }
});

// Fire-and-forget logging
const logDecode = (
  userId: string,
  errorHash: string,
  errorText: string,
  response: DecodeResponse,
  cacheHit: boolean,
  inputTokens: number,
  outputTokens: number,
  costCents: number,
  responseTimeMs: number,
  pageContext?: { domain?: string; framework?: string } | null
) => {
  supabase
    .from("decodes")
    .insert({
      user_id: userId,
      error_text_hash: errorHash,
      error_text_preview: errorText.slice(0, 200),
      response,
      model_used: response.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_cents: costCents,
      cache_hit: cacheHit,
      response_time_ms: responseTimeMs,
      error_category: response.errorCategory,
      page_url_domain: pageContext?.domain ?? null,
      detected_framework: pageContext?.framework ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[Decode Log] Insert failed:", error.message);
    });
};

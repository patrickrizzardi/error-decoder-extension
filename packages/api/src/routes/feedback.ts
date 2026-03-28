import { Hono } from "hono";
import * as v from "valibot";
import { authMiddleware } from "../lib/middleware";
import { supabase } from "../lib/supabase";
import { feedbackRequestSchema } from "../schemas/feedback";
import { errorCodes } from "@shared/types";

export const feedbackRoute = new Hono();

feedbackRoute.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const rawBody = await c.req.json();

  const parsed = v.safeParse(feedbackRequestSchema, rawBody);
  if (!parsed.success) {
    const message = parsed.issues[0]?.message ?? "Invalid input";
    return c.json(
      { error: { message, code: errorCodes.validationError } },
      400
    );
  }

  const { decodeId, thumbsUp } = parsed.output;

  const { error } = await supabase
    .from("decodes")
    .update({ thumbs_up: thumbsUp })
    .eq("id", decodeId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[Feedback] Update failed:", error.message);
    return c.json(
      { error: { message: "Failed to save feedback", code: errorCodes.serverError } },
      500
    );
  }

  return c.json({ data: { saved: true } });
});

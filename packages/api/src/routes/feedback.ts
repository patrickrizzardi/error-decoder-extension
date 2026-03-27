import { Hono } from "hono";
import { authMiddleware } from "../lib/middleware";
import { supabase } from "../lib/supabase";
import { errorCodes } from "@shared/types";

export const feedbackRoute = new Hono();

feedbackRoute.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  const { decodeId, thumbsUp } = body;

  if (!decodeId || typeof thumbsUp !== "boolean") {
    return c.json(
      {
        error: {
          message: "decodeId (string) and thumbsUp (boolean) required",
          code: errorCodes.validationError,
        },
      },
      400
    );
  }

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

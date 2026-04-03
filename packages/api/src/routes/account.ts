import { Hono } from "hono";
import { authMiddleware } from "../lib/middleware";
import { supabase } from "../lib/supabase";
import { stripe } from "../lib/stripe";
import { errorCodes } from "@shared/types";

export const accountRoute = new Hono();

// GDPR: Delete account and all associated data
accountRoute.delete("/", authMiddleware, async (c) => {
  const user = c.get("user");

  // Cancel Stripe subscription if one exists
  if (user.stripeCustomerId) {
    try {
      const subs = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: "active",
        limit: 10,
      });
      for (const sub of subs.data) {
        await stripe.subscriptions.cancel(sub.id);
      }
    } catch (err) {
      console.error("[Account] Stripe cancel failed:", err);
    }
  }

  // Delete from Supabase Auth first — if this fails, nothing is lost yet
  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
    user.id
  );

  if (authDeleteError) {
    console.error("[Account] Auth delete failed:", authDeleteError.message);
    return c.json(
      { error: { message: "Failed to delete account", code: errorCodes.serverError } },
      500
    );
  }

  // Auth is gone — cascade deletes handle decodes, daily_usage via FK constraints
  // If this fails, log a warning but return success (user can re-register, auth identity is gone)
  const { error: deleteError } = await supabase
    .from("users")
    .delete()
    .eq("id", user.id);

  if (deleteError) {
    console.error("[Account] App data delete failed (auth already deleted):", deleteError.message);
  }

  return c.json({ data: { deleted: true } });
});

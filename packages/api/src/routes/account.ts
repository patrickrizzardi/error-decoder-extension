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

  // Cascade deletes handle decodes, daily_usage via FK constraints
  const { error: deleteError } = await supabase
    .from("users")
    .delete()
    .eq("id", user.id);

  if (deleteError) {
    console.error("[Account] Delete failed:", deleteError.message);
    return c.json(
      { error: { message: "Failed to delete account", code: errorCodes.serverError } },
      500
    );
  }

  // Also delete from Supabase Auth
  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
    user.id
  );

  if (authDeleteError) {
    console.error("[Account] Auth delete failed:", authDeleteError.message);
  }

  return c.json({ data: { deleted: true } });
});

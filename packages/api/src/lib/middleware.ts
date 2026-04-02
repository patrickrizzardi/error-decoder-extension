import type { Context, Next } from "hono";
import { supabase } from "./supabase";
import { errorCodes } from "@shared/types";

const FREE_TIER_DAILY_LIMIT = 3;

type AuthUser = {
  id: string;
  email: string;
  plan: "free" | "pro";
  stripeCustomerId: string | null;
  isAdmin: boolean;
  sonnetUsesThisMonth: number | null;
  sonnetMonth: string | null;
};

// Extend Hono context with user
declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

// Authenticate via API key in Authorization header
export const authMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      {
        error: {
          message: "API key required. Include Authorization: Bearer <key>",
          code: errorCodes.authRequired,
        },
      },
      401
    );
  }

  const apiKey = authHeader.slice(7);

  const { data: user, error } = await supabase
    .from("users")
    .select("id, email, plan, stripe_customer_id, is_admin, sonnet_uses_this_month, sonnet_month")
    .eq("api_key", apiKey)
    .single();

  if (error || !user) {
    return c.json(
      {
        error: {
          message: "Invalid API key",
          code: errorCodes.authInvalid,
        },
      },
      401
    );
  }

  c.set("user", {
    id: user.id,
    email: user.email,
    plan: user.is_admin ? "pro" : user.plan,
    stripeCustomerId: user.stripe_customer_id,
    isAdmin: user.is_admin,
    sonnetUsesThisMonth: user.sonnet_uses_this_month,
    sonnetMonth: user.sonnet_month,
  });

  await next();
};

// Rate limit check for free users (read-only — increment happens after AI success)
export const rateLimitMiddleware = async (c: Context, next: Next) => {
  const user = c.get("user");

  if (user.isAdmin || user.plan === "pro") {
    await next();
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const { data: usage, error } = await supabase
    .from("daily_usage")
    .select("count")
    .eq("user_id", user.id)
    .eq("date", today)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[Rate Limit] Failed to check usage:", error.message);
    return c.json({ error: { message: "Service temporarily unavailable.", code: errorCodes.serverError } }, 503);
  }

  if ((usage?.count ?? 0) >= FREE_TIER_DAILY_LIMIT) {
    return c.json(
      {
        error: {
          message: "Daily limit reached. Upgrade to Pro for unlimited decodes.",
          code: errorCodes.rateLimited,
        },
        upgradeUrl: `${process.env.APP_URL}/#pricing`,
      },
      429
    );
  }

  await next();
};

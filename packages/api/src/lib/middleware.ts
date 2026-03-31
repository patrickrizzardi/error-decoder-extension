import type { Context, Next } from "hono";
import { supabase } from "./supabase";
import { errorCodes } from "@shared/types";

type AuthUser = {
  id: string;
  email: string;
  plan: "free" | "pro";
  stripeCustomerId: string | null;
  isAdmin: boolean;
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
    .select("id, email, plan, stripe_customer_id, is_admin")
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
  });

  await next();
};

// Rate limit check for free users
export const rateLimitMiddleware = async (c: Context, next: Next) => {
  const user = c.get("user");

  if (user.isAdmin || user.plan === "pro") {
    await next();
    return;
  }

  // Atomic increment + check via Postgres function
  const { data: newCount, error } = await supabase.rpc(
    "increment_daily_usage",
    { p_user_id: user.id }
  );

  if (error) {
    console.error("[Rate Limit] Failed to check usage:", error.message);
    await next();
    return;
  }

  if (newCount > 3) {
    return c.json(
      {
        error: {
          message: "Daily limit reached. Upgrade to Pro for unlimited decodes.",
          code: errorCodes.rateLimited,
        },
        upgradeUrl: "https://errordecoder.dev/#pricing",
      },
      429
    );
  }

  await next();
};

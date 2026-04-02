import { Hono } from "hono";
import { authMiddleware } from "../lib/middleware";
import { supabase } from "../lib/supabase";
import type { UsageResponse } from "@shared/types";

export const usageRoute = new Hono();

usageRoute.get("/", authMiddleware, async (c) => {
  const user = c.get("user");

  const today = new Date().toISOString().split("T")[0];

  const { data: usage } = await supabase
    .from("daily_usage")
    .select("count")
    .eq("user_id", user.id)
    .eq("date", today)
    .single();

  const { data: userRow } = await supabase
    .from("users")
    .select("sonnet_uses_this_month, sonnet_month")
    .eq("id", user.id)
    .single();

  const currentMonth = new Date().toISOString().slice(0, 7);
  const sonnetUsed =
    userRow?.sonnet_month === currentMonth
      ? (userRow?.sonnet_uses_this_month ?? 0)
      : 0;

  // Reset at midnight UTC
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  const response: UsageResponse = {
    email: user.email,
    used: usage?.count ?? 0,
    limit: user.plan === "pro" ? -1 : 3,
    plan: user.plan,
    resetsAt: tomorrow.toISOString(),
    sonnetUsed,
    sonnetLimit: user.plan === "pro" ? 20 : 0,
  };

  return c.json({ data: response });
});

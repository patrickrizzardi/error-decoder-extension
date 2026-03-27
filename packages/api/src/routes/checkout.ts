import { Hono } from "hono";
import { authMiddleware } from "../lib/middleware";
import { stripe } from "../lib/stripe";

export const checkoutRoute = new Hono();

checkoutRoute.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const interval = body.interval === "year" ? "year" : "month";

  // Phase 8: Look up price ID from Stripe (created by sync script)
  // For now, return a placeholder
  return c.json({
    data: {
      message: "Checkout — Phase 8. Will create Stripe Checkout Session.",
      interval,
      userId: user.id,
    },
  });
});

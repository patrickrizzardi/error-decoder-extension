import { Hono } from "hono";
import { authMiddleware } from "../lib/middleware";
import { stripe } from "../lib/stripe";
import { errorCodes } from "@shared/types";

export const portalRoute = new Hono();

portalRoute.post("/", authMiddleware, async (c) => {
  const user = c.get("user");

  if (!user.stripeCustomerId) {
    return c.json(
      {
        error: {
          message: "No subscription found",
          code: errorCodes.notFound,
        },
      },
      404
    );
  }

  // Phase 8: Create Stripe Customer Portal session
  return c.json({
    data: {
      message: "Portal — Phase 8. Will create Stripe Portal Session.",
      customerId: user.stripeCustomerId,
    },
  });
});

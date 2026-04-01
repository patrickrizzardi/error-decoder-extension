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

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.APP_URL}/settings-updated`,
  });

  return c.json({ data: { url: session.url } });
});

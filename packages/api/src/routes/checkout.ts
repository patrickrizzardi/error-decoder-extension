import { Hono } from "hono";
import * as v from "valibot";
import { authMiddleware } from "../lib/middleware";
import { stripe } from "../lib/stripe";
import { supabase } from "../lib/supabase";
import { checkoutRequestSchema } from "../schemas/checkout";
import { errorCodes } from "@shared/types";

export const checkoutRoute = new Hono();

checkoutRoute.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const rawBody = await c.req.json();

  const parsed = v.safeParse(checkoutRequestSchema, rawBody);
  if (!parsed.success) {
    const message = parsed.issues[0]?.message ?? "Invalid input";
    return c.json(
      { error: { message, code: errorCodes.validationError } },
      400
    );
  }

  const { interval } = parsed.output;

  // Find the correct price ID from Stripe
  const prices = await stripe.prices.list({
    active: true,
    limit: 10,
    expand: ["data.product"],
  });

  const price = prices.data.find(
    (p) =>
      p.metadata.app === "error-decoder" &&
      p.metadata.interval === interval
  );

  if (!price) {
    return c.json(
      { error: { message: "Price not found. Run stripe:setup first.", code: errorCodes.serverError } },
      500
    );
  }

  // Get or create Stripe customer
  let customerId = user.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    customerId = customer.id;

    await supabase
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: user.id,
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${process.env.APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/#pricing`,
    subscription_data: {
      metadata: { userId: user.id },
    },
  });

  return c.json({ data: { url: session.url } });
});

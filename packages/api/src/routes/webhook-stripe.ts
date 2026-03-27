import { Hono } from "hono";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../lib/stripe";

export const stripeWebhookRoute = new Hono();

// No auth middleware — uses Stripe signature verification instead
stripeWebhookRoute.post("/", async (c) => {
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    return c.json({ error: { message: "Missing signature", code: "INVALID_SIGNATURE" } }, 400);
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set");
    return c.json({ error: { message: "Webhook not configured", code: "SERVER_ERROR" } }, 500);
  }

  const rawBody = await c.req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Stripe Webhook] Signature verification failed: ${message}`);
    return c.json({ error: { message: "Invalid signature", code: "INVALID_SIGNATURE" } }, 400);
  }

  // Phase 8: Handle events
  switch (event.type) {
    case "checkout.session.completed":
      console.log("[Stripe] Checkout completed:", event.data.object.id);
      // Set user.plan = 'pro', save stripe IDs
      break;

    case "customer.subscription.deleted":
      console.log("[Stripe] Subscription deleted:", event.data.object.id);
      // Set user.plan = 'free'
      break;

    case "customer.subscription.updated":
      console.log("[Stripe] Subscription updated:", event.data.object.id);
      // Sync plan status
      break;

    case "invoice.payment_failed":
      console.log("[Stripe] Payment failed:", event.data.object.id);
      // Let Stripe retry — no immediate action
      break;

    default:
      console.log(`[Stripe] Unhandled event type: ${event.type}`);
  }

  return c.json({ received: true });
});

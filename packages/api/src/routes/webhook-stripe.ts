import { Hono } from "hono";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../lib/stripe";
import { supabase } from "../lib/supabase";

export const stripeWebhookRoute = new Hono();

// No auth middleware — uses Stripe signature verification
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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const subscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
      const customerId = typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;

      if (userId) {
        const { error } = await supabase
          .from("users")
          .update({
            plan: "pro",
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) {
          console.error(`[Stripe Webhook] Failed to upgrade user ${userId}:`, error.message);
        } else {
          console.log(`[Stripe Webhook] User ${userId} upgraded to Pro`);
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const customerId = typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;

      if (customerId) {
        const { error } = await supabase
          .from("users")
          .update({
            plan: "free",
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        if (error) {
          console.error(`[Stripe Webhook] Failed to downgrade customer ${customerId}:`, error.message);
        } else {
          console.log(`[Stripe Webhook] Customer ${customerId} downgraded to Free`);
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const customerId = typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;

      // Sync plan status based on subscription status
      const isActive = subscription.status === "active" || subscription.status === "trialing";

      if (customerId) {
        await supabase
          .from("users")
          .update({
            plan: isActive ? "pro" : "free",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      console.log(`[Stripe Webhook] Payment failed for invoice ${invoice.id}. Stripe will retry.`);
      // Stripe retries 3 times over ~3 weeks. No immediate action needed.
      break;
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event: ${event.type}`);
  }

  return c.json({ received: true });
});

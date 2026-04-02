import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

export const stripe = new Stripe(stripeSecretKey);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
export const STRIPE_WEBHOOK_SECRET = webhookSecret;

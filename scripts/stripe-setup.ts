/**
 * Stripe Declarative Sync Script
 *
 * Defines desired Stripe state (products, prices, webhooks) and syncs.
 * Run: bun run stripe:setup
 *
 * - Creates missing products/prices
 * - Archives products/prices not in config
 * - Registers/updates webhook endpoints
 * - Idempotent: run as many times as you want
 */

import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error("STRIPE_SECRET_KEY not set in environment");
  process.exit(1);
}

// Safety check: warn if running against live mode
if (stripeKey.startsWith("sk_live_")) {
  console.warn("⚠️  WARNING: Running against LIVE Stripe. Press Ctrl+C to abort.");
  await Bun.sleep(5000);
}

const stripe = new Stripe(stripeKey, { apiVersion: "2025-12-18.acacia" });

// ============================================
// Desired State Config
// ============================================

const PRODUCT_CONFIG = {
  name: "ErrorDecoder Pro",
  description: "Unlimited error decoding + Claude Sonnet deep analysis",
  metadata: { app: "error-decoder" },
};

const PRICE_CONFIGS = [
  {
    nickname: "Monthly",
    unit_amount: 900, // $9.00
    currency: "usd",
    recurring: { interval: "month" as const },
    metadata: { app: "error-decoder", interval: "month" },
  },
  {
    nickname: "Annual",
    unit_amount: 7900, // $79.00
    currency: "usd",
    recurring: { interval: "year" as const },
    metadata: { app: "error-decoder", interval: "year" },
  },
];

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.payment_failed",
];

// ============================================
// Sync Logic
// ============================================

const syncProduct = async (): Promise<string> => {
  // Find existing product by metadata
  const existing = await stripe.products.list({ limit: 100 });
  const product = existing.data.find(
    (p) => p.metadata.app === "error-decoder" && p.active
  );

  if (product) {
    console.log(`✓ Product exists: ${product.name} (${product.id})`);
    // Update if name/description changed
    if (
      product.name !== PRODUCT_CONFIG.name ||
      product.description !== PRODUCT_CONFIG.description
    ) {
      await stripe.products.update(product.id, {
        name: PRODUCT_CONFIG.name,
        description: PRODUCT_CONFIG.description,
      });
      console.log("  → Updated name/description");
    }
    return product.id;
  }

  const newProduct = await stripe.products.create(PRODUCT_CONFIG);
  console.log(`✓ Created product: ${newProduct.name} (${newProduct.id})`);
  return newProduct.id;
};

const syncPrices = async (productId: string) => {
  const existing = await stripe.prices.list({ product: productId, active: true, limit: 100 });

  for (const config of PRICE_CONFIGS) {
    const match = existing.data.find(
      (p) =>
        p.unit_amount === config.unit_amount &&
        p.recurring?.interval === config.recurring.interval
    );

    if (match) {
      console.log(`✓ Price exists: ${config.nickname} — $${config.unit_amount / 100}/${config.recurring.interval} (${match.id})`);
      continue;
    }

    const newPrice = await stripe.prices.create({
      product: productId,
      ...config,
    });
    console.log(`✓ Created price: ${config.nickname} — $${config.unit_amount / 100}/${config.recurring.interval} (${newPrice.id})`);
  }

  // Archive prices not in config
  for (const price of existing.data) {
    const inConfig = PRICE_CONFIGS.some(
      (c) =>
        c.unit_amount === price.unit_amount &&
        c.recurring.interval === price.recurring?.interval
    );

    if (!inConfig) {
      // Check for active subscriptions before archiving
      const subs = await stripe.subscriptions.list({
        price: price.id,
        status: "active",
        limit: 1,
      });

      if (subs.data.length > 0) {
        console.warn(`⚠ Price ${price.id} (${price.nickname}) has active subscriptions — skipping archive`);
        continue;
      }

      await stripe.prices.update(price.id, { active: false });
      console.log(`✓ Archived price: ${price.nickname} (${price.id})`);
    }
  }
};

const syncWebhooks = async () => {
  const appUrl = process.env.APP_URL ?? "http://localhost:5000";
  const webhookUrl = `${appUrl}/api/webhook/stripe`;

  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = existing.data.find((w) => w.url === webhookUrl);

  if (match) {
    console.log(`✓ Webhook exists: ${webhookUrl} (${match.id})`);
    // Update events if changed
    await stripe.webhookEndpoints.update(match.id, {
      enabled_events: WEBHOOK_EVENTS,
    });
    console.log("  → Synced webhook events");
    return;
  }

  const webhook = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: WEBHOOK_EVENTS,
  });
  console.log(`✓ Created webhook: ${webhookUrl} (${webhook.id})`);
  console.log(`  → Signing secret: ${webhook.secret}`);
  console.log("  → Add this as STRIPE_WEBHOOK_SECRET in .env");
};

// ============================================
// Run
// ============================================

console.log("\n🔄 Syncing Stripe configuration...\n");

const productId = await syncProduct();
await syncPrices(productId);
await syncWebhooks();

console.log("\n✅ Stripe sync complete.\n");

import { Hono } from "hono";
import { cors } from "hono/cors";
import { healthRoute } from "./routes/health";
import { decodeRoute } from "./routes/decode";
import { usageRoute } from "./routes/usage";
import { authRoutes } from "./routes/auth";
import { checkoutRoute } from "./routes/checkout";
import { portalRoute } from "./routes/portal";
import { stripeWebhookRoute } from "./routes/webhook-stripe";
import { feedbackRoute } from "./routes/feedback";
import { accountRoute } from "./routes/account";
import { decodeBatchRoute } from "./routes/decode-batch";
import { errorHandler } from "./lib/error-handler";

const app = new Hono().basePath("/api");

// Global middleware
app.use(
  "*",
  cors({
    origin: [
      "chrome-extension://*",
      "http://localhost:4000",
      "https://errordecoder.dev",
    ],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Global error handler
app.onError(errorHandler);

// Routes
app.route("/health", healthRoute);
app.route("/decode", decodeRoute);
app.route("/decode-batch", decodeBatchRoute);
app.route("/usage", usageRoute);
app.route("/auth", authRoutes);
app.route("/checkout", checkoutRoute);
app.route("/portal", portalRoute);
app.route("/webhook/stripe", stripeWebhookRoute);
app.route("/feedback", feedbackRoute);
app.route("/account", accountRoute);

export default app;

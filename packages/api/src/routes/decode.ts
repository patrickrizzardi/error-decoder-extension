import { Hono } from "hono";
import { authMiddleware, rateLimitMiddleware } from "../lib/middleware";
import type { DecodeResponse } from "@shared/types";

export const decodeRoute = new Hono();

decodeRoute.post("/", authMiddleware, rateLimitMiddleware, async (c) => {
  const body = await c.req.json();

  // Phase 5: Replace with real Anthropic integration
  const mockResponse: DecodeResponse = {
    whatHappened:
      "This is a mock decode response. AI integration coming in Phase 5.",
    why: ["Mock reason 1", "Mock reason 2"],
    howToFix: ["Mock fix step 1", "Mock fix step 2"],
    codeExample: {
      before: "// broken code",
      after: "// fixed code",
      language: "javascript",
    },
    errorCategory: "runtime",
    confidence: "high",
    model: "haiku",
    cached: false,
  };

  return c.json({ data: mockResponse });
});

/**
 * Vercel serverless function entry point
 *
 * Converts Node.js IncomingMessage/ServerResponse to Web API Request/Response
 * so Hono's app.fetch() can handle it directly. No hono/vercel dependency.
 */
import type { IncomingMessage, ServerResponse } from "http";
import app from "./packages/api/src/index";

export default async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? "/", `https://${req.headers.host}`);

  // Read body for non-GET/HEAD requests
  let body: Buffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    body = Buffer.concat(chunks);
  }

  // Build Web API Request
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body,
  });

  // Let Hono handle it
  const response = await app.fetch(request);

  // Write Web API Response back to Node.js ServerResponse
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  const buffer = await response.arrayBuffer();
  res.end(Buffer.from(buffer));
};

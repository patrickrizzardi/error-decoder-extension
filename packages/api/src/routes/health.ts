import { Hono } from "hono";

export const healthRoute = new Hono();

healthRoute.get("/", (c) => {
  return c.json({ data: { status: "ok", timestamp: new Date().toISOString() } });
});

import { Hono } from "hono";
import { supabase } from "../lib/supabase";
import { errorCodes } from "@shared/types";

export const authRoutes = new Hono();

// OAuth callback handler — Supabase redirects here after auth
authRoutes.get("/callback", async (c) => {
  // Phase 4: Implement OAuth callback
  return c.json({ data: { message: "Auth callback — Phase 4" } });
});

// Get or create API key for authenticated user
// Called by extension after Supabase auth, with Supabase JWT
authRoutes.post("/key", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      { error: { message: "Supabase JWT required", code: errorCodes.authRequired } },
      401
    );
  }

  const jwt = authHeader.slice(7);

  // Verify the Supabase JWT and get user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(jwt);

  if (authError || !user) {
    return c.json(
      { error: { message: "Invalid token", code: errorCodes.authInvalid } },
      401
    );
  }

  // Get existing user row (created by trigger on auth.users insert)
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("api_key, email, plan")
    .eq("id", user.id)
    .single();

  if (userError || !userRow) {
    return c.json(
      { error: { message: "User not found", code: errorCodes.serverError } },
      500
    );
  }

  return c.json({
    data: {
      apiKey: userRow.api_key,
      email: userRow.email,
      plan: userRow.plan,
    },
  });
});

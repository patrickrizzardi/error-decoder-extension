import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
}

// Service role client — bypasses RLS. Server-side only.
export const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Public client — respects RLS. For verifying user JWTs.
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

export const supabasePublic = supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

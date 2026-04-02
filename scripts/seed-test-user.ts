/**
 * Creates a test user and prints the API key for development.
 * Run: bun run scripts/seed-test-user.ts
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_EMAIL = "test@errordecoder.dev";
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? crypto.randomUUID();

if (!process.env.TEST_PASSWORD) {
  console.log(`\nGenerated test password: ${TEST_PASSWORD}`);
  console.log("Set TEST_PASSWORD env var to use a fixed password.\n");
}

// Check if test user already exists
const { data: existing } = await supabase
  .from("users")
  .select("id, email, api_key, plan")
  .eq("email", TEST_EMAIL)
  .single();

if (existing) {
  console.log("\n✓ Test user already exists:\n");
  console.log(`  Email:   ${existing.email}`);
  console.log(`  Plan:    ${existing.plan}`);
  console.log(`  API Key: ${existing.api_key}`);
  console.log(`\nPaste the API key into the extension options page.\n`);
  process.exit(0);
}

// Create auth user (triggers public.users row creation)
const { data: authData, error: authError } = await supabase.auth.admin.createUser({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
  email_confirm: true,
});

if (authError) {
  console.error("Failed to create auth user:", authError.message);
  process.exit(1);
}

// Wait a moment for the trigger to fire
await Bun.sleep(1000);

// Get the API key from public.users
const { data: user, error: userError } = await supabase
  .from("users")
  .select("id, email, api_key, plan")
  .eq("id", authData.user.id)
  .single();

if (userError || !user) {
  console.error("Failed to get user row:", userError?.message ?? "not found");
  process.exit(1);
}

console.log("\n✓ Test user created:\n");
console.log(`  Email:    ${user.email}`);
console.log(`  Password: ${TEST_PASSWORD}`);
console.log(`  Plan:     ${user.plan}`);
console.log(`  API Key:  ${user.api_key}`);
console.log(`\nPaste the API key into the extension options page.\n`);

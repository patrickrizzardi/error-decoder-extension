import { createHash } from "crypto";
import { supabase } from "./supabase";

// File path pattern — don't cache errors containing specific file paths
const FILE_PATH_PATTERN =
  /[\/\\][\w.-]+\.(ts|js|py|java|go|rs|c|cpp|rb|php|jsx|tsx|vue|svelte)/;

const MAX_CACHEABLE_LENGTH = 200;

export const cacheUtils = {
  normalize: (text: string): string =>
    text.toLowerCase().trim().replace(/\s+/g, " "),

  hash: (text: string): string =>
    createHash("sha256").update(cacheUtils.normalize(text)).digest("hex"),

  isCacheable: (errorText: string): boolean => {
    const normalized = cacheUtils.normalize(errorText);
    return (
      normalized.length <= MAX_CACHEABLE_LENGTH &&
      !FILE_PATH_PATTERN.test(errorText)
    );
  },

  get: async (errorTextHash: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from("response_cache")
      .select("response")
      .eq("error_text_hash", errorTextHash)
      .single();

    if (error || !data) return null;

    // Increment hit count (fire and forget)
    supabase
      .rpc("increment_cache_hit", { p_hash: errorTextHash })
      .then(() => {});

    return data.response as string;
  },

  set: async (errorTextHash: string, response: string): Promise<void> => {
    await supabase.from("response_cache").upsert({
      error_text_hash: errorTextHash,
      response,
      hit_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  },
};

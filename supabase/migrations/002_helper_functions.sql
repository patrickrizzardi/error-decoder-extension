-- Helper functions for atomic operations

-- Increment cache hit count
CREATE OR REPLACE FUNCTION increment_cache_hit(p_hash TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.response_cache
  SET hit_count = hit_count + 1, updated_at = now()
  WHERE error_text_hash = p_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment Sonnet usage for a user (resets if month changed)
CREATE OR REPLACE FUNCTION increment_sonnet_usage(p_user_id UUID, p_month TEXT)
RETURNS INT AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE public.users
  SET
    sonnet_uses_this_month = CASE
      WHEN sonnet_month = p_month THEN sonnet_uses_this_month + 1
      ELSE 1
    END,
    sonnet_month = p_month,
    updated_at = now()
  WHERE id = p_user_id
  RETURNING sonnet_uses_this_month INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

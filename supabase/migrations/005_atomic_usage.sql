-- Atomic check-and-increment for daily usage
-- Returns true if the user was under the limit and was incremented
-- Returns false if the user was already at or over the limit
CREATE OR REPLACE FUNCTION check_and_increment_daily_usage(
  p_user_id UUID,
  p_limit INT
) RETURNS BOOLEAN AS $$
DECLARE
  v_count INT;
BEGIN
  -- Upsert: create row if not exists, then try to increment
  INSERT INTO daily_usage (user_id, date, count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET count = daily_usage.count + 1
  WHERE daily_usage.count < p_limit
  RETURNING count INTO v_count;

  -- If v_count is null, the WHERE clause prevented the update (at limit)
  RETURN v_count IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Atomic check-and-increment for Sonnet monthly usage
CREATE OR REPLACE FUNCTION check_and_increment_sonnet_usage(
  p_user_id UUID,
  p_month TEXT,
  p_limit INT
) RETURNS BOOLEAN AS $$
DECLARE
  v_current INT;
BEGIN
  -- Get current count, handling month reset
  SELECT sonnet_uses_this_month INTO v_current
  FROM users
  WHERE id = p_user_id AND sonnet_month = p_month;

  -- Different month or no record: reset and set to 1
  IF v_current IS NULL THEN
    UPDATE users
    SET sonnet_uses_this_month = 1, sonnet_month = p_month
    WHERE id = p_user_id;
    RETURN TRUE;
  END IF;

  -- At limit: reject
  IF v_current >= p_limit THEN
    RETURN FALSE;
  END IF;

  -- Under limit: increment
  UPDATE users
  SET sonnet_uses_this_month = v_current + 1
  WHERE id = p_user_id AND sonnet_month = p_month AND sonnet_uses_this_month = v_current;

  -- Check if update actually happened (concurrent update could have changed it)
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

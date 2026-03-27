-- ErrorDecoder — Initial Schema
-- Run this in Supabase SQL Editor

-- Users (extends auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  sonnet_uses_this_month INT NOT NULL DEFAULT 0,
  sonnet_month TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Decodes (every AI decode logged for analytics)
CREATE TABLE public.decodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  error_text_hash TEXT NOT NULL,
  error_text_preview TEXT,
  response JSONB NOT NULL,
  model_used TEXT NOT NULL CHECK (model_used IN ('haiku', 'sonnet')),
  input_tokens INT,
  output_tokens INT,
  cost_cents NUMERIC(10,4),
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  response_time_ms INT,
  thumbs_up BOOLEAN,
  error_category TEXT,
  page_url_domain TEXT,
  detected_framework TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily usage tracking
CREATE TABLE public.daily_usage (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- Response cache for common short errors
CREATE TABLE public.response_cache (
  error_text_hash TEXT PRIMARY KEY,
  response JSONB NOT NULL,
  hit_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_users_api_key ON public.users(api_key);
CREATE INDEX idx_users_stripe_customer ON public.users(stripe_customer_id);
CREATE INDEX idx_decodes_user_id ON public.decodes(user_id);
CREATE INDEX idx_decodes_created_at ON public.decodes(created_at);
CREATE INDEX idx_decodes_hash ON public.decodes(error_text_hash);
CREATE INDEX idx_daily_usage_date ON public.daily_usage(date);

-- Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.response_cache ENABLE ROW LEVEL SECURITY;

-- Users: can read/update their own row
CREATE POLICY users_self_select ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY users_self_update ON public.users FOR UPDATE USING (auth.uid() = id);

-- Decodes: users see their own
CREATE POLICY decodes_self ON public.decodes FOR SELECT USING (auth.uid() = user_id);

-- Daily usage: users see their own
CREATE POLICY daily_usage_self ON public.daily_usage FOR ALL USING (auth.uid() = user_id);

-- Response cache: service role only
CREATE POLICY cache_service ON public.response_cache FOR ALL USING (auth.role() = 'service_role');

-- Atomic daily usage increment (no race conditions)
CREATE OR REPLACE FUNCTION increment_daily_usage(p_user_id UUID)
RETURNS INT AS $$
DECLARE
  new_count INT;
BEGIN
  INSERT INTO public.daily_usage (user_id, date, count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET count = daily_usage.count + 1
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create public.users row when auth.users is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

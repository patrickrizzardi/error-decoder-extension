-- Add admin flag to users table (replaces ADMIN_EMAILS env var)
ALTER TABLE public.users ADD COLUMN is_admin boolean DEFAULT false NOT NULL;


-- Add account control columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS account_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS login_enabled boolean NOT NULL DEFAULT true;

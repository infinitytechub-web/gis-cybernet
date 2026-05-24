-- Add fields needed for Postings/Transfers dashboard widget
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_joined_service date,
  ADD COLUMN IF NOT EXISTS current_appointment text,
  ADD COLUMN IF NOT EXISTS retirement_age integer NOT NULL DEFAULT 60;
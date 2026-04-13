
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ghana_card_number text,
  ADD COLUMN IF NOT EXISTS email text;

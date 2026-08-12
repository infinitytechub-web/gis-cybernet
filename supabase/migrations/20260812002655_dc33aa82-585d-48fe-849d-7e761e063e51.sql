ALTER TABLE public.detention_records
  ADD COLUMN IF NOT EXISTS referred_from_other text,
  ADD COLUMN IF NOT EXISTS referred_to_other text;

ALTER TABLE public.detention_bail_records
  ADD COLUMN IF NOT EXISTS surety_relationship_other text;
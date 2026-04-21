ALTER TABLE public.visa_extensions
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS permit_type text,
  ADD COLUMN IF NOT EXISTS fee_charged numeric(10,2);
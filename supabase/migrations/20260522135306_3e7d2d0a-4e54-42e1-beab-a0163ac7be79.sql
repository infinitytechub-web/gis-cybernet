ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS check_in_lat double precision,
  ADD COLUMN IF NOT EXISTS check_in_lng double precision,
  ADD COLUMN IF NOT EXISTS check_in_address text,
  ADD COLUMN IF NOT EXISTS check_out_lat double precision,
  ADD COLUMN IF NOT EXISTS check_out_lng double precision,
  ADD COLUMN IF NOT EXISTS check_out_address text;
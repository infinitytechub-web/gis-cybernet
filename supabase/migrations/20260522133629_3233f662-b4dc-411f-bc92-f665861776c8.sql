ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS check_in_ip inet,
  ADD COLUMN IF NOT EXISTS check_out_ip inet;
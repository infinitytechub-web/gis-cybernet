ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS training_designation text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_training_designation_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_training_designation_check
  CHECK (training_designation IS NULL OR training_designation IN ('HUHUNYA','ITTRAS'));
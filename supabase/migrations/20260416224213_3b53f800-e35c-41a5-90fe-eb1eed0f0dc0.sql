ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS intake integer,
  ADD COLUMN IF NOT EXISTS weapon_trained boolean,
  ADD COLUMN IF NOT EXISTS weapon_training_date date,
  ADD COLUMN IF NOT EXISTS blood_group text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_intake_range_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_intake_range_check CHECK (intake IS NULL OR (intake BETWEEN 1 AND 100));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_blood_group_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_blood_group_check CHECK (blood_group IS NULL OR blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'));
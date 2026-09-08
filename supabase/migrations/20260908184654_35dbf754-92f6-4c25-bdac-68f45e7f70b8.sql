ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS check_in_method text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS check_out_method text,
  ADD COLUMN IF NOT EXISTS check_in_device text,
  ADD COLUMN IF NOT EXISTS check_out_device text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.attendances'::regclass AND conname = 'attendances_check_in_method_chk'
  ) THEN
    ALTER TABLE public.attendances
      ADD CONSTRAINT attendances_check_in_method_chk
      CHECK (check_in_method IN ('manual','biometric'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.attendances'::regclass AND conname = 'attendances_check_out_method_chk'
  ) THEN
    ALTER TABLE public.attendances
      ADD CONSTRAINT attendances_check_out_method_chk
      CHECK (check_out_method IS NULL OR check_out_method IN ('manual','biometric'));
  END IF;
END $$;
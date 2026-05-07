
-- Normalise existing values where possible (uppercase, no surrounding whitespace)
UPDATE public.profiles
SET ghana_card_number = upper(trim(ghana_card_number))
WHERE ghana_card_number IS NOT NULL
  AND ghana_card_number <> upper(trim(ghana_card_number));

-- Add format constraint (immutable regex check is allowed)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_ghana_card_format_chk;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ghana_card_format_chk
  CHECK (
    ghana_card_number IS NULL
    OR ghana_card_number ~ '^GHA-[0-9]{9}-[0-9]$'
  )
  NOT VALID;

-- Validate, but don't fail the migration if legacy rows exist; they can be cleaned up via UI.
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_ghana_card_format_chk;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Some existing profiles.ghana_card_number values do not match GHA-XXXXXXXXX-X. New writes are still enforced.';
  END;
END $$;


-- Drop the plaintext code column from otp_codes (only code_hash is needed)
ALTER TABLE public.otp_codes DROP COLUMN IF EXISTS code;

-- Update the trigger function to no longer reference the code column
CREATE OR REPLACE FUNCTION public.hash_otp_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Hash the plaintext code (passed via code_hash temporarily) and store it
  -- The code is now passed directly into code_hash by the inserting function
  NEW.code_hash := encode(digest(NEW.code_hash, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

-- 1. Add code_hash column
ALTER TABLE public.otp_codes ADD COLUMN IF NOT EXISTS code_hash text;

-- 2. Create trigger function to hash OTP code on insert
CREATE OR REPLACE FUNCTION public.hash_otp_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Hash the plaintext code and store it
  NEW.code_hash := encode(digest(NEW.code, 'sha256'), 'hex');
  -- Clear plaintext code so it's never stored
  NEW.code := '******';
  RETURN NEW;
END;
$$;

CREATE TRIGGER hash_otp_before_insert
  BEFORE INSERT ON public.otp_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.hash_otp_code();

-- 3. Create server-side verify function
CREATE OR REPLACE FUNCTION public.verify_otp(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash text;
  _otp_id uuid;
BEGIN
  _hash := encode(digest(_code, 'sha256'), 'hex');
  
  SELECT id INTO _otp_id
  FROM public.otp_codes
  WHERE user_id = auth.uid()
    AND code_hash = _hash
    AND used = false
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF _otp_id IS NULL THEN
    RETURN false;
  END IF;
  
  UPDATE public.otp_codes SET used = true WHERE id = _otp_id;
  RETURN true;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.verify_otp(text) TO authenticated;

-- 4. Remove client-side UPDATE policy (verify_otp handles it now)
DROP POLICY IF EXISTS "Users can update own OTP codes" ON public.otp_codes;
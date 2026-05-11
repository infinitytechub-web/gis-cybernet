-- Admin 2FA audit log
CREATE TABLE IF NOT EXISTS public.mfa_challenge_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  staff_id text,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  failure_reason text,
  factor_id uuid,
  ip_address text,
  device_fingerprint text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_audit_user ON public.mfa_challenge_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mfa_audit_outcome ON public.mfa_challenge_audit(outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mfa_audit_created ON public.mfa_challenge_audit(created_at DESC);

ALTER TABLE public.mfa_challenge_audit ENABLE ROW LEVEL SECURITY;

-- Only admins can read
DROP POLICY IF EXISTS "Admins can view MFA audit" ON public.mfa_challenge_audit;
CREATE POLICY "Admins can view MFA audit"
ON public.mfa_challenge_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Block direct inserts/updates/deletes; only the SECURITY DEFINER RPC may write.
DROP POLICY IF EXISTS "No direct writes to MFA audit" ON public.mfa_challenge_audit;
CREATE POLICY "No direct writes to MFA audit"
ON public.mfa_challenge_audit
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- Insert RPC (SECURITY DEFINER) — callable by any authenticated user about
-- their own MFA attempt. Caller cannot spoof user_id; we always use auth.uid().
CREATE OR REPLACE FUNCTION public.record_mfa_challenge(
  _outcome text,
  _failure_reason text DEFAULT NULL,
  _factor_id uuid DEFAULT NULL,
  _staff_id text DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _device_fingerprint text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _outcome NOT IN ('success', 'failure') THEN
    RAISE EXCEPTION 'invalid outcome';
  END IF;

  INSERT INTO public.mfa_challenge_audit (
    user_id, staff_id, outcome, failure_reason, factor_id,
    ip_address, device_fingerprint, user_agent
  ) VALUES (
    auth.uid(),
    NULLIF(trim(_staff_id), ''),
    _outcome,
    NULLIF(trim(_failure_reason), ''),
    _factor_id,
    NULLIF(trim(_ip_address), ''),
    NULLIF(trim(_device_fingerprint), ''),
    NULLIF(trim(_user_agent), '')
  )
  RETURNING id INTO _id;

  RETURN _id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'record_mfa_challenge failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_mfa_challenge(text, text, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_mfa_challenge(text, text, uuid, text, text, text, text) TO authenticated;
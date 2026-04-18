-- =========================================================================
-- 1) FIX: OTP self-insert bypass
-- =========================================================================

DROP POLICY IF EXISTS "System can insert OTP codes" ON public.otp_codes;
-- No INSERT policy => clients cannot insert. Use the function below instead.

-- Server-side issuer: generates a random 6-digit code, hashes it, stores it,
-- and returns the plaintext code so the caller can deliver it (e.g. email/SMS).
CREATE OR REPLACE FUNCTION public.issue_otp(_purpose text DEFAULT 'login', _ttl_minutes integer DEFAULT 10)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _code text;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 6-digit zero-padded random code
  _code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  -- Insert; the existing hash_otp_code() trigger will SHA-256 the value in code_hash.
  INSERT INTO public.otp_codes (user_id, code_hash, purpose, expires_at, used)
  VALUES (_uid, _code, COALESCE(_purpose, 'login'), now() + make_interval(mins => GREATEST(1, _ttl_minutes)), false);

  RETURN _code;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_otp(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_otp(text, integer) TO authenticated;

-- =========================================================================
-- 2) FIX: vendors and suppliers broadly readable
-- =========================================================================

DROP POLICY IF EXISTS "View vendors" ON public.procurement_vendors;
CREATE POLICY "Procurement roles view vendors"
ON public.procurement_vendors
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'staff_officer'::app_role)
  OR public.has_role(auth.uid(), 'procurement_officer'::app_role)
  OR public.has_role(auth.uid(), 'storekeeper'::app_role)
);

DROP POLICY IF EXISTS "View suppliers" ON public.inventory_suppliers;
CREATE POLICY "Procurement roles view suppliers"
ON public.inventory_suppliers
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'staff_officer'::app_role)
  OR public.has_role(auth.uid(), 'procurement_officer'::app_role)
  OR public.has_role(auth.uid(), 'storekeeper'::app_role)
);

-- =========================================================================
-- 3) FIX: inventory_issuance / inventory_movements broadly readable
-- =========================================================================

DROP POLICY IF EXISTS "View issuance" ON public.inventory_issuance;
CREATE POLICY "Privileged roles or owner view issuance"
ON public.inventory_issuance
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'staff_officer'::app_role)
  OR public.has_role(auth.uid(), 'storekeeper'::app_role)
  OR public.has_role(auth.uid(), 'procurement_officer'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = inventory_issuance.profile_id
      AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "View movements" ON public.inventory_movements;
CREATE POLICY "Privileged roles or actor view movements"
ON public.inventory_movements
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'staff_officer'::app_role)
  OR public.has_role(auth.uid(), 'storekeeper'::app_role)
  OR public.has_role(auth.uid(), 'procurement_officer'::app_role)
  OR performed_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = inventory_movements.issued_to_profile_id
      AND p.user_id = auth.uid()
  )
);

-- =========================================================================
-- 4) FIX: bare "notifications" realtime topic not restricted
-- =========================================================================

CREATE OR REPLACE FUNCTION public.is_sensitive_realtime_topic(_topic text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _topic = ANY (ARRAY[
    'visa_applications',
    'visa_extensions',
    'passport_applications',
    'official_applications',
    'enquiry_applications',
    'enforcement_operations',
    'operations',
    'report_uploads',
    'frontdesk-rt',
    'processing-rt',
    'reports-rt',
    'enforcement-rt',
    'operations-rt',
    'misd-rt',
    'notifications'
  ]);
$$;
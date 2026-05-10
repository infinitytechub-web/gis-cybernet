-- ════════════════════════════════════════════════════════════════════
-- Harden MFA backup codes: bcrypt hashing + admin-only + AAL2 to mint
-- ════════════════════════════════════════════════════════════════════

-- 1. Tighten read policy: owner only, and must hold admin role.
DROP POLICY IF EXISTS "Owner read backup codes" ON public.mfa_backup_codes;
CREATE POLICY "Admin owner read backup codes" ON public.mfa_backup_codes
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Block all client writes — only SECURITY DEFINER functions may mutate.
DROP POLICY IF EXISTS "No direct writes backup codes" ON public.mfa_backup_codes;
CREATE POLICY "No direct writes backup codes" ON public.mfa_backup_codes
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- 2. Drop any pre-existing SHA-256 codes — they cannot be re-verified
--    against bcrypt. Affected admins must regenerate. Logged for audit.
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.mfa_backup_codes;
  IF v_count > 0 THEN
    DELETE FROM public.mfa_backup_codes;
    PERFORM public.log_security_event(
      'mfa','backup_codes_rehash_purge','warn', NULL,
      jsonb_build_object('purged', v_count,
        'reason','Upgraded hash to bcrypt; admins must regenerate')
    );
  END IF;
END $$;

-- 3. Re-issue codes — bcrypt-hashed (per-row salt baked in).
--    Requires: authenticated + admin role + AAL2 session.
CREATE OR REPLACE FUNCTION public.mfa_generate_backup_codes()
RETURNS TABLE(code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  i integer; v_code text; v_hash text; v_aal text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Auth required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    PERFORM public.log_security_event(
      'mfa','backup_codes_generate_denied','high', NULL,
      jsonb_build_object('reason','non-admin')
    );
    RAISE EXCEPTION 'Only administrators may generate backup codes'
      USING ERRCODE = '42501';
  END IF;

  v_aal := COALESCE(auth.jwt()->>'aal', 'aal1');
  IF v_aal <> 'aal2' THEN
    PERFORM public.log_security_event(
      'mfa','backup_codes_generate_denied','high', NULL,
      jsonb_build_object('reason','aal1_session')
    );
    RAISE EXCEPTION 'A verified 2FA session (AAL2) is required to generate backup codes'
      USING ERRCODE = '42501';
  END IF;

  -- Invalidate existing
  DELETE FROM public.mfa_backup_codes WHERE user_id = auth.uid();

  FOR i IN 1..10 LOOP
    -- 12-char hex code formatted as XXXX-XXXX-XXXX (~48 bits entropy)
    v_code := lower(encode(extensions.gen_random_bytes(6),'hex'));
    v_code := substring(v_code from 1 for 4) || '-' ||
              substring(v_code from 5 for 4) || '-' ||
              substring(v_code from 9 for 4);

    -- bcrypt: per-row salt + adaptive cost (10) — slow to brute force
    v_hash := extensions.crypt(v_code, extensions.gen_salt('bf', 10));

    INSERT INTO public.mfa_backup_codes (user_id, code_hash)
      VALUES (auth.uid(), v_hash);

    code := v_code;
    RETURN NEXT;
  END LOOP;

  PERFORM public.log_security_event(
    'mfa','backup_codes_generated','warn', NULL,
    jsonb_build_object('count',10,'algo','bcrypt')
  );
END
$$;
REVOKE ALL ON FUNCTION public.mfa_generate_backup_codes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_generate_backup_codes() TO authenticated;

-- 4. Consume — admin role required, AAL2 NOT required (this is the
--    recovery path used when the authenticator is lost).
CREATE OR REPLACE FUNCTION public.mfa_consume_backup_code(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_norm text; v_id uuid; v_hash text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Auth required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    PERFORM public.log_security_event(
      'mfa','backup_code_denied','high', NULL,
      jsonb_build_object('reason','non-admin')
    );
    RAISE EXCEPTION 'Only administrators may use backup codes'
      USING ERRCODE = '42501';
  END IF;

  v_norm := lower(btrim(_code));

  -- Linear scan over this admin's unused codes (≤10) and bcrypt-verify each.
  -- Constant-time per row inside crypt(); set is tiny.
  FOR v_id, v_hash IN
    SELECT id, code_hash
      FROM public.mfa_backup_codes
     WHERE user_id = auth.uid()
       AND used_at IS NULL
  LOOP
    IF extensions.crypt(v_norm, v_hash) = v_hash THEN
      UPDATE public.mfa_backup_codes
         SET used_at = now()
       WHERE id = v_id;
      PERFORM public.log_security_event(
        'mfa','backup_code_used','warn', NULL, '{}'::jsonb
      );
      RETURN true;
    END IF;
  END LOOP;

  PERFORM public.log_security_event(
    'mfa','backup_code_failed','high', NULL, '{}'::jsonb
  );
  RETURN false;
END
$$;
REVOKE ALL ON FUNCTION public.mfa_consume_backup_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_consume_backup_code(text) TO authenticated;
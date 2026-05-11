CREATE OR REPLACE FUNCTION public.admin_recovery_consume_backup_code(_user_id uuid, _code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_norm text; v_id uuid; v_hash text;
BEGIN
  IF _user_id IS NULL OR _code IS NULL OR length(btrim(_code)) = 0 THEN
    RETURN false;
  END IF;

  -- Caller must be an admin (verified by user_roles).
  IF NOT public.has_role(_user_id, 'admin'::app_role) THEN
    PERFORM public.log_security_event(
      'mfa','admin_recovery_backup_code_denied','high', NULL,
      jsonb_build_object('reason','target-not-admin','user_id',_user_id)
    );
    RETURN false;
  END IF;

  v_norm := lower(btrim(_code));

  FOR v_id, v_hash IN
    SELECT id, code_hash
      FROM public.mfa_backup_codes
     WHERE user_id = _user_id
       AND used_at IS NULL
  LOOP
    IF extensions.crypt(v_norm, v_hash) = v_hash THEN
      UPDATE public.mfa_backup_codes
         SET used_at = now()
       WHERE id = v_id;
      PERFORM public.log_security_event(
        'mfa','admin_recovery_backup_code_used','warn', NULL,
        jsonb_build_object('user_id',_user_id)
      );
      RETURN true;
    END IF;
  END LOOP;

  PERFORM public.log_security_event(
    'mfa','admin_recovery_backup_code_failed','high', NULL,
    jsonb_build_object('user_id',_user_id)
  );
  RETURN false;
END
$$;

REVOKE ALL ON FUNCTION public.admin_recovery_consume_backup_code(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recovery_consume_backup_code(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_recovery_consume_backup_code(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_recovery_consume_backup_code(uuid, text) TO service_role;
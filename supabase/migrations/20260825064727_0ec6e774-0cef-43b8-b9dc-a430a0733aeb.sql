CREATE OR REPLACE FUNCTION public.mfa_generate_backup_codes()
RETURNS TABLE(code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  i integer; v_code text; v_hash text; v_aal text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Auth required' USING ERRCODE = '42501';
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

  DELETE FROM public.mfa_backup_codes WHERE user_id = auth.uid();

  FOR i IN 1..10 LOOP
    v_code := lower(encode(extensions.gen_random_bytes(6),'hex'));
    v_code := substring(v_code from 1 for 4) || '-' ||
              substring(v_code from 5 for 4) || '-' ||
              substring(v_code from 9 for 4);
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
$function$;

CREATE OR REPLACE FUNCTION public.mfa_consume_backup_code(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_norm text; v_id uuid; v_hash text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Auth required' USING ERRCODE = '42501';
  END IF;

  v_norm := lower(btrim(_code));

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
$function$;
CREATE OR REPLACE FUNCTION public.webauthn_admin_reset_user(_user_id uuid, _reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
  _cred record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators may reset biometric enrollment for other staff.';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'A staff member must be specified.';
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required.';
  END IF;

  FOR _cred IN
    SELECT id, credential_id, device_label
      FROM public.webauthn_credentials
     WHERE user_id = _user_id AND revoked_at IS NULL
  LOOP
    UPDATE public.webauthn_credentials
       SET revoked_at = now(), revoked_by = auth.uid()
     WHERE id = _cred.id;

    INSERT INTO public.webauthn_audit (event, user_id, credential_id, device_label, detail, actor_id)
    VALUES ('revoke', _user_id, _cred.credential_id, _cred.device_label,
            'Admin reset: ' || btrim(_reason), auth.uid());

    _count := _count + 1;
  END LOOP;

  INSERT INTO public.webauthn_audit (event, user_id, detail, actor_id)
  VALUES ('settings_change', _user_id,
          'Admin reset biometric enrollment (' || _count || ' device(s) removed): ' || btrim(_reason),
          auth.uid());

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.webauthn_admin_reset_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_admin_reset_user(uuid, text) TO authenticated, service_role;
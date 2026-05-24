
-- Harden log_security_event against audit log poisoning.
-- Validates category/severity/action via allow-lists and regex,
-- caps lengths, and only accepts an _ip when called by service_role
-- (regular authenticated callers can no longer spoof source IPs).
CREATE OR REPLACE FUNCTION public.log_security_event(
  _category text,
  _action text,
  _severity text DEFAULT 'info',
  _subject text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb,
  _ip text DEFAULT NULL,
  _ua text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_label text;
  v_ip text;
  v_ua text;
  v_subject text;
  v_role text := current_setting('request.jwt.claim.role', true);
  ALLOWED_CATEGORIES constant text[] := ARRAY[
    'firewall','account','export','mfa','quarantine','dlp'
  ];
  ALLOWED_SEVERITY constant text[] := ARRAY['info','warn','high','critical'];
BEGIN
  IF _category IS NULL OR NOT (_category = ANY (ALLOWED_CATEGORIES)) THEN
    RAISE EXCEPTION 'invalid category: %', _category USING ERRCODE = '22023';
  END IF;

  IF _severity IS NULL OR NOT (_severity = ANY (ALLOWED_SEVERITY)) THEN
    RAISE EXCEPTION 'invalid severity: %', _severity USING ERRCODE = '22023';
  END IF;

  IF _action IS NULL OR _action !~ '^[a-z0-9_.\-]{1,80}$' THEN
    RAISE EXCEPTION 'invalid action: %', _action USING ERRCODE = '22023';
  END IF;

  v_subject := left(coalesce(_subject, ''), 200);
  IF v_subject = '' THEN v_subject := NULL; END IF;

  -- Only privileged callers (service_role / definer-internal PERFORM) may
  -- supply IP / UA. For regular authenticated users we drop the client values
  -- so the audit log cannot be polluted with spoofed origins.
  IF v_role = 'service_role' THEN
    v_ip := left(coalesce(_ip, ''), 64);
    v_ua := left(coalesce(_ua, ''), 240);
    IF v_ip = '' THEN v_ip := NULL; END IF;
    IF v_ua = '' THEN v_ua := NULL; END IF;
  ELSE
    v_ip := NULL;
    -- UA is low-risk metadata, still capped.
    v_ua := nullif(left(coalesce(_ua, ''), 240), '');
  END IF;

  SELECT first_name||' '||last_name INTO v_label
  FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.security_audit_log
    (category, action, severity, actor_id, actor_label, subject, details, ip_address, user_agent, row_hash)
  VALUES
    (_category, _action, _severity, auth.uid(), v_label, v_subject,
     coalesce(_details,'{}'::jsonb), v_ip, v_ua, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END
$function$;

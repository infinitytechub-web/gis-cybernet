-- Password rules for display on password forms (no sensitive data)
CREATE OR REPLACE FUNCTION public.get_password_policy()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'min_length', min_password_length,
    'require_upper', password_require_upper,
    'require_lower', password_require_lower,
    'require_number', password_require_number,
    'require_symbol', password_require_symbol,
    'min_strength', password_min_strength
  )
  FROM public.app_settings
  ORDER BY created_at
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_password_policy() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_password_policy() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_password_policy() TO authenticated, service_role;

-- Whether MFA is required for the calling user, and when any grace period ends
CREATE OR REPLACE FUNCTION public.my_mfa_policy()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_roles text[];
  v_required_roles text[];
  v_grace_days integer;
  v_created timestamptz;
  v_required boolean;
  v_grace_ends timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('required', false, 'grace_ends_at', NULL, 'in_grace', false);
  END IF;

  SELECT COALESCE(mfa_required_roles, ARRAY[]::text[]), COALESCE(mfa_grace_days, 0)
    INTO v_required_roles, v_grace_days
  FROM public.app_settings ORDER BY created_at LIMIT 1;

  SELECT array_agg(role::text) INTO v_roles
  FROM public.user_roles WHERE user_id = v_uid;

  v_required := COALESCE(v_roles, ARRAY[]::text[]) && v_required_roles;

  SELECT created_at INTO v_created FROM public.profiles WHERE user_id = v_uid;

  IF v_required AND v_grace_days > 0 AND v_created IS NOT NULL THEN
    v_grace_ends := v_created + make_interval(days => v_grace_days);
  END IF;

  RETURN jsonb_build_object(
    'required', v_required,
    'grace_ends_at', v_grace_ends,
    'in_grace', v_grace_ends IS NOT NULL AND v_grace_ends > now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.my_mfa_policy() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_mfa_policy() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_mfa_policy() TO authenticated, service_role;
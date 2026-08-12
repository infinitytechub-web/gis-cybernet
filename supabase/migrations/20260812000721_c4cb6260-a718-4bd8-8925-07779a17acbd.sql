CREATE OR REPLACE FUNCTION public.command_capability_report(_target uuid)
RETURNS TABLE (
  capability text,
  effective boolean,
  source text,
  expires_at timestamptz,
  roles text[],
  is_command_tier boolean,
  authority_level integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles text[];
  v_tier boolean;
  v_level integer;
  v_caps text[] := ARRAY['*','detention','reports','attendance','roster','staff_admin','inventory','gps'];
  v_cap text;
  v_has_grant boolean;
  v_expires timestamptz;
BEGIN
  IF _target IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  IF auth.uid() IS DISTINCT FROM _target AND NOT public.can_manage_command_tier(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to inspect capabilities for other accounts';
  END IF;

  SELECT COALESCE(array_agg(ur.role::text ORDER BY ur.role::text), ARRAY[]::text[])
    INTO v_roles
  FROM public.user_roles ur
  WHERE ur.user_id = _target;

  v_tier := public.is_command_tier(_target);
  v_level := public.command_authority_level(_target);

  FOREACH v_cap IN ARRAY v_caps LOOP
    v_has_grant := false;
    v_expires := NULL;

    SELECT true, g.expires_at
      INTO v_has_grant, v_expires
    FROM public.command_tier_grants g
    WHERE g.user_id = _target
      AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now())
      AND (g.capability = v_cap OR g.capability = '*')
    ORDER BY (g.capability = v_cap) DESC, g.expires_at NULLS FIRST
    LIMIT 1;

    v_has_grant := COALESCE(v_has_grant, false);

    capability := v_cap;
    effective := public.has_command_capability(_target, v_cap);
    roles := v_roles;
    is_command_tier := v_tier;
    authority_level := v_level;

    IF NOT effective THEN
      source := 'none';
      expires_at := NULL;
    ELSIF v_tier OR NOT v_has_grant THEN
      source := 'role_tier';
      expires_at := NULL;
    ELSE
      source := 'grant';
      expires_at := v_expires;
    END IF;

    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.command_capability_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.command_capability_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.command_capability_report(uuid) TO service_role;
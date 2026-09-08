CREATE OR REPLACE FUNCTION public.my_command_context()
RETURNS TABLE (
  profile_id uuid,
  org_unit_id uuid,
  unit_name text,
  unit_code text,
  unit_type text,
  level text,
  scope text,
  shift_group text,
  can_view boolean,
  can_create boolean,
  can_edit boolean,
  can_delete boolean,
  can_download boolean,
  can_print boolean,
  can_vault boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile RECORD;
  v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT p.id, p.org_unit_id, p.shift_group
    INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = v_uid
  LIMIT 1;

  IF v_profile.id IS NULL THEN
    RETURN;
  END IF;

  v_admin := public.has_role(v_uid, 'admin');

  RETURN QUERY
  SELECT
    v_profile.id,
    v_profile.org_unit_id,
    u.name,
    u.code,
    u.type::text,
    COALESCE(r.level, CASE WHEN v_profile.org_unit_id IS NULL THEN NULL
                           ELSE public.directory_level_of_unit(v_profile.org_unit_id) END),
    CASE WHEN v_admin THEN 'all' ELSE COALESCE(r.scope, 'none') END,
    v_profile.shift_group,
    v_admin OR COALESCE(r.can_view, false),
    v_admin OR COALESCE(r.can_create, false),
    v_admin OR COALESCE(r.can_edit, false),
    v_admin OR COALESCE(r.can_delete, false),
    v_admin OR COALESCE(r.can_download, false),
    v_admin OR COALESCE(r.can_print, false),
    v_admin OR COALESCE(r.can_vault, false)
  FROM (SELECT 1) dummy
  LEFT JOIN public.org_units u ON u.id = v_profile.org_unit_id
  LEFT JOIN LATERAL public.directory_rights_at_unit(v_profile.id, v_profile.org_unit_id) r ON true;
END;
$$;

REVOKE ALL ON FUNCTION public.my_command_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_command_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_command_officers()
RETURNS TABLE (
  id uuid,
  staff_id text,
  first_name text,
  last_name text,
  rank_name text,
  department_name text,
  shift_group text,
  status text,
  photo_url text,
  org_unit_id uuid,
  unit_name text,
  is_self boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx RECORD;
  v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_ctx FROM public.my_command_context() LIMIT 1;
  IF v_ctx.profile_id IS NULL THEN
    RETURN;
  END IF;

  v_admin := public.has_role(v_uid, 'admin');

  -- Default deny: no posting, or the matrix View switch is off for this
  -- officer's role at their command's level, means no records at all.
  IF NOT v_admin AND (v_ctx.org_unit_id IS NULL OR NOT v_ctx.can_view) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.staff_id,
    p.first_name,
    p.last_name,
    rk.name,
    d.name,
    p.shift_group,
    p.status::text,
    p.photo_url,
    p.org_unit_id,
    u.name,
    (p.id = v_ctx.profile_id)
  FROM public.profiles p
  LEFT JOIN public.ranks rk ON rk.id = p.rank_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.org_units u ON u.id = p.org_unit_id
  WHERE
    CASE
      WHEN v_admin OR v_ctx.scope = 'all' THEN true
      WHEN v_ctx.scope = 'self' THEN p.id = v_ctx.profile_id
      WHEN v_ctx.scope = 'shift' THEN
        p.org_unit_id = v_ctx.org_unit_id
        AND v_ctx.shift_group IS NOT NULL
        AND p.shift_group = v_ctx.shift_group
      WHEN v_ctx.scope = 'own_subtree' THEN
        p.org_unit_id IN (
          WITH RECURSIVE sub AS (
            SELECT id FROM public.org_units WHERE id = v_ctx.org_unit_id
            UNION ALL
            SELECT c.id FROM public.org_units c JOIN sub s ON c.parent_id = s.id
          )
          SELECT id FROM sub
        )
      WHEN v_ctx.scope = 'own_unit' THEN p.org_unit_id = v_ctx.org_unit_id
      ELSE p.id = v_ctx.profile_id
    END
  ORDER BY p.last_name, p.first_name;
END;
$$;

REVOKE ALL ON FUNCTION public.my_command_officers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_command_officers() TO authenticated;
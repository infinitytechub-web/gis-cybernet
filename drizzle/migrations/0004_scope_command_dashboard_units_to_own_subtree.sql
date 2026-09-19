CREATE OR REPLACE FUNCTION public.command_dashboard_units()
RETURNS TABLE(id uuid, name text, type text, officer_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
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

  IF NOT v_admin AND (v_ctx.org_unit_id IS NULL OR NOT v_ctx.can_view) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE access_subtree AS (
    SELECT u0.id AS unit_id FROM public.org_units u0 WHERE u0.id = v_ctx.org_unit_id
    UNION ALL
    SELECT c.id AS unit_id FROM public.org_units c JOIN access_subtree s ON c.parent_id = s.unit_id
    WHERE c.is_active
  ),
  allowed AS (
    SELECT u.id AS unit_id, u.name AS unit_name, u.type::text AS unit_type
    FROM public.org_units u
    WHERE u.is_active
      AND CASE
        -- Administrators see every command; everyone else is bounded by their
        -- own command and its sub-units, whatever their directory scope label.
        WHEN v_admin THEN true
        WHEN v_ctx.scope IN ('all', 'own_subtree') THEN u.id IN (SELECT s2.unit_id FROM access_subtree s2)
        WHEN v_ctx.scope IN ('own_unit', 'shift', 'self') THEN u.id = v_ctx.org_unit_id
        ELSE false
      END
  )
  SELECT a.unit_id, a.unit_name, a.unit_type,
    (
      WITH RECURSIVE selected_subtree AS (
        SELECT a.unit_id AS unit_id
        UNION ALL
        SELECT c.id FROM public.org_units c
        JOIN selected_subtree s ON c.parent_id = s.unit_id
        WHERE c.is_active
      )
      SELECT count(*)::integer
      FROM public.profiles p
      WHERE p.org_unit_id IN (SELECT st.unit_id FROM selected_subtree st)
    )
  FROM allowed a
  ORDER BY a.unit_name;
END;
$function$;
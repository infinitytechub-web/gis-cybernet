CREATE OR REPLACE FUNCTION public.leave_due_overview(_org_unit_id uuid DEFAULT NULL::uuid)
RETURNS TABLE (
  profile_id uuid,
  staff_id text,
  full_name text,
  rank_name text,
  unit_name text,
  grade text,
  entitlement numeric,
  taken numeric,
  remaining numeric,
  last_leave_end date,
  state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctx record;
  v_admin boolean := has_role(auth.uid(), 'admin'::app_role);
  v_year int := extract(year FROM now())::int;
  v_month int := extract(month FROM now())::int;
BEGIN
  SELECT * INTO v_ctx FROM public.my_command_context();

  IF v_ctx.profile_id IS NULL AND NOT v_admin THEN
    RETURN;
  END IF;

  -- A named command must be inside the caller's dashboard scope.
  IF _org_unit_id IS NOT NULL AND NOT v_admin
     AND NOT EXISTS (SELECT 1 FROM public.command_dashboard_units() cu WHERE cu.id = _org_unit_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE unit_tree AS (
    SELECT u.id AS unit_id
    FROM public.org_units u
    WHERE u.is_active
      AND u.id = COALESCE(_org_unit_id, v_ctx.org_unit_id)
    UNION ALL
    SELECT c.id
    FROM public.org_units c
    JOIN unit_tree t ON c.parent_id = t.unit_id
    WHERE c.is_active
  ),
  scoped AS (
    SELECT p.id, p.staff_id, p.first_name, p.last_name, p.rank_id, p.org_unit_id, p.shift_group
    FROM public.profiles p
    WHERE p.status::text IN ('active', 'partially_active')
      AND (
        -- Whole service when an admin asks without naming a command.
        (v_admin AND _org_unit_id IS NULL)
        OR p.org_unit_id IN (SELECT t.unit_id FROM unit_tree t)
      )
      AND CASE
        WHEN v_admin OR v_ctx.scope IN ('all', 'own_unit', 'own_subtree') THEN true
        WHEN v_ctx.scope = 'shift' THEN v_ctx.shift_group IS NOT NULL AND p.shift_group = v_ctx.shift_group
        WHEN v_ctx.scope = 'self' THEN p.id = v_ctx.profile_id
        ELSE false
      END
  ),
  graded AS (
    SELECT s.*,
      CASE WHEN COALESCE(rk.level, 99) <= 8 THEN 'senior' ELSE 'junior' END AS grade,
      rk.name AS rank_name,
      ou.name AS unit_name
    FROM scoped s
    LEFT JOIN public.ranks rk ON rk.id = s.rank_id
    LEFT JOIN public.org_units ou ON ou.id = s.org_unit_id
  ),
  taken_days AS (
    SELECT l.profile_id AS pid,
      COALESCE(sum(public.leave_working_days(l.start_date, l.end_date)), 0) AS days,
      max(l.end_date) AS last_end
    FROM public.leave_requests l
    WHERE l.type::text = 'annual'
      AND l.status::text = 'approved'
      AND l.start_date >= make_date(v_year, 1, 1)
      AND l.start_date <= make_date(v_year, 12, 31)
    GROUP BY l.profile_id
  )
  SELECT
    g.id,
    g.staff_id,
    btrim(COALESCE(g.last_name, '') || ', ' || COALESCE(g.first_name, '')),
    g.rank_name,
    g.unit_name,
    g.grade,
    ent.days AS entitlement,
    COALESCE(td.days, 0) AS taken,
    GREATEST(ent.days - COALESCE(td.days, 0), 0) AS remaining,
    td.last_end,
    CASE
      WHEN GREATEST(ent.days - COALESCE(td.days, 0), 0) = 0 THEN 'taken'
      WHEN v_month >= 10 THEN 'overdue'
      WHEN v_month >= 6 AND COALESCE(td.days, 0) = 0 THEN 'due'
      ELSE 'on_track'
    END
  FROM graded g
  LEFT JOIN taken_days td ON td.pid = g.id
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (SELECT e.days FROM public.leave_entitlements e
        WHERE e.leave_type::text = 'annual' AND e.year = v_year
          AND lower(COALESCE(e.grade, '')) = g.grade LIMIT 1),
      (SELECT e.days FROM public.leave_entitlements e
        WHERE e.leave_type::text = 'annual'
          AND lower(COALESCE(e.grade, '')) = g.grade
        ORDER BY e.year DESC LIMIT 1),
      (SELECT e.days FROM public.leave_entitlements e
        WHERE e.leave_type::text = 'annual' AND e.grade IS NULL
        ORDER BY e.year DESC LIMIT 1),
      CASE WHEN g.grade = 'senior' THEN 36 ELSE 28 END
    ) AS days
  ) ent
  ORDER BY GREATEST(ent.days - COALESCE(td.days, 0), 0) DESC,
           btrim(COALESCE(g.last_name, '') || ', ' || COALESCE(g.first_name, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.leave_due_overview(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.leave_due_overview(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.leave_due_overview(uuid) TO authenticated, service_role;
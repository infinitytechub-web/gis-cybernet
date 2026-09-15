CREATE OR REPLACE FUNCTION public.command_dashboard_live(_org_unit_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx record;
  v_unit uuid;
  v_admin boolean := has_role(auth.uid(), 'admin'::app_role);
  v_month_start date := date_trunc('month', now())::date;
  v_result jsonb;
BEGIN
  SELECT * INTO v_ctx FROM public.my_command_context();

  IF v_ctx.profile_id IS NULL AND NOT v_admin THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_profile');
  END IF;

  v_unit := COALESCE(_org_unit_id, v_ctx.org_unit_id);

  IF v_unit IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_unit');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.command_dashboard_units() cu WHERE cu.id = v_unit) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'out_of_scope');
  END IF;

  WITH RECURSIVE unit_tree AS (
    SELECT u.id AS unit_id
    FROM public.org_units u
    WHERE u.id = v_unit AND u.is_active
    UNION ALL
    SELECT c.id
    FROM public.org_units c
    JOIN unit_tree t ON c.parent_id = t.unit_id
    WHERE c.is_active
  ),
  scoped AS (
    SELECT p.*
    FROM public.profiles p
    WHERE p.org_unit_id IN (SELECT t.unit_id FROM unit_tree t)
      AND CASE
        WHEN v_admin OR v_ctx.scope IN ('all', 'own_unit', 'own_subtree') THEN true
        WHEN v_ctx.scope = 'shift' THEN v_ctx.shift_group IS NOT NULL AND p.shift_group = v_ctx.shift_group
        WHEN v_ctx.scope = 'self' THEN p.id = v_ctx.profile_id
        ELSE false
      END
  ),
  positions AS (
    SELECT op.*
    FROM public.org_positions op
    WHERE op.is_active
      AND op.org_unit_id IN (SELECT t.unit_id FROM unit_tree t)
  ),
  establishment AS (
    SELECT COALESCE(sum(u.authorised_strength), 0)::int AS authorised
    FROM public.org_units u
    WHERE u.id IN (SELECT t.unit_id FROM unit_tree t)
  ),
  strength AS (
    SELECT count(*)::int AS posted
    FROM scoped s
    WHERE s.status::text IN ('active', 'partially_active')
  )
  SELECT jsonb_build_object(
    'allowed', true,
    'unit', (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'type', u.type::text) FROM public.org_units u WHERE u.id = v_unit),
    'month_start', v_month_start,
    'totals', jsonb_build_object(
      'officers', (SELECT count(*) FROM scoped),
      'active', (SELECT count(*) FROM scoped s WHERE s.status::text = 'active'),
      'authorised_strength', (SELECT authorised FROM establishment),
      'posted_strength', (SELECT posted FROM strength),
      'positions', GREATEST((SELECT authorised FROM establishment), (SELECT count(*)::int FROM positions)),
      'vacancies', GREATEST((SELECT authorised FROM establishment) - (SELECT posted FROM strength), 0),
      'unfilled_appointments', (
        SELECT count(*) FROM positions op
        WHERE op.holder_profile_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM scoped s WHERE s.id = op.holder_profile_id)
      ),
      'portal_reached', (
        SELECT count(DISTINCT l.actor_profile_id)
        FROM public.staff_access_log l
        WHERE l.action = 'portal' AND l.created_at >= v_month_start
          AND l.actor_profile_id IN (SELECT s.id FROM scoped s)
      )
    ),
    'officers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'staff_id', s.staff_id,
        'name', btrim(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')),
        'rank', rk.name,
        'shift_group', s.shift_group,
        'status', s.status::text,
        'photo_url', s.photo_url,
        'position_title', (
          SELECT op.title FROM positions op
          WHERE op.holder_profile_id = s.id
          ORDER BY op.sort_order NULLS LAST LIMIT 1
        ),
        'portal_visits', (
          SELECT count(*) FROM public.staff_access_log l
          WHERE l.action = 'portal' AND l.actor_profile_id = s.id AND l.created_at >= v_month_start
        ),
        'last_portal_at', (
          SELECT max(l.created_at) FROM public.staff_access_log l
          WHERE l.action = 'portal' AND l.actor_profile_id = s.id AND l.created_at >= v_month_start
        )
      ) ORDER BY s.last_name, s.first_name)
      FROM scoped s
      LEFT JOIN public.ranks rk ON rk.id = s.rank_id
    ), '[]'::jsonb),
    -- Rank breakdown honours the per-command rank visibility settings.
    'ranks', COALESCE((
      SELECT jsonb_agg(r) FROM (
        SELECT jsonb_build_object(
          'rank', COALESCE(rk.name, 'Unassigned'),
          'level', rk.level,
          'officers', count(*)
        ) AS r
        FROM scoped s
        LEFT JOIN public.ranks rk ON rk.id = s.rank_id
        WHERE rk.id IS NULL OR public.rank_visible_on_dashboard(v_unit, rk.id)
        GROUP BY rk.name, rk.level
        ORDER BY rk.level NULLS LAST, count(*) DESC
      ) q
    ), '[]'::jsonb),
    'vacancies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', op.id,
        'title', op.title,
        'level', op.position_level::text,
        'notes', op.notes
      ) ORDER BY op.sort_order NULLS LAST, op.title)
      FROM positions op
      WHERE op.holder_profile_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM scoped s WHERE s.id = op.holder_profile_id)
    ), '[]'::jsonb),
    'posted_positions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', op.id,
        'title', op.title,
        'level', op.position_level::text,
        'holder', btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
        'holder_rank', rk.name,
        'start_date', op.start_date
      ) ORDER BY op.sort_order NULLS LAST, op.title)
      FROM positions op
      JOIN scoped p ON p.id = op.holder_profile_id
      LEFT JOIN public.ranks rk ON rk.id = p.rank_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
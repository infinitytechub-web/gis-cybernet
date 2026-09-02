-- lock down the trigger helper from the previous migration
REVOKE ALL ON FUNCTION public.me_enforce_expenditure_sod() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.me_enforce_expenditure_sod() TO service_role;

-- ---------- measure achievement ----------
CREATE OR REPLACE FUNCTION public.me_measure_achievement(_measure_id uuid, _period_id uuid DEFAULT NULL)
RETURNS TABLE (
  measure_id uuid, period_id uuid, target_value numeric, reported_value numeric,
  verified_value numeric, achievement_percent numeric, variance numeric, performance_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.me_measures m WHERE m.id = _measure_id
                 AND public.me_can_view(m.classification, m.org_unit_id)) THEN
    RAISE EXCEPTION 'Not authorised for this measure';
  END IF;

  RETURN QUERY
  WITH m AS (SELECT * FROM public.me_measures WHERE id = _measure_id)
  SELECT
    t.measure_id, t.period_id, t.target_value,
    r.reported_value, r.verified_value,
    CASE WHEN t.target_value IS NULL OR t.target_value = 0 THEN NULL
         WHEN (SELECT direction FROM m) = 'decrease'
           THEN round((t.target_value / NULLIF(coalesce(r.verified_value, r.reported_value), 0)) * 100, 2)
         ELSE round((coalesce(r.verified_value, r.reported_value) / t.target_value) * 100, 2) END,
    coalesce(r.verified_value, r.reported_value) - t.target_value,
    CASE
      WHEN coalesce(r.verified_value, r.reported_value) IS NULL THEN 'no_data'
      WHEN t.target_value IS NULL OR t.target_value = 0 THEN 'no_target'
      ELSE (
        SELECT CASE
          WHEN pct >= (SELECT threshold_green FROM m) THEN 'on_track'
          WHEN pct >= (SELECT threshold_amber FROM m) THEN 'at_risk'
          ELSE 'off_track' END
        FROM (SELECT CASE WHEN (SELECT direction FROM m) = 'decrease'
                     THEN (t.target_value / NULLIF(coalesce(r.verified_value, r.reported_value),0)) * 100
                     ELSE (coalesce(r.verified_value, r.reported_value) / t.target_value) * 100 END AS pct) s
      )
    END
  FROM public.me_targets t
  LEFT JOIN public.me_results r ON r.measure_id = t.measure_id AND r.period_id = t.period_id
  WHERE t.measure_id = _measure_id
    AND (_period_id IS NULL OR t.period_id = _period_id);
END;
$$;
REVOKE ALL ON FUNCTION public.me_measure_achievement(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_measure_achievement(uuid, uuid) TO authenticated, service_role;

-- ---------- project health ----------
CREATE OR REPLACE FUNCTION public.me_project_health(_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p record;
  w jsonb;
  schedule_s numeric := 0; budget_s numeric := 0; task_s numeric := 0;
  risk_s numeric := 0; milestone_s numeric := 0; measure_s numeric := 0; reporting_s numeric := 0;
  total numeric := 0; label text;
  spent numeric; budget numeric; elapsed numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO p FROM public.me_projects WHERE id = _project_id;
  IF p IS NULL THEN RETURN NULL; END IF;
  IF NOT public.me_can_view(p.classification, p.org_unit_id) THEN
    RAISE EXCEPTION 'Not authorised for this project';
  END IF;

  SELECT coalesce((SELECT value FROM public.me_settings WHERE key = 'project_health_weights'),
    '{"schedule":20,"budget":15,"tasks":20,"risk":10,"milestones":15,"measures":15,"reporting":5}'::jsonb)
  INTO w;

  -- schedule: planned elapsed vs percent complete
  IF p.start_date IS NOT NULL AND p.end_date IS NOT NULL AND p.end_date > p.start_date THEN
    elapsed := least(1, greatest(0, (current_date - p.start_date)::numeric / (p.end_date - p.start_date)::numeric)) * 100;
    schedule_s := greatest(0, least(100, 100 - greatest(0, elapsed - coalesce(p.percent_complete,0))));
  ELSE schedule_s := 50; END IF;

  -- budget: utilisation vs elapsed
  budget := coalesce(p.revised_budget_amount, p.budget_amount);
  SELECT coalesce(sum(amount),0) INTO spent FROM public.me_expenditures
    WHERE project_id = _project_id AND expenditure_type = 'actual';
  IF budget IS NULL OR budget = 0 THEN budget_s := 50;
  ELSE budget_s := greatest(0, least(100, 100 - greatest(0, (spent / budget * 100) - coalesce(p.percent_complete, 0)))); END IF;

  -- tasks
  SELECT coalesce(round(avg(percent_complete), 2), 0) INTO task_s FROM public.me_tasks
    WHERE project_id = _project_id AND archived_at IS NULL;

  -- risk exposure (max score 25 -> inverted)
  SELECT greatest(0, 100 - coalesce(max(risk_score), 0) * 4) INTO risk_s FROM public.me_risks
    WHERE project_id = _project_id AND status <> 'closed';

  -- milestones
  SELECT CASE WHEN count(*) = 0 THEN 50
              ELSE round(count(*) FILTER (WHERE status = 'achieved')::numeric * 100 / count(*), 2) END
    INTO milestone_s FROM public.me_milestones WHERE project_id = _project_id;

  -- measures achievement
  SELECT coalesce(round(avg(least(120, pct)), 2), 50) INTO measure_s FROM (
    SELECT CASE WHEN t.target_value IS NULL OR t.target_value = 0 THEN NULL
                ELSE (coalesce(r.verified_value, r.reported_value) / t.target_value) * 100 END AS pct
    FROM public.me_measures m
    JOIN public.me_targets t ON t.measure_id = m.id
    LEFT JOIN public.me_results r ON r.measure_id = m.id AND r.period_id = t.period_id
    WHERE m.project_id = _project_id
  ) s WHERE pct IS NOT NULL;

  -- reporting compliance: verified field reports share
  SELECT CASE WHEN count(*) = 0 THEN 50
              ELSE round(count(*) FILTER (WHERE status IN ('verified','approved'))::numeric * 100 / count(*), 2) END
    INTO reporting_s FROM public.me_field_reports WHERE project_id = _project_id;

  total := round((
      schedule_s  * coalesce((w->>'schedule')::numeric, 0)
    + budget_s    * coalesce((w->>'budget')::numeric, 0)
    + task_s      * coalesce((w->>'tasks')::numeric, 0)
    + risk_s      * coalesce((w->>'risk')::numeric, 0)
    + milestone_s * coalesce((w->>'milestones')::numeric, 0)
    + measure_s   * coalesce((w->>'measures')::numeric, 0)
    + reporting_s * coalesce((w->>'reporting')::numeric, 0)
  ) / greatest(1, (
      coalesce((w->>'schedule')::numeric,0) + coalesce((w->>'budget')::numeric,0)
    + coalesce((w->>'tasks')::numeric,0) + coalesce((w->>'risk')::numeric,0)
    + coalesce((w->>'milestones')::numeric,0) + coalesce((w->>'measures')::numeric,0)
    + coalesce((w->>'reporting')::numeric,0))), 2);

  label := CASE
    WHEN p.status IN ('completed') THEN 'completed'
    WHEN p.status IN ('draft','submitted','under_review') THEN 'not_started'
    WHEN total >= 80 THEN 'on_track'
    WHEN total >= 60 THEN 'at_risk'
    ELSE 'critical' END;

  RETURN jsonb_build_object(
    'project_id', _project_id, 'score', total, 'health', label,
    'formula_version', 'v1', 'weights', w,
    'components', jsonb_build_object(
      'schedule', schedule_s, 'budget', budget_s, 'tasks', task_s, 'risk', risk_s,
      'milestones', milestone_s, 'measures', measure_s, 'reporting', reporting_s),
    'spent', coalesce(spent,0), 'budget', budget,
    'calculated_at', now());
END;
$$;
REVOKE ALL ON FUNCTION public.me_project_health(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_project_health(uuid) TO authenticated, service_role;

-- ---------- data quality ----------
CREATE OR REPLACE FUNCTION public.me_data_quality(_scope text DEFAULT 'national', _scope_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  missing int; late int; unverified int; invalid_dates int; dupes int; total int; score numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.me_can_manage() AND NOT public.me_can_verify() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT count(*) INTO total FROM public.me_results r
    WHERE (_scope_id IS NULL OR r.measure_id IN (SELECT id FROM public.me_measures WHERE project_id = _scope_id));
  SELECT count(*) INTO missing FROM public.me_results r
    WHERE r.reported_value IS NULL
      AND (_scope_id IS NULL OR r.measure_id IN (SELECT id FROM public.me_measures WHERE project_id = _scope_id));
  SELECT count(*) INTO unverified FROM public.me_results r
    WHERE r.verification_status <> 'verified'
      AND (_scope_id IS NULL OR r.measure_id IN (SELECT id FROM public.me_measures WHERE project_id = _scope_id));
  SELECT count(*) INTO late FROM public.me_field_reports fr
    JOIN public.me_reporting_periods pp ON pp.id = fr.period_id
    WHERE pp.submission_deadline IS NOT NULL AND fr.reported_at::date > pp.submission_deadline
      AND (_scope_id IS NULL OR fr.project_id = _scope_id);
  SELECT count(*) INTO invalid_dates FROM public.me_tasks
    WHERE due_date IS NOT NULL AND planned_start IS NOT NULL AND due_date < planned_start
      AND (_scope_id IS NULL OR project_id = _scope_id);
  SELECT count(*) INTO dupes FROM (
    SELECT measure_id, period_id, count(*) c FROM public.me_results
    GROUP BY 1,2 HAVING count(*) > 1) d;

  score := greatest(0, 100
    - (CASE WHEN total = 0 THEN 0 ELSE missing::numeric * 100 / total * 0.4 END)
    - (CASE WHEN total = 0 THEN 0 ELSE unverified::numeric * 100 / total * 0.3 END)
    - least(15, late * 3) - least(10, invalid_dates * 2) - least(10, dupes * 5));

  RETURN jsonb_build_object('scope', _scope, 'scope_id', _scope_id, 'score', round(score,2),
    'total_results', total, 'missing_values', missing, 'unverified', unverified,
    'late_submissions', late, 'invalid_dates', invalid_dates, 'duplicates', dupes,
    'calculated_at', now());
END;
$$;
REVOKE ALL ON FUNCTION public.me_data_quality(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_data_quality(text, uuid) TO authenticated, service_role;

-- ---------- command center ----------
CREATE OR REPLACE FUNCTION public.me_command_center(
  _region text DEFAULT NULL, _period_id uuid DEFAULT NULL, _department_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'filters', jsonb_build_object('region', _region, 'period_id', _period_id, 'department_id', _department_id),

    'objectives', (SELECT jsonb_build_object(
        'total', count(*),
        'active', count(*) FILTER (WHERE status IN ('active','approved')),
        'avg_score', round(coalesce(avg(performance_score), 0), 2))
      FROM public.me_objectives o
      WHERE archived_at IS NULL AND public.me_can_view(o.classification, o.org_unit_id)
        AND (_region IS NULL OR o.region = _region)
        AND (_department_id IS NULL OR o.department_id = _department_id)),

    'programs', (SELECT jsonb_build_object(
        'total', count(*),
        'on_track', count(*) FILTER (WHERE health = 'on_track'),
        'at_risk', count(*) FILTER (WHERE health = 'at_risk'),
        'critical', count(*) FILTER (WHERE health = 'critical'))
      FROM public.me_programs g
      WHERE archived_at IS NULL AND public.me_can_view(g.classification, g.org_unit_id)
        AND (_region IS NULL OR g.region = _region)
        AND (_department_id IS NULL OR g.department_id = _department_id)),

    'projects', (SELECT jsonb_build_object(
        'total', count(*),
        'active', count(*) FILTER (WHERE status = 'active'),
        'completed', count(*) FILTER (WHERE status = 'completed'),
        'delayed', count(*) FILTER (WHERE status = 'delayed'),
        'on_track', count(*) FILTER (WHERE health = 'on_track'),
        'at_risk', count(*) FILTER (WHERE health = 'at_risk'),
        'critical', count(*) FILTER (WHERE health = 'critical'),
        'avg_complete', round(coalesce(avg(percent_complete),0), 2))
      FROM public.me_projects pr
      WHERE archived_at IS NULL AND public.me_can_view(pr.classification, pr.org_unit_id)
        AND (_region IS NULL OR pr.region = _region)
        AND (_department_id IS NULL OR pr.department_id = _department_id)),

    'measures', (SELECT jsonb_build_object(
        'total', count(*),
        'kpis', count(*) FILTER (WHERE measure_class = 'kpi'),
        'indicators', count(*) FILTER (WHERE measure_class = 'indicator'))
      FROM public.me_measures m
      WHERE archived_at IS NULL AND public.me_can_view(m.classification, m.org_unit_id)),

    'achievement', (SELECT jsonb_build_object(
        'avg_percent', round(coalesce(avg(least(150, pct)),0), 2),
        'on_track', count(*) FILTER (WHERE pct >= 90),
        'at_risk', count(*) FILTER (WHERE pct >= 70 AND pct < 90),
        'off_track', count(*) FILTER (WHERE pct < 70))
      FROM (
        SELECT CASE WHEN t.target_value IS NULL OR t.target_value = 0 THEN NULL
               ELSE (coalesce(r.verified_value, r.reported_value) / t.target_value) * 100 END AS pct
        FROM public.me_measures m
        JOIN public.me_targets t ON t.measure_id = m.id
        LEFT JOIN public.me_results r ON r.measure_id = m.id AND r.period_id = t.period_id
        WHERE public.me_can_view(m.classification, m.org_unit_id)
          AND (_period_id IS NULL OR t.period_id = _period_id)
      ) a WHERE pct IS NOT NULL),

    'budget', (SELECT jsonb_build_object(
        'approved', coalesce(sum(coalesce(b.revised_amount, b.approved_amount)),0),
        'committed', coalesce(sum(b.committed_amount),0),
        'spent', coalesce((SELECT sum(amount) FROM public.me_expenditures WHERE expenditure_type='actual'),0))
      FROM public.me_budgets b
      WHERE public.me_can_view(b.classification, b.org_unit_id)
        AND (_region IS NULL OR b.region = _region)),

    'risks', (SELECT jsonb_build_object(
        'open', count(*) FILTER (WHERE status <> 'closed'),
        'high', count(*) FILTER (WHERE risk_score >= 15 AND status <> 'closed'),
        'max_score', coalesce(max(risk_score) FILTER (WHERE status <> 'closed'), 0))
      FROM public.me_risks rk
      WHERE public.me_can_view(rk.classification, rk.org_unit_id)
        AND (_region IS NULL OR rk.region = _region)),

    'incidents', (SELECT jsonb_build_object(
        'open', count(*) FILTER (WHERE status NOT IN ('resolved','closed')),
        'critical', count(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved','closed')),
        'resolved_30d', count(*) FILTER (WHERE resolved_at > now() - interval '30 days'))
      FROM public.me_incidents ic
      WHERE public.me_can_view(ic.classification, ic.org_unit_id)
        AND (_region IS NULL OR ic.region = _region)),

    'field_reports', (SELECT jsonb_build_object(
        'total', count(*),
        'pending_review', count(*) FILTER (WHERE status = 'submitted'),
        'verified', count(*) FILTER (WHERE status IN ('verified','approved')),
        'returned', count(*) FILTER (WHERE status = 'returned'))
      FROM public.me_field_reports fr
      WHERE public.me_can_view(fr.classification, fr.org_unit_id)
        AND (_region IS NULL OR fr.region = _region)),

    'evidence', (SELECT jsonb_build_object(
        'total', count(*),
        'pending', count(*) FILTER (WHERE verification_status = 'pending'),
        'verified', count(*) FILTER (WHERE verification_status = 'verified'))
      FROM public.me_evidence ev
      WHERE public.me_can_view(ev.classification, ev.org_unit_id)),

    'corrective_actions', (SELECT jsonb_build_object(
        'open', count(*) FILTER (WHERE status <> 'closed'),
        'overdue', count(*) FILTER (WHERE status <> 'closed' AND due_date < current_date),
        'closed', count(*) FILTER (WHERE status = 'closed'))
      FROM public.me_corrective_actions ca
      WHERE public.me_can_view(ca.classification, ca.org_unit_id)),

    'approvals', (SELECT jsonb_build_object(
        'pending', count(*) FILTER (WHERE status = 'pending'),
        'escalated', count(*) FILTER (WHERE status = 'escalated'))
      FROM public.me_approvals ap
      WHERE public.me_can_view(ap.classification, ap.org_unit_id)),

    'overdue', jsonb_build_object(
      'tasks', (SELECT count(*) FROM public.me_tasks t WHERE t.due_date < current_date
                 AND t.status NOT IN ('completed','cancelled')
                 AND public.me_can_view(t.classification, t.org_unit_id)),
      'milestones', (SELECT count(*) FROM public.me_milestones ms
                 JOIN public.me_projects p2 ON p2.id = ms.project_id
                 WHERE ms.due_date < current_date AND ms.status NOT IN ('achieved','cancelled')
                   AND public.me_can_view(p2.classification, p2.org_unit_id)),
      'reports', (SELECT count(*) FROM public.me_field_reports fr2
                 JOIN public.me_reporting_periods pp ON pp.id = fr2.period_id
                 WHERE pp.submission_deadline < current_date AND fr2.status = 'draft'))
  ) INTO res;

  RETURN res;
END;
$$;
REVOKE ALL ON FUNCTION public.me_command_center(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_command_center(text, uuid, uuid) TO authenticated, service_role;

-- ---------- geographic rollup for the GIS map ----------
CREATE OR REPLACE FUNCTION public.me_geo_summary(_region text DEFAULT NULL)
RETURNS TABLE (
  region text, projects int, active_projects int, avg_complete numeric,
  open_risks int, open_incidents int, field_reports int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    g.region,
    (SELECT count(*)::int FROM public.me_projects p WHERE p.region = g.region
       AND public.me_can_view(p.classification, p.org_unit_id)),
    (SELECT count(*)::int FROM public.me_projects p WHERE p.region = g.region AND p.status = 'active'
       AND public.me_can_view(p.classification, p.org_unit_id)),
    (SELECT round(coalesce(avg(p.percent_complete),0),2) FROM public.me_projects p WHERE p.region = g.region
       AND public.me_can_view(p.classification, p.org_unit_id)),
    (SELECT count(*)::int FROM public.me_risks r WHERE r.region = g.region AND r.status <> 'closed'
       AND public.me_can_view(r.classification, r.org_unit_id)),
    (SELECT count(*)::int FROM public.me_incidents i WHERE i.region = g.region
       AND i.status NOT IN ('resolved','closed') AND public.me_can_view(i.classification, i.org_unit_id)),
    (SELECT count(*)::int FROM public.me_field_reports f WHERE f.region = g.region
       AND public.me_can_view(f.classification, f.org_unit_id))
  FROM (SELECT DISTINCT region FROM public.ghana_districts WHERE region IS NOT NULL) g
  WHERE auth.uid() IS NOT NULL AND (_region IS NULL OR g.region = _region)
  ORDER BY 1
$$;
REVOKE ALL ON FUNCTION public.me_geo_summary(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_geo_summary(text) TO authenticated, service_role;

-- ---------- score recalculation ----------
CREATE OR REPLACE FUNCTION public.me_recalculate_scores(_period_id uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; h jsonb; n int := 0;
BEGIN
  IF NOT public.me_can_manage() THEN RAISE EXCEPTION 'Not authorised'; END IF;

  FOR r IN SELECT id FROM public.me_projects WHERE archived_at IS NULL LOOP
    h := public.me_project_health(r.id);
    IF h IS NOT NULL THEN
      UPDATE public.me_projects
         SET health_score = (h->>'score')::numeric,
             health = h->>'health'
       WHERE id = r.id;
      INSERT INTO public.me_scores (scope_type, scope_id, period_id, score, components, weights, formula_version)
      VALUES ('project', r.id, _period_id, (h->>'score')::numeric, h->'components', h->'weights', h->>'formula_version');
      n := n + 1;
    END IF;
  END LOOP;

  -- programme rollup
  UPDATE public.me_programs g
     SET performance_score = s.avg_score,
         health = CASE WHEN s.avg_score >= 80 THEN 'on_track'
                       WHEN s.avg_score >= 60 THEN 'at_risk' ELSE 'critical' END
    FROM (SELECT program_id, round(avg(health_score),2) avg_score FROM public.me_projects
          WHERE program_id IS NOT NULL AND health_score IS NOT NULL GROUP BY program_id) s
   WHERE g.id = s.program_id;

  -- objective rollup
  UPDATE public.me_objectives o
     SET performance_score = s.avg_score
    FROM (SELECT objective_id, round(avg(performance_score),2) avg_score FROM public.me_programs
          WHERE objective_id IS NOT NULL AND performance_score IS NOT NULL GROUP BY objective_id) s
   WHERE o.id = s.objective_id;

  -- national index
  INSERT INTO public.me_scores (scope_type, scope_label, period_id, score, components, weights, formula_version)
  SELECT 'national', 'National Performance Index', _period_id,
         round(coalesce(avg(health_score), 0), 2),
         jsonb_build_object('projects_counted', count(*)),
         '{}'::jsonb, 'v1'
    FROM public.me_projects WHERE health_score IS NOT NULL;

  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.me_recalculate_scores(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_recalculate_scores(uuid) TO authenticated, service_role;

-- ---------- default configuration ----------
INSERT INTO public.me_settings (key, value, description) VALUES
  ('project_health_weights', '{"schedule":20,"budget":15,"tasks":20,"risk":10,"milestones":15,"measures":15,"reporting":5}', 'Weights used by the project health score'),
  ('health_thresholds', '{"on_track":80,"at_risk":60}', 'Score thresholds for health labels'),
  ('classifications', '["public","internal","confidential","restricted","highly_restricted"]', 'Available data classifications'),
  ('risk_matrix', '{"size":5,"method":"probability_x_impact","levels":{"low":6,"medium":12,"high":19,"critical":25}}', 'Risk matrix configuration'),
  ('default_result_workflow', '["field_officer","supervisor","department_head","me_officer","project_manager","director","executive"]', 'Default approval chain for reported results')
ON CONFLICT (key) DO NOTHING;
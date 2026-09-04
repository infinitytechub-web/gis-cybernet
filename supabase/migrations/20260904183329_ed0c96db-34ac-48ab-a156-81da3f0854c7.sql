CREATE OR REPLACE FUNCTION public.me_project_dashboard(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  proj public.me_projects;
  res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO proj FROM public.me_projects WHERE id = _project_id;
  IF proj.id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF NOT public.me_can_view(proj.classification, proj.org_unit_id) THEN
    RAISE EXCEPTION 'Not authorised to view this project';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'project', jsonb_build_object(
      'id', proj.id, 'ref_code', proj.ref_code, 'name', proj.name, 'description', proj.description,
      'status', proj.status, 'health', proj.health, 'priority', proj.priority, 'region', proj.region,
      'percent_complete', coalesce(proj.percent_complete, 0),
      'budget_amount', coalesce(proj.revised_budget_amount, proj.budget_amount, 0),
      'start_date', proj.start_date, 'end_date', proj.end_date,
      'performance_score', proj.performance_score, 'program_id', proj.program_id,
      'latitude', proj.latitude, 'longitude', proj.longitude
    ),
    'activities', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'ref_code', a.ref_code, 'name', a.name, 'status', a.status, 'priority', a.priority,
        'percent_complete', coalesce(a.percent_complete, 0),
        'planned_start', a.planned_start, 'planned_end', a.planned_end,
        'actual_end', a.actual_end,
        'planned_cost', coalesce(a.planned_cost, 0), 'actual_cost', coalesce(a.actual_cost, 0),
        'overdue', (a.planned_end IS NOT NULL AND a.planned_end < current_date AND coalesce(a.percent_complete,0) < 100)
      ) ORDER BY a.planned_end NULLS LAST)
      FROM public.me_activities a
      WHERE a.project_id = _project_id AND a.archived_at IS NULL), '[]'::jsonb),
    'measures', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'ref_code', m.ref_code, 'name', m.name, 'unit', m.unit,
        'measure_class', m.measure_class, 'direction', m.direction,
        'baseline_value', m.baseline_value,
        'target_value', t.target_value,
        'actual_value', coalesce(r.verified_value, r.reported_value),
        'verification_status', r.verification_status,
        'reported_at', r.reported_at,
        'achievement', CASE WHEN t.target_value IS NULL OR t.target_value = 0 THEN NULL
          ELSE round((coalesce(r.verified_value, r.reported_value, 0) / t.target_value) * 100, 1) END
      ) ORDER BY m.name)
      FROM public.me_measures m
      LEFT JOIN LATERAL (SELECT tt.target_value, tt.period_id FROM public.me_targets tt
                         WHERE tt.measure_id = m.id ORDER BY tt.created_at DESC LIMIT 1) t ON true
      LEFT JOIN LATERAL (SELECT rr.reported_value, rr.verified_value, rr.verification_status, rr.reported_at
                         FROM public.me_results rr WHERE rr.measure_id = m.id
                         ORDER BY rr.reported_at DESC NULLS LAST LIMIT 1) r ON true
      WHERE m.project_id = _project_id AND m.archived_at IS NULL), '[]'::jsonb),
    'milestones', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', ms.id, 'name', ms.name, 'due_date', ms.due_date, 'achieved_date', ms.achieved_date,
        'status', ms.status, 'criticality', ms.criticality
      ) ORDER BY ms.due_date NULLS LAST)
      FROM public.me_milestones ms WHERE ms.project_id = _project_id), '[]'::jsonb),
    'budget', (SELECT jsonb_build_object(
        'approved', coalesce(sum(coalesce(b.revised_amount, b.approved_amount, 0)), 0),
        'committed', coalesce(sum(coalesce(b.committed_amount, 0)), 0),
        'spent', coalesce((SELECT sum(e.amount) FROM public.me_expenditures e
                            WHERE e.project_id = _project_id AND e.status <> 'rejected'), 0)
      ) FROM public.me_budgets b WHERE b.project_id = _project_id),
    'spend_by_month', coalesce((SELECT jsonb_agg(jsonb_build_object('month', s.month, 'amount', s.amount) ORDER BY s.month)
      FROM (SELECT to_char(date_trunc('month', e.spend_date), 'YYYY-MM') AS month, sum(e.amount) AS amount
            FROM public.me_expenditures e
            WHERE e.project_id = _project_id AND e.status <> 'rejected' AND e.spend_date IS NOT NULL
            GROUP BY 1) s), '[]'::jsonb),
    'field_reports', coalesce((SELECT count(*) FROM public.me_field_reports fr WHERE fr.project_id = _project_id), 0),
    'open_risks', coalesce((SELECT count(*) FROM public.me_risks rk WHERE rk.project_id = _project_id AND rk.status NOT IN ('closed','realised')), 0)
  ) INTO res;
  RETURN res;
END;
$function$;

REVOKE ALL ON FUNCTION public.me_project_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_project_dashboard(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.me_program_dashboard(_program_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  prog public.me_programs;
  res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO prog FROM public.me_programs WHERE id = _program_id;
  IF prog.id IS NULL THEN RAISE EXCEPTION 'Program not found'; END IF;
  IF NOT public.me_can_view(prog.classification, prog.org_unit_id) THEN
    RAISE EXCEPTION 'Not authorised to view this program';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'program', jsonb_build_object(
      'id', prog.id, 'ref_code', prog.ref_code, 'name', prog.name, 'description', prog.description,
      'status', prog.status, 'health', prog.health, 'region', prog.region,
      'budget_amount', coalesce(prog.budget_amount, 0),
      'start_date', prog.start_date, 'end_date', prog.end_date,
      'performance_score', prog.performance_score, 'objective_id', prog.objective_id
    ),
    'projects', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'ref_code', p.ref_code, 'name', p.name, 'status', p.status, 'health', p.health,
        'percent_complete', coalesce(p.percent_complete, 0),
        'budget', coalesce(p.revised_budget_amount, p.budget_amount, 0),
        'spent', coalesce((SELECT sum(e.amount) FROM public.me_expenditures e
                            WHERE e.project_id = p.id AND e.status <> 'rejected'), 0),
        'activities', (SELECT count(*) FROM public.me_activities a WHERE a.project_id = p.id AND a.archived_at IS NULL),
        'region', p.region
      ) ORDER BY p.name)
      FROM public.me_projects p
      WHERE p.program_id = _program_id AND p.archived_at IS NULL
        AND public.me_can_view(p.classification, p.org_unit_id)), '[]'::jsonb),
    'measures', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'unit', m.unit, 'measure_class', m.measure_class,
        'target_value', t.target_value,
        'actual_value', coalesce(r.verified_value, r.reported_value),
        'achievement', CASE WHEN t.target_value IS NULL OR t.target_value = 0 THEN NULL
          ELSE round((coalesce(r.verified_value, r.reported_value, 0) / t.target_value) * 100, 1) END
      ) ORDER BY m.name)
      FROM public.me_measures m
      LEFT JOIN LATERAL (SELECT tt.target_value FROM public.me_targets tt WHERE tt.measure_id = m.id
                         ORDER BY tt.created_at DESC LIMIT 1) t ON true
      LEFT JOIN LATERAL (SELECT rr.reported_value, rr.verified_value FROM public.me_results rr
                         WHERE rr.measure_id = m.id ORDER BY rr.reported_at DESC NULLS LAST LIMIT 1) r ON true
      WHERE m.program_id = _program_id AND m.archived_at IS NULL), '[]'::jsonb),
    'budget', (SELECT jsonb_build_object(
        'approved', coalesce(sum(coalesce(b.revised_amount, b.approved_amount, 0)), 0),
        'committed', coalesce(sum(coalesce(b.committed_amount, 0)), 0),
        'spent', coalesce((SELECT sum(e.amount) FROM public.me_expenditures e
                            JOIN public.me_projects p2 ON p2.id = e.project_id
                            WHERE p2.program_id = _program_id AND e.status <> 'rejected'), 0)
      ) FROM public.me_budgets b WHERE b.program_id = _program_id
         OR b.project_id IN (SELECT id FROM public.me_projects WHERE program_id = _program_id))
  ) INTO res;
  RETURN res;
END;
$function$;

REVOKE ALL ON FUNCTION public.me_program_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_program_dashboard(uuid) TO authenticated;
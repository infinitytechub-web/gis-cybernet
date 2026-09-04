CREATE OR REPLACE FUNCTION public.me_approved_dashboard()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'generated_at', now(),
    'counts', (
      SELECT jsonb_build_object(
        'pending', count(*) FILTER (WHERE ap.status IN ('pending','escalated')),
        'approved', count(*) FILTER (WHERE ap.status = 'approved'),
        'rejected', count(*) FILTER (WHERE ap.status = 'rejected'),
        'returned', count(*) FILTER (WHERE ap.status = 'returned'),
        'overdue', count(*) FILTER (WHERE ap.status IN ('pending','escalated') AND ap.due_date IS NOT NULL AND ap.due_date < current_date)
      )
      FROM public.me_approvals ap
      WHERE public.me_can_view(ap.classification, ap.org_unit_id)
    ),
    'by_type', (
      SELECT coalesce(jsonb_agg(t ORDER BY t->>'record_type'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'record_type', ap.record_type,
          'pending', count(*) FILTER (WHERE ap.status IN ('pending','escalated')),
          'approved', count(*) FILTER (WHERE ap.status = 'approved'),
          'rejected', count(*) FILTER (WHERE ap.status = 'rejected'),
          'returned', count(*) FILTER (WHERE ap.status = 'returned')
        ) AS t
        FROM public.me_approvals ap
        WHERE public.me_can_view(ap.classification, ap.org_unit_id)
        GROUP BY ap.record_type
      ) q
    ),
    'approved_records', (
      SELECT coalesce(jsonb_agg(r ORDER BY r->>'approved_at' DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'approval_id', ap.id,
          'record_type', ap.record_type,
          'record_id', ap.record_id,
          'name', CASE ap.record_type
            WHEN 'objective' THEN (SELECT o.name FROM public.me_objectives o WHERE o.id = ap.record_id)
            WHEN 'program' THEN (SELECT g.name FROM public.me_programs g WHERE g.id = ap.record_id)
            WHEN 'project' THEN (SELECT p.name FROM public.me_projects p WHERE p.id = ap.record_id)
            WHEN 'budget' THEN (SELECT b.name FROM public.me_budgets b WHERE b.id = ap.record_id)
            WHEN 'resource' THEN (SELECT ra.label FROM public.me_resource_allocations ra WHERE ra.id = ap.record_id)
            WHEN 'procurement' THEN (SELECT pr.title FROM public.purchase_requisitions pr WHERE pr.id = ap.record_id)
            ELSE NULL END,
          'ref_code', CASE ap.record_type
            WHEN 'objective' THEN (SELECT o.ref_code FROM public.me_objectives o WHERE o.id = ap.record_id)
            WHEN 'program' THEN (SELECT g.ref_code FROM public.me_programs g WHERE g.id = ap.record_id)
            WHEN 'project' THEN (SELECT p.ref_code FROM public.me_projects p WHERE p.id = ap.record_id)
            ELSE NULL END,
          'region', CASE ap.record_type
            WHEN 'objective' THEN (SELECT o.region FROM public.me_objectives o WHERE o.id = ap.record_id)
            WHEN 'program' THEN (SELECT g.region FROM public.me_programs g WHERE g.id = ap.record_id)
            WHEN 'project' THEN (SELECT p.region FROM public.me_projects p WHERE p.id = ap.record_id)
            ELSE NULL END,
          'percent_complete', CASE ap.record_type
            WHEN 'project' THEN (SELECT p.percent_complete FROM public.me_projects p WHERE p.id = ap.record_id)
            ELSE NULL END,
          'record_status', CASE ap.record_type
            WHEN 'objective' THEN (SELECT o.status FROM public.me_objectives o WHERE o.id = ap.record_id)
            WHEN 'program' THEN (SELECT g.status FROM public.me_programs g WHERE g.id = ap.record_id)
            WHEN 'project' THEN (SELECT p.status FROM public.me_projects p WHERE p.id = ap.record_id)
            ELSE NULL END,
          'approved_at', coalesce(ap.completed_at, ap.updated_at, ap.created_at),
          'requested_by_name', (SELECT btrim(concat_ws(' ', pf.first_name, pf.last_name)) FROM public.profiles pf WHERE pf.user_id = ap.requested_by),
          'final_comment', (SELECT s.comment FROM public.me_approval_steps s WHERE s.approval_id = ap.id AND s.comment IS NOT NULL ORDER BY s.step_order DESC LIMIT 1)
        ) AS r
        FROM public.me_approvals ap
        WHERE ap.status = 'approved'
          AND ap.record_type IN ('objective','program','project')
          AND public.me_can_view(ap.classification, ap.org_unit_id)
        ORDER BY coalesce(ap.completed_at, ap.updated_at, ap.created_at) DESC
        LIMIT 100
      ) q
    ),
    'recent_decisions', (
      SELECT coalesce(jsonb_agg(d ORDER BY d->>'acted_at' DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'approval_id', ap.id,
          'record_type', ap.record_type,
          'record_name', CASE ap.record_type
            WHEN 'objective' THEN (SELECT o.name FROM public.me_objectives o WHERE o.id = ap.record_id)
            WHEN 'program' THEN (SELECT g.name FROM public.me_programs g WHERE g.id = ap.record_id)
            WHEN 'project' THEN (SELECT p.name FROM public.me_projects p WHERE p.id = ap.record_id)
            WHEN 'budget' THEN (SELECT b.name FROM public.me_budgets b WHERE b.id = ap.record_id)
            WHEN 'resource' THEN (SELECT ra.label FROM public.me_resource_allocations ra WHERE ra.id = ap.record_id)
            WHEN 'procurement' THEN (SELECT pr.title FROM public.purchase_requisitions pr WHERE pr.id = ap.record_id)
            ELSE NULL END,
          'step_order', s.step_order,
          'step_role', s.step_role,
          'action', s.action,
          'comment', s.comment,
          'acted_at', s.acted_at,
          'approver_name', (SELECT btrim(concat_ws(' ', pf.first_name, pf.last_name)) FROM public.profiles pf WHERE pf.user_id = s.approver_user_id)
        ) AS d
        FROM public.me_approval_steps s
        JOIN public.me_approvals ap ON ap.id = s.approval_id
        WHERE s.acted_at IS NOT NULL
          AND public.me_can_view(ap.classification, ap.org_unit_id)
        ORDER BY s.acted_at DESC
        LIMIT 40
      ) q
    )
  )
  WHERE public.me_approval_reviewer() OR public.me_can_manage();
$function$;

REVOKE ALL ON FUNCTION public.me_approved_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_approved_dashboard() TO authenticated;
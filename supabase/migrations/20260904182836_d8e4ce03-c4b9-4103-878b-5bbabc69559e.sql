-- 1. Restore elevated execution with in-body authorization for the approval workflow.

CREATE OR REPLACE FUNCTION public.me_submit_for_approval(_record_type text, _record_id uuid, _workflow_key text DEFAULT 'default'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_class text := 'internal'; v_unit uuid; v_id uuid; v_existing uuid;
  v_can_submit boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _record_type NOT IN ('objective','program','project','budget','resource','procurement') THEN RAISE EXCEPTION 'Unsupported record type'; END IF;
  v_can_submit := public.me_can_manage() OR public.has_role(auth.uid(), 'procurement_officer');
  IF NOT v_can_submit THEN RAISE EXCEPTION 'Not authorized to submit this record'; END IF;
  IF _record_type = 'objective' THEN SELECT status, classification, org_unit_id INTO v_status, v_class, v_unit FROM public.me_objectives WHERE id = _record_id;
  ELSIF _record_type = 'program' THEN SELECT status, classification, org_unit_id INTO v_status, v_class, v_unit FROM public.me_programs WHERE id = _record_id;
  ELSIF _record_type = 'project' THEN SELECT status, classification, org_unit_id INTO v_status, v_class, v_unit FROM public.me_projects WHERE id = _record_id;
  ELSIF _record_type = 'budget' THEN SELECT status, classification, org_unit_id INTO v_status, v_class, v_unit FROM public.me_budgets WHERE id = _record_id;
  ELSIF _record_type = 'resource' THEN SELECT status, 'internal', org_unit_id INTO v_status, v_class, v_unit FROM public.me_resource_allocations WHERE id = _record_id;
  ELSE SELECT status, 'internal', NULL::uuid INTO v_status, v_class, v_unit FROM public.purchase_requisitions WHERE id = _record_id;
  END IF;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _record_type IN ('objective','program','project','budget','resource') AND NOT public.me_can_view(v_class, v_unit) THEN RAISE EXCEPTION 'Not authorized for this record'; END IF;
  IF _record_type = 'procurement' AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'procurement_officer') OR EXISTS (SELECT 1 FROM public.purchase_requisitions WHERE id = _record_id AND requested_by = auth.uid())) THEN RAISE EXCEPTION 'Not authorized for this record'; END IF;
  IF v_status NOT IN ('draft','returned','planned','allocated') THEN RAISE EXCEPTION 'Record is already % and cannot be submitted', v_status; END IF;
  SELECT id INTO v_existing FROM public.me_approvals WHERE record_type = _record_type AND record_id = _record_id AND status IN ('pending','escalated') LIMIT 1;
  IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'An approval is already in progress for this record'; END IF;
  INSERT INTO public.me_approvals (record_type, record_id, workflow_key, current_step, status, requested_by, org_unit_id, classification, due_date)
  VALUES (_record_type, _record_id, coalesce(_workflow_key,'default'), 1, 'pending', auth.uid(), v_unit, coalesce(v_class,'internal'), current_date + 5)
  RETURNING id INTO v_id;
  INSERT INTO public.me_approval_steps (approval_id, step_order, step_role) VALUES (v_id, 1, 'supervisor'), (v_id, 2, 'command');
  IF _record_type = 'objective' THEN UPDATE public.me_objectives SET status = 'submitted', updated_at = now() WHERE id = _record_id;
  ELSIF _record_type = 'program' THEN UPDATE public.me_programs SET status = 'submitted', updated_at = now() WHERE id = _record_id;
  ELSIF _record_type = 'project' THEN UPDATE public.me_projects SET status = 'submitted', updated_at = now() WHERE id = _record_id;
  ELSIF _record_type = 'budget' THEN UPDATE public.me_budgets SET status = 'submitted', updated_at = now() WHERE id = _record_id;
  ELSIF _record_type = 'resource' THEN UPDATE public.me_resource_allocations SET status = 'planned', updated_at = now() WHERE id = _record_id;
  ELSE UPDATE public.purchase_requisitions SET status = 'submitted', updated_at = now() WHERE id = _record_id;
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.me_decide_approval(_approval_id uuid, _decision text, _comment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a public.me_approvals; v_total int; v_new_status text; v_record_status text; v_resource_status text; v_step_role text; v_command boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _decision NOT IN ('approve','reject','return') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  IF coalesce(btrim(_comment), '') = '' THEN RAISE EXCEPTION 'A comment is required for every decision'; END IF;
  IF NOT public.me_approval_reviewer() THEN RAISE EXCEPTION 'Not authorized to decide approvals'; END IF;
  SELECT * INTO a FROM public.me_approvals WHERE id = _approval_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Approval not found'; END IF;
  IF NOT public.me_can_view(a.classification, a.org_unit_id) AND NOT public.has_role(auth.uid(), 'procurement_officer') THEN RAISE EXCEPTION 'Not authorized for this approval'; END IF;
  IF a.status NOT IN ('pending','escalated') THEN RAISE EXCEPTION 'Approval is already %', a.status; END IF;

  SELECT step_role INTO v_step_role FROM public.me_approval_steps WHERE approval_id = a.id AND step_order = a.current_step;
  v_command := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic') OR public.has_role(auth.uid(), 'staff_officer');
  IF v_step_role = 'command' AND NOT v_command THEN
    RAISE EXCEPTION 'This step must be decided by command tier';
  END IF;

  SELECT count(*) INTO v_total FROM public.me_approval_steps WHERE approval_id = a.id;
  UPDATE public.me_approval_steps SET action = _decision, comment = _comment, approver_user_id = auth.uid(), acted_at = now() WHERE approval_id = a.id AND step_order = a.current_step;
  IF _decision = 'approve' AND a.current_step < v_total THEN v_new_status := 'pending'; v_record_status := 'under_review'; UPDATE public.me_approvals SET current_step = a.current_step + 1, status = 'pending', updated_at = now() WHERE id = a.id;
  ELSIF _decision = 'approve' THEN v_new_status := 'approved'; v_record_status := 'approved'; UPDATE public.me_approvals SET status = 'approved', completed_at = now(), updated_at = now() WHERE id = a.id;
  ELSIF _decision = 'reject' THEN v_new_status := 'rejected'; v_record_status := 'rejected'; UPDATE public.me_approvals SET status = 'rejected', completed_at = now(), updated_at = now() WHERE id = a.id;
  ELSE v_new_status := 'returned'; v_record_status := 'returned'; UPDATE public.me_approvals SET status = 'returned', completed_at = now(), updated_at = now() WHERE id = a.id;
  END IF;
  IF a.record_type = 'objective' THEN UPDATE public.me_objectives SET status = CASE WHEN v_record_status IN ('rejected','returned') THEN 'draft' ELSE v_record_status END, updated_at = now() WHERE id = a.record_id;
  ELSIF a.record_type = 'program' THEN UPDATE public.me_programs SET status = CASE WHEN v_record_status IN ('rejected','returned') THEN 'draft' ELSE v_record_status END, updated_at = now() WHERE id = a.record_id;
  ELSIF a.record_type = 'project' THEN UPDATE public.me_projects SET status = CASE WHEN v_record_status IN ('rejected','returned') THEN 'draft' ELSE v_record_status END, updated_at = now() WHERE id = a.record_id;
  ELSIF a.record_type = 'budget' THEN UPDATE public.me_budgets SET status = CASE WHEN v_record_status IN ('rejected','returned') THEN 'draft' ELSE v_record_status END, updated_at = now() WHERE id = a.record_id;
  ELSIF a.record_type = 'resource' THEN v_resource_status := CASE WHEN v_record_status = 'approved' THEN 'allocated' ELSE 'planned' END; UPDATE public.me_resource_allocations SET status = v_resource_status, updated_at = now() WHERE id = a.record_id;
  ELSIF a.record_type = 'procurement' THEN UPDATE public.purchase_requisitions SET status = CASE WHEN v_record_status = 'returned' THEN 'draft' ELSE v_record_status END, approved_by = CASE WHEN v_record_status = 'approved' THEN auth.uid() ELSE approved_by END, approved_at = CASE WHEN v_record_status = 'approved' THEN now() ELSE approved_at END, updated_at = now() WHERE id = a.record_id;
  END IF;
  RETURN jsonb_build_object('approval_id', a.id, 'approval_status', v_new_status, 'record_type', a.record_type, 'record_id', a.record_id, 'record_status', v_record_status);
END;
$function$;

-- Queue and dashboard reads: elevated, but every row is filtered by me_can_view.
CREATE OR REPLACE FUNCTION public.me_approval_queue(_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(row ORDER BY row->>'created_at' DESC), '[]'::jsonb) FROM (SELECT jsonb_build_object('id', ap.id, 'record_type', ap.record_type, 'record_id', ap.record_id, 'record_name', CASE ap.record_type WHEN 'objective' THEN (SELECT o.name FROM public.me_objectives o WHERE o.id = ap.record_id) WHEN 'program' THEN (SELECT g.name FROM public.me_programs g WHERE g.id = ap.record_id) WHEN 'project' THEN (SELECT p.name FROM public.me_projects p WHERE p.id = ap.record_id) WHEN 'budget' THEN (SELECT b.name FROM public.me_budgets b WHERE b.id = ap.record_id) WHEN 'resource' THEN (SELECT r.label FROM public.me_resource_allocations r WHERE r.id = ap.record_id) WHEN 'procurement' THEN (SELECT r.title FROM public.purchase_requisitions r WHERE r.id = ap.record_id) ELSE NULL END, 'record_status', CASE ap.record_type WHEN 'objective' THEN (SELECT o.status FROM public.me_objectives o WHERE o.id = ap.record_id) WHEN 'program' THEN (SELECT g.status FROM public.me_programs g WHERE g.id = ap.record_id) WHEN 'project' THEN (SELECT p.status FROM public.me_projects p WHERE p.id = ap.record_id) WHEN 'budget' THEN (SELECT b.status FROM public.me_budgets b WHERE b.id = ap.record_id) WHEN 'resource' THEN (SELECT r.status FROM public.me_resource_allocations r WHERE r.id = ap.record_id) WHEN 'procurement' THEN (SELECT r.status FROM public.purchase_requisitions r WHERE r.id = ap.record_id) ELSE NULL END, 'workflow_key', ap.workflow_key, 'current_step', ap.current_step, 'total_steps', (SELECT count(*) FROM public.me_approval_steps s WHERE s.approval_id = ap.id), 'status', ap.status, 'classification', ap.classification, 'due_date', ap.due_date, 'overdue', (ap.status IN ('pending','escalated') AND ap.due_date IS NOT NULL AND ap.due_date < current_date), 'requested_by_name', (SELECT btrim(concat_ws(' ', pf.first_name, pf.last_name)) FROM public.profiles pf WHERE pf.user_id = ap.requested_by), 'created_at', ap.created_at, 'completed_at', ap.completed_at, 'can_decide', (public.me_approval_reviewer() AND (COALESCE((SELECT s.step_role FROM public.me_approval_steps s WHERE s.approval_id = ap.id AND s.step_order = ap.current_step), 'supervisor') <> 'command' OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic') OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'staff_officer'))), 'steps', (SELECT coalesce(jsonb_agg(jsonb_build_object('step_order', s.step_order, 'step_role', s.step_role, 'action', s.action, 'comment', s.comment, 'acted_at', s.acted_at, 'approver_name', (SELECT btrim(concat_ws(' ', pf2.first_name, pf2.last_name)) FROM public.profiles pf2 WHERE pf2.user_id = s.approver_user_id)) ORDER BY s.step_order), '[]'::jsonb) FROM public.me_approval_steps s WHERE s.approval_id = ap.id)) AS row FROM public.me_approvals ap WHERE auth.uid() IS NOT NULL AND (public.me_can_view(ap.classification, ap.org_unit_id) OR public.has_role(auth.uid(), 'procurement_officer')) AND (_status IS NULL OR (_status = 'open' AND ap.status IN ('pending','escalated')) OR ap.status = _status) ORDER BY ap.created_at DESC LIMIT 200) q;
$function$;

ALTER FUNCTION public.me_command_center(text, uuid, uuid) SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.me_submit_for_approval(text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.me_decide_approval(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.me_approval_queue(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.me_command_center(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_submit_for_approval(text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.me_decide_approval(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.me_approval_queue(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.me_command_center(text, uuid, uuid) TO authenticated, service_role;

-- 2. Field report location feed for the Command Center map.
CREATE OR REPLACE FUNCTION public.me_field_report_map(_region text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT jsonb_build_object(
    'generated_at', now(),
    'reports', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', fr.id, 'ref_code', fr.ref_code, 'title', fr.title, 'summary', fr.summary,
        'report_type', fr.report_type, 'status', fr.status, 'region', fr.region,
        'district', (SELECT d.name FROM public.ghana_districts d WHERE d.id = fr.district_id),
        'latitude', fr.latitude, 'longitude', fr.longitude,
        'reported_at', fr.reported_at, 'project_id', fr.project_id
      ) ORDER BY fr.reported_at DESC NULLS LAST)
      FROM public.me_field_reports fr
      WHERE public.me_can_view(fr.classification, fr.org_unit_id)
        AND (_region IS NULL OR fr.region = _region)
      ), '[]'::jsonb),
    'by_region', coalesce((SELECT jsonb_agg(jsonb_build_object('region', r.region, 'total', r.total, 'located', r.located) ORDER BY r.total DESC)
      FROM (SELECT coalesce(fr.region, 'Unassigned') AS region, count(*) AS total, count(*) FILTER (WHERE fr.latitude IS NOT NULL AND fr.longitude IS NOT NULL) AS located
            FROM public.me_field_reports fr
            WHERE public.me_can_view(fr.classification, fr.org_unit_id)
            GROUP BY 1) r
      ), '[]'::jsonb)
  ) INTO res;
  RETURN res;
END;
$function$;

REVOKE ALL ON FUNCTION public.me_field_report_map(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_field_report_map(text) TO authenticated, service_role;
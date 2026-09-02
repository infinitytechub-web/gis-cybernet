CREATE OR REPLACE FUNCTION public.me_submit_for_approval(
  _record_type text, _record_id uuid, _workflow_key text DEFAULT 'default')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_class text := 'internal'; v_unit uuid; v_id uuid; v_existing uuid;
  v_can_submit boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _record_type NOT IN ('objective','program','project','budget','resource','procurement') THEN
    RAISE EXCEPTION 'Unsupported record type';
  END IF;
  v_can_submit := public.me_can_manage() OR public.has_role(auth.uid(), 'procurement_officer');
  IF NOT v_can_submit THEN RAISE EXCEPTION 'Not authorized to submit this record'; END IF;

  IF _record_type = 'objective' THEN
    SELECT status, classification, org_unit_id INTO v_status, v_class, v_unit FROM public.me_objectives WHERE id = _record_id;
  ELSIF _record_type = 'program' THEN
    SELECT status, classification, org_unit_id INTO v_status, v_class, v_unit FROM public.me_programs WHERE id = _record_id;
  ELSIF _record_type = 'project' THEN
    SELECT status, classification, org_unit_id INTO v_status, v_class, v_unit FROM public.me_projects WHERE id = _record_id;
  ELSIF _record_type = 'budget' THEN
    SELECT status, classification, org_unit_id INTO v_status, v_class, v_unit FROM public.me_budgets WHERE id = _record_id;
  ELSIF _record_type = 'resource' THEN
    SELECT status, 'internal', org_unit_id INTO v_status, v_class, v_unit FROM public.me_resource_allocations WHERE id = _record_id;
  ELSE
    SELECT status, 'internal', NULL::uuid INTO v_status, v_class, v_unit FROM public.purchase_requisitions WHERE id = _record_id;
  END IF;

  IF v_status IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _record_type IN ('objective','program','project','budget','resource') AND NOT public.me_can_view(v_class, v_unit) THEN
    RAISE EXCEPTION 'Not authorized for this record';
  END IF;
  IF _record_type = 'procurement' AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'procurement_officer') OR EXISTS (SELECT 1 FROM public.purchase_requisitions WHERE id = _record_id AND requested_by = auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized for this record';
  END IF;
  IF v_status NOT IN ('draft','returned','planned','allocated') THEN
    RAISE EXCEPTION 'Record is already % and cannot be submitted', v_status;
  END IF;

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
$$;
REVOKE ALL ON FUNCTION public.me_submit_for_approval(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_submit_for_approval(text, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.me_decide_approval(
  _approval_id uuid, _decision text, _comment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.me_approvals; v_total int; v_new_status text; v_record_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _decision NOT IN ('approve','reject','return') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  IF coalesce(btrim(_comment), '') = '' THEN RAISE EXCEPTION 'A comment is required for every decision'; END IF;
  IF NOT public.me_approval_reviewer() THEN RAISE EXCEPTION 'Not authorized to decide approvals'; END IF;
  SELECT * INTO a FROM public.me_approvals WHERE id = _approval_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Approval not found'; END IF;
  IF NOT public.me_can_view(a.classification, a.org_unit_id) AND NOT public.has_role(auth.uid(), 'procurement_officer') THEN RAISE EXCEPTION 'Not authorized for this approval'; END IF;
  IF a.status NOT IN ('pending','escalated') THEN RAISE EXCEPTION 'Approval is already %', a.status; END IF;
  SELECT count(*) INTO v_total FROM public.me_approval_steps WHERE approval_id = a.id;
  UPDATE public.me_approval_steps SET action = _decision, comment = _comment, approver_user_id = auth.uid(), acted_at = now() WHERE approval_id = a.id AND step_order = a.current_step;
  IF _decision = 'approve' AND a.current_step < v_total THEN
    v_new_status := 'pending'; v_record_status := 'under_review';
    UPDATE public.me_approvals SET current_step = a.current_step + 1, status = 'pending', updated_at = now() WHERE id = a.id;
  ELSIF _decision = 'approve' THEN
    v_new_status := 'approved'; v_record_status := 'approved';
    UPDATE public.me_approvals SET status = 'approved', completed_at = now(), updated_at = now() WHERE id = a.id;
  ELSIF _decision = 'reject' THEN
    v_new_status := 'rejected'; v_record_status := 'rejected';
    UPDATE public.me_approvals SET status = 'rejected', completed_at = now(), updated_at = now() WHERE id = a.id;
  ELSE
    v_new_status := 'returned'; v_record_status := 'returned';
    UPDATE public.me_approvals SET status = 'returned', completed_at = now(), updated_at = now() WHERE id = a.id;
  END IF;
  IF a.record_type = 'objective' THEN UPDATE public.me_objectives SET status = CASE WHEN v_record_status IN ('rejected','returned') THEN 'draft' ELSE v_record_status END, updated_at = now() WHERE id = a.record_id;
  ELSIF a.record_type = 'program' THEN UPDATE public.me_programs SET status = CASE WHEN v_record_status IN ('rejected','returned') THEN 'draft' ELSE v_record_status END, updated_at = now() WHERE id = a.record_id;
  ELSIF a.record_type = 'project' THEN UPDATE public.me_projects SET status = CASE WHEN v_record_status IN ('rejected','returned') THEN 'draft' ELSE v_record_status END, updated_at = now() WHERE id = a.record_id;
  ELSIF a.record_type = 'budget' THEN UPDATE public.me_budgets SET status = CASE WHEN v_record_status IN ('rejected','returned') THEN 'draft' ELSE v_record_status END, updated_at = now() WHERE id = a.record_id;
  ELSIF a.record_type = 'resource' THEN UPDATE public.me_resource_allocations SET status = CASE WHEN v_record_status = 'approved' THEN 'allocated' ELSE v_record_status END, updated_at = now() WHERE id = a.record_id;
  ELSIF a.record_type = 'procurement' THEN UPDATE public.purchase_requisitions SET status = CASE WHEN v_record_status = 'returned' THEN 'draft' ELSE v_record_status END, approved_by = CASE WHEN v_record_status = 'approved' THEN auth.uid() ELSE approved_by END, approved_at = CASE WHEN v_record_status = 'approved' THEN now() ELSE approved_at END, updated_at = now() WHERE id = a.record_id;
  END IF;
  RETURN jsonb_build_object('approval_id', a.id, 'approval_status', v_new_status, 'record_type', a.record_type, 'record_id', a.record_id, 'record_status', v_record_status);
END;
$$;
REVOKE ALL ON FUNCTION public.me_decide_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_decide_approval(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.me_approval_queue(_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(row ORDER BY row->>'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', ap.id, 'record_type', ap.record_type, 'record_id', ap.record_id,
      'record_name', CASE ap.record_type
        WHEN 'objective' THEN (SELECT o.name FROM public.me_objectives o WHERE o.id = ap.record_id)
        WHEN 'program' THEN (SELECT g.name FROM public.me_programs g WHERE g.id = ap.record_id)
        WHEN 'project' THEN (SELECT p.name FROM public.me_projects p WHERE p.id = ap.record_id)
        WHEN 'budget' THEN (SELECT b.name FROM public.me_budgets b WHERE b.id = ap.record_id)
        WHEN 'resource' THEN (SELECT r.label FROM public.me_resource_allocations r WHERE r.id = ap.record_id)
        WHEN 'procurement' THEN (SELECT r.title FROM public.purchase_requisitions r WHERE r.id = ap.record_id)
        ELSE NULL END,
      'record_status', CASE ap.record_type
        WHEN 'objective' THEN (SELECT o.status FROM public.me_objectives o WHERE o.id = ap.record_id)
        WHEN 'program' THEN (SELECT g.status FROM public.me_programs g WHERE g.id = ap.record_id)
        WHEN 'project' THEN (SELECT p.status FROM public.me_projects p WHERE p.id = ap.record_id)
        WHEN 'budget' THEN (SELECT b.status FROM public.me_budgets b WHERE b.id = ap.record_id)
        WHEN 'resource' THEN (SELECT r.status FROM public.me_resource_allocations r WHERE r.id = ap.record_id)
        WHEN 'procurement' THEN (SELECT r.status FROM public.purchase_requisitions r WHERE r.id = ap.record_id)
        ELSE NULL END,
      'workflow_key', ap.workflow_key, 'current_step', ap.current_step,
      'total_steps', (SELECT count(*) FROM public.me_approval_steps s WHERE s.approval_id = ap.id), 'status', ap.status,
      'classification', ap.classification, 'due_date', ap.due_date,
      'overdue', (ap.status IN ('pending','escalated') AND ap.due_date IS NOT NULL AND ap.due_date < current_date),
      'requested_by_name', (SELECT btrim(concat_ws(' ', pf.first_name, pf.last_name)) FROM public.profiles pf WHERE pf.user_id = ap.requested_by),
      'created_at', ap.created_at, 'completed_at', ap.completed_at, 'can_decide', public.me_approval_reviewer(),
      'steps', (SELECT coalesce(jsonb_agg(jsonb_build_object('step_order', s.step_order, 'step_role', s.step_role, 'action', s.action, 'comment', s.comment, 'acted_at', s.acted_at, 'approver_name', (SELECT btrim(concat_ws(' ', pf2.first_name, pf2.last_name)) FROM public.profiles pf2 WHERE pf2.user_id = s.approver_user_id)) ORDER BY s.step_order), '[]'::jsonb) FROM public.me_approval_steps s WHERE s.approval_id = ap.id)
    ) AS row
    FROM public.me_approvals ap
    WHERE (public.me_can_view(ap.classification, ap.org_unit_id) OR public.has_role(auth.uid(), 'procurement_officer'))
      AND (_status IS NULL OR (_status = 'open' AND ap.status IN ('pending','escalated')) OR ap.status = _status)
    ORDER BY ap.created_at DESC LIMIT 200
  ) q;
$$;
REVOKE ALL ON FUNCTION public.me_approval_queue(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_approval_queue(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.me_command_center(_region text DEFAULT NULL, _period_id uuid DEFAULT NULL, _department_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT jsonb_build_object(
    'generated_at', now(),
    'filters', jsonb_build_object('region', _region, 'period_id', _period_id, 'department_id', _department_id),
    'objectives', (SELECT jsonb_build_object('total', count(*), 'active', count(*) FILTER (WHERE status IN ('active','approved')), 'avg_score', round(coalesce(avg(performance_score), 0), 2)) FROM public.me_objectives o WHERE archived_at IS NULL AND public.me_can_view(o.classification, o.org_unit_id) AND (_region IS NULL OR o.region = _region) AND (_department_id IS NULL OR o.department_id = _department_id)),
    'programs', (SELECT jsonb_build_object('total', count(*), 'on_track', count(*) FILTER (WHERE health = 'on_track'), 'at_risk', count(*) FILTER (WHERE health = 'at_risk'), 'critical', count(*) FILTER (WHERE health = 'critical')) FROM public.me_programs g WHERE archived_at IS NULL AND public.me_can_view(g.classification, g.org_unit_id) AND (_region IS NULL OR g.region = _region) AND (_department_id IS NULL OR g.department_id = _department_id)),
    'projects', (SELECT jsonb_build_object('total', count(*), 'active', count(*) FILTER (WHERE status = 'active'), 'completed', count(*) FILTER (WHERE status = 'completed'), 'delayed', count(*) FILTER (WHERE status = 'delayed'), 'on_track', count(*) FILTER (WHERE health = 'on_track'), 'at_risk', count(*) FILTER (WHERE health = 'at_risk'), 'critical', count(*) FILTER (WHERE health = 'critical'), 'avg_complete', round(coalesce(avg(percent_complete),0), 2)) FROM public.me_projects pr WHERE archived_at IS NULL AND public.me_can_view(pr.classification, pr.org_unit_id) AND (_region IS NULL OR pr.region = _region) AND (_department_id IS NULL OR pr.department_id = _department_id)),
    'field_reports', (SELECT jsonb_build_object('total', count(*), 'submitted', count(*) FILTER (WHERE fr.status = 'submitted'), 'approved', count(*) FILTER (WHERE fr.status IN ('verified','approved')), 'pending_review', count(*) FILTER (WHERE fr.status IN ('submitted','returned'))) FROM public.me_field_reports fr WHERE public.me_can_view(fr.classification, fr.org_unit_id) AND (_region IS NULL OR fr.region = _region) AND (_department_id IS NULL OR fr.department_id = _department_id)),
    'resources', (SELECT jsonb_build_object('allocations', count(*), 'quantity', coalesce(sum(quantity),0), 'in_use', count(*) FILTER (WHERE status = 'in_use')) FROM public.me_resource_allocations r WHERE public.me_can_view('internal', r.org_unit_id) AND (_region IS NULL OR r.region = _region)),
    'budget', (SELECT jsonb_build_object('approved', coalesce(sum(coalesce(b.revised_amount, b.approved_amount)),0), 'committed', coalesce(sum(b.committed_amount),0), 'spent', coalesce((SELECT sum(amount) FROM public.me_expenditures e WHERE e.expenditure_type='actual'),0), 'records', count(*), 'pending', count(*) FILTER (WHERE b.status='submitted')) FROM public.me_budgets b WHERE public.me_can_view(b.classification, b.org_unit_id) AND (_region IS NULL OR b.region = _region)),
    'procurement', (SELECT jsonb_build_object('total', count(*), 'pending', count(*) FILTER (WHERE status='submitted'), 'approved', count(*) FILTER (WHERE status='approved'), 'estimated_value', coalesce(sum(estimated_cost),0)) FROM public.purchase_requisitions r WHERE requested_by = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic') OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'procurement_officer') OR public.has_role(auth.uid(),'supervisor')),
    'measures', (SELECT jsonb_build_object('total', count(*), 'kpis', count(*) FILTER (WHERE measure_class = 'kpi'), 'indicators', count(*) FILTER (WHERE measure_class = 'indicator')) FROM public.me_measures m WHERE archived_at IS NULL AND public.me_can_view(m.classification, m.org_unit_id)),
    'achievement', '{}'::jsonb,
    'risks', (SELECT jsonb_build_object('open', count(*) FILTER (WHERE status <> 'closed'), 'high', count(*) FILTER (WHERE risk_score >= 15 AND status <> 'closed'), 'max_score', coalesce(max(risk_score) FILTER (WHERE status <> 'closed'), 0)) FROM public.me_risks rk WHERE public.me_can_view(rk.classification, rk.org_unit_id) AND (_region IS NULL OR rk.region = _region)),
    'incidents', (SELECT jsonb_build_object('open', count(*) FILTER (WHERE status NOT IN ('resolved','closed')), 'critical', count(*) FILTER (WHERE severity='critical' AND status NOT IN ('resolved','closed'))) FROM public.me_incidents ic WHERE public.me_can_view(ic.classification, ic.org_unit_id) AND (_region IS NULL OR ic.region = _region)),
    'approvals', (SELECT jsonb_build_object('pending', count(*) FILTER (WHERE status IN ('pending','escalated')), 'approved', count(*) FILTER (WHERE status='approved')) FROM public.me_approvals ap WHERE public.me_can_view(ap.classification, ap.org_unit_id)),
    'generated_for', auth.uid()
  ) INTO res;
  RETURN res;
END;
$$;
REVOKE ALL ON FUNCTION public.me_command_center(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_command_center(text, uuid, uuid) TO authenticated;
-- Approval workflow for M&E objectives, programs and projects

CREATE OR REPLACE FUNCTION public.me_approval_reviewer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'oic')
      OR public.has_role(auth.uid(), '2ic')
      OR public.has_role(auth.uid(), 'staff_officer')
      OR public.has_role(auth.uid(), 'supervisor')
      OR public.has_role(auth.uid(), 'me_officer');
$$;
GRANT EXECUTE ON FUNCTION public.me_approval_reviewer() TO authenticated;

CREATE OR REPLACE FUNCTION public.me_submit_for_approval(
  _record_type text, _record_id uuid, _workflow_key text DEFAULT 'default')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_class text; v_unit uuid; v_id uuid; v_existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _record_type NOT IN ('objective','program','project') THEN
    RAISE EXCEPTION 'Unsupported record type';
  END IF;
  IF NOT public.me_can_manage() THEN RAISE EXCEPTION 'Not authorized to submit this record'; END IF;

  IF _record_type = 'objective' THEN
    SELECT status, classification, org_unit_id INTO v_status, v_class, v_unit
      FROM public.me_objectives WHERE id = _record_id;
  ELSIF _record_type = 'program' THEN
    SELECT status, classification, org_unit_id INTO v_status, v_class, v_unit
      FROM public.me_programs WHERE id = _record_id;
  ELSE
    SELECT status, classification, org_unit_id INTO v_status, v_class, v_unit
      FROM public.me_projects WHERE id = _record_id;
  END IF;

  IF v_status IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF NOT public.me_can_view(v_class, v_unit) THEN RAISE EXCEPTION 'Not authorized for this record'; END IF;
  IF v_status NOT IN ('draft','returned') THEN
    RAISE EXCEPTION 'Record is already % and cannot be submitted', v_status;
  END IF;

  SELECT id INTO v_existing FROM public.me_approvals
   WHERE record_type = _record_type AND record_id = _record_id
     AND status IN ('pending','escalated') LIMIT 1;
  IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'An approval is already in progress for this record'; END IF;

  INSERT INTO public.me_approvals (record_type, record_id, workflow_key, current_step, status,
      requested_by, org_unit_id, classification, due_date)
  VALUES (_record_type, _record_id, coalesce(_workflow_key,'default'), 1, 'pending',
      auth.uid(), v_unit, coalesce(v_class,'internal'), current_date + 5)
  RETURNING id INTO v_id;

  INSERT INTO public.me_approval_steps (approval_id, step_order, step_role)
  VALUES (v_id, 1, 'supervisor'), (v_id, 2, 'command');

  IF _record_type = 'objective' THEN
    UPDATE public.me_objectives SET status = 'submitted', updated_at = now() WHERE id = _record_id;
  ELSIF _record_type = 'program' THEN
    UPDATE public.me_programs SET status = 'submitted', updated_at = now() WHERE id = _record_id;
  ELSE
    UPDATE public.me_projects SET status = 'submitted', updated_at = now() WHERE id = _record_id;
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
  IF NOT public.me_can_view(a.classification, a.org_unit_id) THEN RAISE EXCEPTION 'Not authorized for this approval'; END IF;
  IF a.status NOT IN ('pending','escalated') THEN RAISE EXCEPTION 'Approval is already %', a.status; END IF;

  SELECT count(*) INTO v_total FROM public.me_approval_steps WHERE approval_id = a.id;

  UPDATE public.me_approval_steps
     SET action = _decision, comment = _comment, approver_user_id = auth.uid(), acted_at = now()
   WHERE approval_id = a.id AND step_order = a.current_step;

  IF _decision = 'approve' THEN
    IF a.current_step < v_total THEN
      v_new_status := 'pending'; v_record_status := 'under_review';
      UPDATE public.me_approvals SET current_step = a.current_step + 1, status = 'pending', updated_at = now()
       WHERE id = a.id;
    ELSE
      v_new_status := 'approved'; v_record_status := 'approved';
      UPDATE public.me_approvals SET status = 'approved', completed_at = now(), updated_at = now()
       WHERE id = a.id;
    END IF;
  ELSIF _decision = 'reject' THEN
    v_new_status := 'rejected'; v_record_status := 'draft';
    UPDATE public.me_approvals SET status = 'rejected', completed_at = now(), updated_at = now() WHERE id = a.id;
  ELSE
    v_new_status := 'returned'; v_record_status := 'draft';
    UPDATE public.me_approvals SET status = 'returned', completed_at = now(), updated_at = now() WHERE id = a.id;
  END IF;

  IF a.record_type = 'objective' THEN
    UPDATE public.me_objectives SET status = v_record_status, updated_at = now() WHERE id = a.record_id;
  ELSIF a.record_type = 'program' THEN
    UPDATE public.me_programs SET status = v_record_status, updated_at = now() WHERE id = a.record_id;
  ELSIF a.record_type = 'project' THEN
    UPDATE public.me_projects SET status = v_record_status, updated_at = now() WHERE id = a.record_id;
  END IF;

  RETURN jsonb_build_object('approval_id', a.id, 'approval_status', v_new_status,
    'record_type', a.record_type, 'record_id', a.record_id, 'record_status', v_record_status);
END;
$$;
REVOKE ALL ON FUNCTION public.me_decide_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_decide_approval(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.me_approval_queue(_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(row ORDER BY row->>'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', ap.id,
      'record_type', ap.record_type,
      'record_id', ap.record_id,
      'record_name', CASE ap.record_type
          WHEN 'objective' THEN (SELECT o.name FROM public.me_objectives o WHERE o.id = ap.record_id)
          WHEN 'program' THEN (SELECT g.name FROM public.me_programs g WHERE g.id = ap.record_id)
          WHEN 'project' THEN (SELECT p.name FROM public.me_projects p WHERE p.id = ap.record_id)
          ELSE NULL END,
      'record_status', CASE ap.record_type
          WHEN 'objective' THEN (SELECT o.status FROM public.me_objectives o WHERE o.id = ap.record_id)
          WHEN 'program' THEN (SELECT g.status FROM public.me_programs g WHERE g.id = ap.record_id)
          WHEN 'project' THEN (SELECT p.status FROM public.me_projects p WHERE p.id = ap.record_id)
          ELSE NULL END,
      'workflow_key', ap.workflow_key,
      'current_step', ap.current_step,
      'total_steps', (SELECT count(*) FROM public.me_approval_steps s WHERE s.approval_id = ap.id),
      'status', ap.status,
      'classification', ap.classification,
      'due_date', ap.due_date,
      'overdue', (ap.status IN ('pending','escalated') AND ap.due_date IS NOT NULL AND ap.due_date < current_date),
      'requested_by_name', (SELECT btrim(concat_ws(' ', pf.first_name, pf.last_name)) FROM public.profiles pf WHERE pf.user_id = ap.requested_by),
      'created_at', ap.created_at,
      'completed_at', ap.completed_at,
      'can_decide', public.me_approval_reviewer(),
      'steps', (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'step_order', s.step_order, 'step_role', s.step_role, 'action', s.action,
            'comment', s.comment, 'acted_at', s.acted_at,
            'approver_name', (SELECT btrim(concat_ws(' ', pf2.first_name, pf2.last_name)) FROM public.profiles pf2 WHERE pf2.user_id = s.approver_user_id))
          ORDER BY s.step_order), '[]'::jsonb)
        FROM public.me_approval_steps s WHERE s.approval_id = ap.id)
    ) AS row
    FROM public.me_approvals ap
    WHERE public.me_can_view(ap.classification, ap.org_unit_id)
      AND (_status IS NULL
           OR (_status = 'open' AND ap.status IN ('pending','escalated'))
           OR ap.status = _status)
    ORDER BY ap.created_at DESC
    LIMIT 200
  ) q;
$$;
REVOKE ALL ON FUNCTION public.me_approval_queue(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_approval_queue(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.me_command_attention(_region text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN jsonb_build_object(
    'approvals', jsonb_build_object(
      'pending', (SELECT count(*) FROM public.me_approvals ap
                   WHERE ap.status IN ('pending','escalated')
                     AND public.me_can_view(ap.classification, ap.org_unit_id)),
      'overdue', (SELECT count(*) FROM public.me_approvals ap
                   WHERE ap.status IN ('pending','escalated') AND ap.due_date < current_date
                     AND public.me_can_view(ap.classification, ap.org_unit_id)),
      'mine', (SELECT count(*) FROM public.me_approvals ap
                WHERE ap.status IN ('pending','escalated') AND public.me_approval_reviewer()
                  AND public.me_can_view(ap.classification, ap.org_unit_id))),
    'top_risks', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', rk.id, 'ref_code', rk.ref_code, 'title', rk.title,
               'risk_score', rk.risk_score, 'risk_level', rk.risk_level, 'status', rk.status) AS x
        FROM public.me_risks rk
        WHERE rk.status <> 'closed' AND public.me_can_view(rk.classification, rk.org_unit_id)
          AND (_region IS NULL OR rk.region = _region)
        ORDER BY rk.risk_score DESC NULLS LAST LIMIT 5) t),
    'critical_incidents', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', ic.id, 'ref_code', ic.ref_code, 'title', ic.title,
               'severity', ic.severity, 'status', ic.status, 'occurred_at', ic.occurred_at) AS x
        FROM public.me_incidents ic
        WHERE ic.status NOT IN ('resolved','closed') AND public.me_can_view(ic.classification, ic.org_unit_id)
          AND (_region IS NULL OR ic.region = _region)
        ORDER BY CASE ic.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                 ic.occurred_at DESC NULLS LAST LIMIT 5) t),
    'reports_pending', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', fr.id, 'ref_code', fr.ref_code, 'title', fr.title,
               'status', fr.status, 'region', fr.region, 'reported_at', fr.reported_at) AS x
        FROM public.me_field_reports fr
        WHERE fr.status IN ('submitted','returned') AND public.me_can_view(fr.classification, fr.org_unit_id)
          AND (_region IS NULL OR fr.region = _region)
        ORDER BY fr.reported_at DESC NULLS LAST LIMIT 5) t),
    'recent_reports', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', fr.id, 'ref_code', fr.ref_code, 'title', fr.title,
               'status', fr.status, 'region', fr.region, 'reported_at', fr.reported_at) AS x
        FROM public.me_field_reports fr
        WHERE public.me_can_view(fr.classification, fr.org_unit_id)
          AND (_region IS NULL OR fr.region = _region)
        ORDER BY fr.created_at DESC LIMIT 5) t),
    'overdue_approvals', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', ap.id, 'record_type', ap.record_type, 'due_date', ap.due_date,
               'current_step', ap.current_step) AS x
        FROM public.me_approvals ap
        WHERE ap.status IN ('pending','escalated') AND ap.due_date < current_date
          AND public.me_can_view(ap.classification, ap.org_unit_id)
        ORDER BY ap.due_date LIMIT 5) t)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.me_command_attention(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_command_attention(text) TO authenticated;
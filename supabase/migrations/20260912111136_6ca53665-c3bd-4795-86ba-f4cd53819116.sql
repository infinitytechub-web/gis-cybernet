CREATE OR REPLACE FUNCTION public.staff_set_status(
  _profile_id uuid,
  _new_status text,
  _reason text,
  _effective_date date DEFAULT current_date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text;
  v_action text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.can_manage_command_tier(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised to change staff status';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF _new_status NOT IN ('active','inactive','study_leave','transferred','partially_active','retired','interdicted') THEN
    RAISE EXCEPTION 'Unknown status %', _new_status;
  END IF;

  SELECT status::text INTO v_prev FROM public.profiles WHERE id = _profile_id;
  IF v_prev IS NULL THEN
    RAISE EXCEPTION 'Staff record not found';
  END IF;

  v_action := CASE WHEN _new_status = 'active' THEN 'reactivate' ELSE 'deactivate' END;

  UPDATE public.profiles
     SET status = _new_status::public.staff_status,
         login_enabled = CASE WHEN _new_status IN ('retired','interdicted') THEN false
                              WHEN _new_status = 'active' THEN true
                              ELSE login_enabled END,
         deactivated_by = CASE WHEN v_action = 'deactivate' THEN auth.uid() ELSE NULL END,
         deactivated_at = CASE WHEN v_action = 'deactivate' THEN now() ELSE NULL END,
         deactivation_reason = CASE WHEN v_action = 'deactivate' THEN _reason ELSE NULL END,
         updated_at = now()
   WHERE id = _profile_id;

  INSERT INTO public.staff_deactivations
    (profile_id, action, previous_status, new_status, reason, effective_date, performed_by)
  VALUES (_profile_id, v_action, v_prev, _new_status, btrim(_reason), COALESCE(_effective_date, current_date), auth.uid());

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, performed_by, details)
  VALUES ('staff_status', _profile_id, v_action, auth.uid(),
          jsonb_build_object('previous_status', v_prev, 'new_status', _new_status,
                             'reason', btrim(_reason), 'effective_date', COALESCE(_effective_date, current_date)));
END;
$$;

REVOKE ALL ON FUNCTION public.staff_set_status(uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_status(uuid, text, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_review_minor(
  _profile_id uuid,
  _decision text,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can review minor records';
  END IF;
  IF _decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  UPDATE public.profiles
     SET minor_status = _decision,
         minor_reviewed_by = auth.uid(),
         minor_reviewed_at = now(),
         minor_review_reason = btrim(_reason),
         updated_at = now()
   WHERE id = _profile_id AND is_minor = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff record is not flagged as a minor';
  END IF;

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, performed_by, details)
  VALUES ('staff_minor_review', _profile_id, _decision, auth.uid(),
          jsonb_build_object('reason', btrim(_reason)));
END;
$$;

REVOKE ALL ON FUNCTION public.staff_review_minor(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_review_minor(uuid, text, text) TO authenticated;
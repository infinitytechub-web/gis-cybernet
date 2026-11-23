CREATE OR REPLACE FUNCTION public.purge_expired_recycle_bin()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _all JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only Super Admins can purge the recycle bin' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(p), '[]'::jsonb) INTO _all
  FROM public.recycle_bin r, LATERAL jsonb_array_elements(COALESCE(r.storage_paths, '[]'::jsonb)) p
  WHERE r.restored_at IS NULL AND r.purged_at IS NULL AND r.expires_at < now();
  DELETE FROM public.recycle_bin WHERE restored_at IS NULL AND purged_at IS NULL AND expires_at < now();
  RETURN _all;
END;
$function$;

ALTER FUNCTION public.detect_rotation_conflicts(shift_rotation_scope, text, date, date, uuid) RENAME TO _detect_rotation_conflicts_impl;
REVOKE EXECUTE ON FUNCTION public._detect_rotation_conflicts_impl(shift_rotation_scope, text, date, date, uuid) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.detect_rotation_conflicts(_scope_type shift_rotation_scope, _scope_value text, _start_date date, _end_date date, _exclude_assignment_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(assignment_id uuid, schedule_id uuid, schedule_name text, start_date date, end_date date)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_manage_command_tier(auth.uid())) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public._detect_rotation_conflicts_impl(_scope_type, _scope_value, _start_date, _end_date, _exclude_assignment_id);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.detect_rotation_conflicts(shift_rotation_scope, text, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detect_rotation_conflicts(shift_rotation_scope, text, date, date, uuid) TO authenticated, service_role;

ALTER FUNCTION public.verify_interlink_approval_chain() RENAME TO _verify_interlink_approval_chain_impl;
REVOKE EXECUTE ON FUNCTION public._verify_interlink_approval_chain_impl() FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.verify_interlink_approval_chain()
 RETURNS TABLE(total bigint, verified bigint, first_break_id uuid, first_break_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public._verify_interlink_approval_chain_impl();
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.verify_interlink_approval_chain() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_interlink_approval_chain() TO authenticated, service_role;

ALTER FUNCTION public.verify_threshold_audit_chain() RENAME TO _verify_threshold_audit_chain_impl;
REVOKE EXECUTE ON FUNCTION public._verify_threshold_audit_chain_impl() FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.verify_threshold_audit_chain()
 RETURNS TABLE(total bigint, verified bigint, first_break_id uuid, first_break_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public._verify_threshold_audit_chain_impl();
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.verify_threshold_audit_chain() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_threshold_audit_chain() TO authenticated, service_role;
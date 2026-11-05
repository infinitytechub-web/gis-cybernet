CREATE OR REPLACE FUNCTION public.hr_duty_dashboard_summary(_org_unit_id uuid DEFAULT NULL, _since timestamptz DEFAULT NULL, _self boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE ids uuid[]; units uuid[]; today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF NOT _self AND NOT public.has_profile_oversight_role(auth.uid()) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
 IF _org_unit_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.org_units WHERE id=_org_unit_id) THEN RAISE EXCEPTION 'Command unavailable' USING ERRCODE='42501'; END IF;
  SELECT array_agg(d) INTO units FROM public.org_unit_descendants(_org_unit_id) d;
 END IF;
 SELECT coalesce(array_agg(p.id),ARRAY[]::uuid[]) INTO ids FROM public.profiles p WHERE p.deleted_at IS NULL AND (NOT _self OR p.user_id=auth.uid()) AND (units IS NULL OR p.org_unit_id=ANY(units));
 RETURN jsonb_build_object('as_of',now(),'day',today,
  'shifts',jsonb_build_object('assigned_staff',(SELECT count(DISTINCT profile_id) FROM public.shift_assignments WHERE profile_id=ANY(ids) AND start_date<=today AND (end_date IS NULL OR end_date>=today)), 'assignments',(SELECT count(*) FROM public.shift_assignments WHERE profile_id=ANY(ids) AND start_date<=today AND (end_date IS NULL OR end_date>=today))),
  'on_leave',(SELECT count(DISTINCT profile_id) FROM public.leave_requests WHERE profile_id=ANY(ids) AND status='approved' AND start_date<=today AND end_date>=today),
  'excused_today',(SELECT count(DISTINCT staff_profile_id) FROM public.excuse_duty_forms WHERE staff_profile_id=ANY(ids) AND status='approved' AND start_date<=today AND end_date>=today),
  'excuse_requests',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM public.excuse_duty_forms WHERE staff_profile_id=ANY(ids) AND (_since IS NULL OR created_at>=_since) GROUP BY status) s),'{}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.hr_duty_dashboard_summary(uuid,timestamptz,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_duty_dashboard_summary(uuid,timestamptz,boolean) TO authenticated;
COMMENT ON FUNCTION public.hr_duty_dashboard_summary(uuid,timestamptz,boolean) IS 'Caller-RLS duty aggregates; excludes deleted personnel, counts distinct officers, keeps approved leave and medical excuse separate, and returns no medical details.';
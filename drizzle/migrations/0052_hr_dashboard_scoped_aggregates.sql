CREATE OR REPLACE FUNCTION public.hrm_dashboard_summary(_org_unit_id uuid DEFAULT NULL, _since timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb; downloads jsonb := NULL; ids uuid[]; units uuid[];
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_profile_oversight_role(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF _org_unit_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.org_units WHERE id=_org_unit_id) THEN RAISE EXCEPTION 'Command unavailable'; END IF;
  SELECT array_agg(d) INTO units FROM public.org_unit_descendants(_org_unit_id) d;
 END IF;
 SELECT coalesce(array_agg(p.id),ARRAY[]::uuid[]) INTO ids FROM public.profiles p WHERE p.deleted_at IS NULL AND (units IS NULL OR p.org_unit_id=ANY(units));
 WITH current_staff AS (SELECT p.id,p.org_unit_id,p.status::text status FROM public.profiles p WHERE p.id=ANY(ids)),
 applications AS (SELECT a.status FROM public.staff_applications a WHERE (_since IS NULL OR a.created_at>=_since) AND (units IS NULL OR a.target_org_unit_id=ANY(units)) AND (a.profile_id IS NULL OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=a.profile_id AND p.deleted_at IS NULL))),
 transfers AS (SELECT t.status FROM public.staff_transfer_requests t JOIN public.profiles p ON p.id=t.profile_id AND p.deleted_at IS NULL WHERE (_since IS NULL OR t.created_at>=_since) AND (units IS NULL OR t.from_org_unit_id=ANY(units) OR t.to_org_unit_id=ANY(units))),
 promotions AS (SELECT status FROM public.staff_promotions WHERE profile_id=ANY(ids) AND (_since IS NULL OR created_at>=_since)),
 exits AS (SELECT status FROM public.staff_exits WHERE profile_id=ANY(ids) AND (_since IS NULL OR created_at>=_since)),
 attendance AS (SELECT DISTINCT ON (a.profile_id) a.profile_id,a.status::text status FROM public.attendances a WHERE a.profile_id=ANY(ids) AND a.date=(now() AT TIME ZONE 'UTC')::date ORDER BY a.profile_id,a.updated_at DESC,a.id),
 leaves AS (SELECT status::text status FROM public.leave_requests WHERE profile_id=ANY(ids) AND (_since IS NULL OR created_at>=_since))
 SELECT jsonb_build_object('as_of',now(),'staff',jsonb_build_object('total',(SELECT count(*) FROM current_staff),'assigned',(SELECT count(*) FROM current_staff WHERE org_unit_id IS NOT NULL),'unassigned',(SELECT count(*) FROM current_staff WHERE org_unit_id IS NULL),'by_status',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM current_staff GROUP BY status) s),'{}'::jsonb)),
 'applications',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM applications GROUP BY status) s),'{}'::jsonb),
 'transfers',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM transfers GROUP BY status) s),'{}'::jsonb),
 'appointments',(SELECT count(*) FROM public.staff_appointments a WHERE a.profile_id=ANY(ids) AND (_since IS NULL OR a.created_at>=_since) AND (units IS NULL OR a.org_unit_id=ANY(units))),
 'promotions',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM promotions GROUP BY status) s),'{}'::jsonb),
 'exits',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM exits GROUP BY status) s),'{}'::jsonb),
 'attendance',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM attendance GROUP BY status) s),'{}'::jsonb),
 'leave',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM leaves GROUP BY status) s),'{}'::jsonb),
 'certifications',(SELECT count(*) FROM public.certifications WHERE profile_id=ANY(ids) AND (_since IS NULL OR created_at>=_since))) INTO result;
 IF public.has_role(auth.uid(),'admin') THEN
  WITH eligible AS (SELECT a.id,a.format,a.row_count,a.created_at FROM public.hrm_export_audit a WHERE a.export_kind='biodata_service_record' AND (_since IS NULL OR a.created_at>=_since) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id::text=a.details->>'profile_id' AND p.deleted_at IS NULL AND (units IS NULL OR p.org_unit_id=ANY(units))))
  SELECT jsonb_build_object('total',(SELECT count(*) FROM eligible),'records',coalesce((SELECT sum(row_count) FROM eligible),0),'recent',coalesce((SELECT jsonb_agg(r) FROM (SELECT id,format,row_count,created_at FROM eligible ORDER BY created_at DESC LIMIT 25) r),'[]'::jsonb)) INTO downloads;
 END IF;
 RETURN result || jsonb_build_object('downloads',downloads);
END $$;
REVOKE ALL ON FUNCTION public.hrm_dashboard_summary(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hrm_dashboard_summary(uuid,timestamptz) TO authenticated,service_role;
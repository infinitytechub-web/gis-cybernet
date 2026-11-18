CREATE OR REPLACE FUNCTION public.attendance_report_rows(_from date, _to date)
RETURNS TABLE(id uuid, profile_id uuid, owner_user_id uuid, staff_name text, staff_id text, org_unit_id uuid, command_name text, date date, check_in timestamptz, check_out timestamptz, status text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 366 THEN RAISE EXCEPTION 'Choose a date range of at most 367 days'; END IF;
 RETURN QUERY SELECT a.id, p.id, p.user_id, trim(concat_ws(' ',p.first_name,p.last_name)), p.staff_id, p.org_unit_id, coalesce(u.name,'Unassigned'), a.date,a.check_in,a.check_out,a.status::text
 FROM public.attendances a JOIN public.profiles p ON p.id=a.profile_id LEFT JOIN public.org_units u ON u.id=p.org_unit_id
 WHERE p.deleted_at IS NULL AND a.date BETWEEN _from AND _to
 AND (public.has_role(auth.uid(),'admin'::public.app_role) OR p.user_id=auth.uid() OR p.org_unit_id IN (SELECT public.user_org_scope(auth.uid())))
 ORDER BY a.date DESC,a.id;
END $$;
REVOKE ALL ON FUNCTION public.attendance_report_rows(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.attendance_report_rows(date,date) TO authenticated,service_role;
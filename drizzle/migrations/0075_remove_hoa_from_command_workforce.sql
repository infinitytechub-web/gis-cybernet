CREATE OR REPLACE FUNCTION public.command_workforce_dashboard(_day date DEFAULT CURRENT_DATE, _year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); home uuid; branch uuid[]; ids uuid[]; appraisal_access boolean;
BEGIN
 IF uid IS NULL OR NOT (public.is_command_tier(uid) OR public.has_role(uid,'chief_staff_officer')) THEN RAISE EXCEPTION 'Command tier authorization required' USING ERRCODE='42501'; END IF;
 IF public.is_scoped_staff_officer(uid) AND NOT EXISTS(SELECT 1 FROM public.command_tier_grants g WHERE g.user_id=uid AND g.capability='hr' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now())) THEN RAISE EXCEPTION 'Human Resource access required' USING ERRCODE='42501'; END IF;
 IF _day IS NULL OR _year IS NULL OR _year<1900 OR _year>2200 THEN RAISE EXCEPTION 'Invalid reporting date or year'; END IF;
 SELECT p.org_unit_id INTO home FROM public.profiles p WHERE p.user_id=uid AND p.deleted_at IS NULL;
 IF home IS NULL THEN RETURN jsonb_build_object('assigned',false); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.org_units WHERE id=home) THEN RAISE EXCEPTION 'Command unavailable' USING ERRCODE='42501'; END IF;
 SELECT array_agg(d) INTO branch FROM public.org_unit_descendants(home) d;
 SELECT coalesce(array_agg(p.id),ARRAY[]::uuid[]) INTO ids FROM public.profiles p WHERE p.deleted_at IS NULL AND p.org_unit_id=ANY(branch);
 appraisal_access := public.can_manage_appraisals(uid);
 RETURN jsonb_build_object('assigned',true,'as_of',now(),'day',_day,'year',_year,
 'command',(SELECT jsonb_build_object('id',id,'name',name) FROM public.org_units WHERE id=home),
 'staff',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',btrim(concat_ws(' ',p.first_name,p.last_name)),'rank',r.name,'unit',u.name,'status',p.status) ORDER BY p.last_name,p.first_name,p.id) FROM public.profiles p LEFT JOIN public.ranks r ON r.id=p.rank_id LEFT JOIN public.org_units u ON u.id=p.org_unit_id WHERE p.id=ANY(ids)),'[]'::jsonb),
 'shift_staff',(SELECT count(DISTINCT profile_id) FROM public.shift_assignments WHERE profile_id=ANY(ids) AND start_date<=_day AND (end_date IS NULL OR end_date>=_day)),
 'shifts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',btrim(concat_ws(' ',p.first_name,p.last_name)),'shift',s.name,'start_time',s.start_time,'end_time',s.end_time,'start_date',a.start_date,'end_date',a.end_date) ORDER BY p.last_name,a.id) FROM public.shift_assignments a JOIN public.profiles p ON p.id=a.profile_id JOIN public.shifts s ON s.id=a.shift_id WHERE a.profile_id=ANY(ids) AND a.start_date<=_day AND (a.end_date IS NULL OR a.end_date>=_day)),'[]'::jsonb),
 'leave_staff',(SELECT count(DISTINCT profile_id) FROM public.leave_requests WHERE profile_id=ANY(ids) AND status='approved' AND start_date<=_day AND end_date>=_day),
 'leave',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'name',btrim(concat_ws(' ',p.first_name,p.last_name)),'status',l.status,'start_date',l.start_date,'end_date',l.end_date) ORDER BY l.start_date,l.id) FROM public.leave_requests l JOIN public.profiles p ON p.id=l.profile_id WHERE l.profile_id=ANY(ids) AND (l.status='pending' OR (l.start_date<=_day AND l.end_date>=_day))),'[]'::jsonb),
 'appraisal_access',appraisal_access,
 'appraisals',CASE WHEN appraisal_access THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',btrim(concat_ws(' ',p.first_name,p.last_name)),'staff_profile_id',p.id,'period_year',a.period_year,'period_month',a.period_month,'status',a.workflow_state) ORDER BY a.created_at DESC,a.id) FROM public.staff_appraisals a JOIN public.profiles p ON p.id=a.staff_profile_id WHERE a.staff_profile_id=ANY(ids) AND a.period_year=_year),'[]'::jsonb) ELSE NULL END);
END $function$;
CREATE OR REPLACE FUNCTION public.link_external_application_profile(_id uuid, _staff_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.staff_applications; p public.profiles;
BEGIN
  IF auth.uid() IS NULL OR NOT public.hrm_is_hr_admin(auth.uid()) THEN RAISE EXCEPTION 'Only HR administrators can link applicants'; END IF;
  SELECT * INTO a FROM public.staff_applications WHERE id=_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF a.applicant_kind <> 'external' OR a.status <> 'approved' THEN RAISE EXCEPTION 'Only approved recruit applications can be linked'; END IF;
  IF a.profile_id IS NOT NULL THEN RAISE EXCEPTION 'A staff record is already linked'; END IF;
  SELECT * INTO p FROM public.profiles WHERE staff_id=trim(_staff_id) AND deleted_at IS NULL FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Active staff ID not found'; END IF;
  IF p.user_id=auth.uid() THEN RAISE EXCEPTION 'You cannot link your own staff record'; END IF;
  IF upper(regexp_replace(trim(concat_ws(' ',p.first_name,p.last_name)),'\s+',' ','g')) IS DISTINCT FROM upper(regexp_replace(trim(a.external_name),'\s+',' ','g')) THEN RAISE EXCEPTION 'Applicant and staff names do not match; review the staff record'; END IF;
  IF NULLIF(trim(a.external_ghana_card),'') IS NOT NULL AND upper(trim(a.external_ghana_card)) IS DISTINCT FROM upper(trim(p.ghana_card_number)) THEN RAISE EXCEPTION 'Applicant and staff Ghana Cards do not match'; END IF;
  IF EXISTS (SELECT 1 FROM public.staff_applications WHERE profile_id=p.id AND applicant_kind='external' AND id<>a.id AND status NOT IN ('rejected','withdrawn')) THEN RAISE EXCEPTION 'This staff record is already linked to a recruit application'; END IF;
  UPDATE public.staff_applications SET profile_id=p.id,updated_at=now() WHERE id=a.id;
  INSERT INTO public.staff_application_events(application_id,action,from_status,to_status,note) VALUES (a.id,'staff_record_linked',a.status,a.status,'Verified staff ID '||p.staff_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.link_external_application_profile(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.link_external_application_profile(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_staff_application(_id uuid, _effective_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.staff_applications; p public.profiles;
BEGIN
  IF auth.uid() IS NULL OR NOT public.hrm_is_hr_admin(auth.uid()) THEN RAISE EXCEPTION 'Only administrators post applicants'; END IF;
  SELECT * INTO a FROM public.staff_applications WHERE id=_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF a.application_type='transfer' THEN RAISE EXCEPTION 'Transfers must follow command approval steps'; END IF;
  IF a.status<>'approved' THEN RAISE EXCEPTION 'Only approved applications can be posted'; END IF;
  IF _effective_date IS NULL THEN RAISE EXCEPTION 'Effective date is required'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id=a.profile_id AND deleted_at IS NULL FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Link an active staff record before posting'; END IF;
  IF p.user_id=auth.uid() THEN RAISE EXCEPTION 'You cannot post your own application'; END IF;
  IF a.target_org_unit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.org_units WHERE id=a.target_org_unit_id AND is_active) THEN RAISE EXCEPTION 'Destination command is paused or unavailable'; END IF;
  IF a.target_org_unit_id IS NULL AND NULLIF(trim(a.position_title),'') IS NULL THEN RAISE EXCEPTION 'A position or destination is required'; END IF;
  IF a.target_org_unit_id IS NOT NULL AND a.target_org_unit_id IS DISTINCT FROM p.org_unit_id THEN
    PERFORM public.command_move_officers(ARRAY[p.id],a.target_org_unit_id,NULL,'Application '||a.application_type||COALESCE(': '||a.position_title,''),_effective_date);
  END IF;
  IF NULLIF(trim(a.position_title),'') IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.staff_appointments WHERE profile_id=p.id AND end_date IS NULL AND start_date>_effective_date) THEN RAISE EXCEPTION 'Effective date precedes the current appointment'; END IF;
    UPDATE public.staff_appointments SET end_date=_effective_date WHERE profile_id=p.id AND end_date IS NULL;
    INSERT INTO public.staff_appointments(profile_id,position_title,org_unit_id,start_date,appointing_authority,reference_no,remarks)
    VALUES(p.id,a.position_title,COALESCE(a.target_org_unit_id,p.org_unit_id),_effective_date,'Staff application approval',a.id::text,'Posted from staff application');
    UPDATE public.profiles SET current_appointment=a.position_title,updated_at=now() WHERE id=p.id;
  END IF;
  UPDATE public.staff_applications SET posted_at=now(),posted_effective_date=_effective_date WHERE id=a.id;
  PERFORM public._app_set_status(a.id,'posted','posted',NULL);
END $$;
REVOKE EXECUTE ON FUNCTION public.post_staff_application(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_staff_application(uuid,date) TO authenticated;
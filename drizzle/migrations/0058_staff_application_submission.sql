CREATE OR REPLACE FUNCTION public.record_staff_application(_profile_id uuid, _type text, _position_title text, _target_org_unit_id uuid, _statement text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.profiles; nid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to submit an application'; END IF;
 IF _type IS NULL OR _type NOT IN ('position','posting') THEN RAISE EXCEPTION 'Select position or posting; transfers use the command approval workflow'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=_profile_id AND deleted_at IS NULL FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Active staff record not found'; END IF;
 IF p.user_id IS DISTINCT FROM auth.uid() AND NOT (public.hrm_can_record(auth.uid(),p.id) AND public.so_can_see_profile(auth.uid(),p.id)) THEN RAISE EXCEPTION 'Not authorised to submit for this officer'; END IF;
 IF length(trim(COALESCE(_statement,'')))<20 THEN RAISE EXCEPTION 'Statement must contain at least 20 characters'; END IF;
 IF _type='position' AND NULLIF(trim(_position_title),'') IS NULL THEN RAISE EXCEPTION 'Position is required'; END IF;
 IF _type='posting' AND _target_org_unit_id IS NULL THEN RAISE EXCEPTION 'Destination command is required'; END IF;
 IF _target_org_unit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.org_units WHERE id=_target_org_unit_id AND is_active AND public.can_see_org_unit(auth.uid(),id)) THEN RAISE EXCEPTION 'Destination is inactive or outside your authorised commands'; END IF;
 IF EXISTS(SELECT 1 FROM public.staff_applications WHERE profile_id=p.id AND application_type=_type AND lower(trim(COALESCE(position_title,'')))=lower(trim(COALESCE(_position_title,''))) AND target_org_unit_id IS NOT DISTINCT FROM _target_org_unit_id AND status NOT IN ('rejected','posted','withdrawn','panel_not_recommended')) THEN RAISE EXCEPTION 'An open application already exists for this officer and position or destination'; END IF;
 INSERT INTO public.staff_applications(applicant_kind,application_type,profile_id,position_title,target_org_unit_id,statement) VALUES('internal',_type,p.id,NULLIF(trim(_position_title),''),_target_org_unit_id,trim(_statement)) RETURNING id INTO nid;
 INSERT INTO public.staff_application_events(application_id,action,to_status) VALUES(nid,'submitted','submitted');
 RETURN nid;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_staff_application(uuid,text,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_staff_application(uuid,text,text,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.submit_staff_application(_type text,_position_title text,_target_org_unit_id uuid,_statement text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid;
BEGIN
 SELECT id INTO pid FROM public.profiles WHERE user_id=auth.uid() AND deleted_at IS NULL LIMIT 1;
 RETURN public.record_staff_application(pid,_type,_position_title,_target_org_unit_id,_statement);
END $$;
CREATE OR REPLACE FUNCTION public.shortlist_staff_application(_id uuid,_shortlist boolean,_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.staff_applications;
BEGIN
 SELECT * INTO a FROM public.staff_applications WHERE id=_id FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
 IF NOT public.can_panel_staff_application(auth.uid(),_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF a.application_type='transfer' THEN RAISE EXCEPTION 'Transfers follow command approval steps'; END IF;
 IF a.status<>'submitted' THEN RAISE EXCEPTION 'Only new applications can be shortlisted'; END IF;
 IF _shortlist IS NULL THEN RAISE EXCEPTION 'Choose shortlist or reject'; END IF;
 PERFORM public._app_set_status(_id,CASE WHEN _shortlist THEN 'shortlisted' ELSE 'rejected' END,CASE WHEN _shortlist THEN 'shortlisted' ELSE 'not_shortlisted' END,_note);
END $$;
CREATE OR REPLACE FUNCTION public.schedule_application_interview(_id uuid,_at timestamptz,_location text,_panel text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.staff_applications; nid uuid;
BEGIN
 SELECT * INTO a FROM public.staff_applications WHERE id=_id FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
 IF NOT public.can_panel_staff_application(auth.uid(),_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF a.application_type='transfer' THEN RAISE EXCEPTION 'Transfers follow command approval steps'; END IF;
 IF a.status NOT IN ('shortlisted','interview_scheduled') THEN RAISE EXCEPTION 'Shortlist before scheduling an interview'; END IF;
 IF _at IS NULL OR NULLIF(trim(_panel),'') IS NULL THEN RAISE EXCEPTION 'Interview date and panel members are required'; END IF;
 IF EXISTS(SELECT 1 FROM public.staff_application_interviews WHERE application_id=_id AND recorded_at IS NULL) THEN RAISE EXCEPTION 'An interview is already awaiting a result'; END IF;
 INSERT INTO public.staff_application_interviews(application_id,scheduled_at,location,panel_members) VALUES(_id,_at,NULLIF(trim(_location),''),trim(_panel)) RETURNING id INTO nid;
 PERFORM public._app_set_status(_id,'interview_scheduled','interview_scheduled',to_char(_at AT TIME ZONE 'UTC','DD/MM/YYYY HH24:MI')||' UTC');
 RETURN nid;
END $$;
CREATE OR REPLACE FUNCTION public.record_interview_result(_interview_id uuid,_score int,_recommend boolean,_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE aid uuid; a public.staff_applications; i public.staff_application_interviews;
BEGIN
 SELECT application_id INTO aid FROM public.staff_application_interviews WHERE id=_interview_id;
 SELECT * INTO a FROM public.staff_applications WHERE id=aid FOR UPDATE;
 SELECT * INTO i FROM public.staff_application_interviews WHERE id=_interview_id FOR UPDATE;
 IF a.id IS NULL OR i.id IS NULL OR i.recorded_at IS NOT NULL THEN RAISE EXCEPTION 'Interview not found or already recorded'; END IF;
 IF NOT public.can_panel_staff_application(auth.uid(),aid) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF a.status<>'interview_scheduled' THEN RAISE EXCEPTION 'Application is no longer awaiting interview'; END IF;
 IF _score IS NULL OR _score<0 OR _score>100 OR _recommend IS NULL THEN RAISE EXCEPTION 'Score must be 0–100 and recommendation is required'; END IF;
 UPDATE public.staff_application_interviews SET score=_score,recommendation=CASE WHEN _recommend THEN 'recommend' ELSE 'not_recommend' END,notes=NULLIF(trim(_notes),''),recorded_by=auth.uid(),recorded_at=now() WHERE id=_interview_id;
 PERFORM public._app_set_status(aid,CASE WHEN _recommend THEN 'panel_recommended' ELSE 'panel_not_recommended' END,'interview_recorded','Score '||_score);
END $$;
CREATE OR REPLACE FUNCTION public.decide_staff_application(_id uuid,_approve boolean,_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.staff_applications;
BEGIN
 IF auth.uid() IS NULL OR NOT public.hrm_is_hr_admin(auth.uid()) THEN RAISE EXCEPTION 'Only administrators approve applications'; END IF;
 SELECT * INTO a FROM public.staff_applications WHERE id=_id FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
 IF a.application_type='transfer' THEN RAISE EXCEPTION 'Transfers follow command approval steps'; END IF;
 IF a.status NOT IN ('panel_recommended','panel_not_recommended') THEN RAISE EXCEPTION 'The interview panel must record a result first'; END IF;
 IF _approve IS NULL THEN RAISE EXCEPTION 'Choose approve or reject'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=a.profile_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'You cannot decide your own application'; END IF;
 UPDATE public.staff_applications SET decided_by=auth.uid(),decided_at=now(),decision_note=_note WHERE id=_id;
 PERFORM public._app_set_status(_id,CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,_note);
END $$;
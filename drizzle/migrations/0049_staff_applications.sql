
CREATE OR REPLACE FUNCTION public.hrm_is_hr_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin') OR public.has_role(_uid,'head_of_administration');
$$;

CREATE TABLE public.staff_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_kind text NOT NULL CHECK (applicant_kind IN ('internal','external')),
  application_type text NOT NULL CHECK (application_type IN ('position','posting','transfer','recruitment')),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  external_name text, external_email text, external_phone text, external_ghana_card text,
  position_title text,
  target_org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  transfer_request_id uuid UNIQUE REFERENCES public.staff_transfer_requests(id) ON DELETE SET NULL,
  statement text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','shortlisted','interview_scheduled','interviewed','panel_recommended','panel_not_recommended','approved','rejected','posted','withdrawn')),
  decided_by uuid, decided_at timestamptz, decision_note text,
  posted_at timestamptz, posted_effective_date date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((applicant_kind='internal' AND profile_id IS NOT NULL) OR (applicant_kind='external' AND external_name IS NOT NULL))
);
CREATE INDEX ON public.staff_applications(status);
CREATE INDEX ON public.staff_applications(profile_id);

CREATE TABLE public.staff_application_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.staff_applications(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  location text,
  panel_members text,
  score integer CHECK (score BETWEEN 0 AND 100),
  recommendation text CHECK (recommendation IN ('recommend','not_recommend')),
  notes text,
  scheduled_by uuid DEFAULT auth.uid(),
  recorded_by uuid, recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.staff_application_interviews(application_id);

CREATE TABLE public.staff_application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.staff_applications(id) ON DELETE CASCADE,
  actor_id uuid DEFAULT auth.uid(),
  action text NOT NULL,
  from_status text, to_status text, note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.staff_application_events(application_id);

GRANT SELECT ON public.staff_applications, public.staff_application_interviews, public.staff_application_events TO authenticated;
GRANT ALL ON public.staff_applications, public.staff_application_interviews, public.staff_application_events TO service_role;
ALTER TABLE public.staff_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_application_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_application_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_staff_application(_uid uuid, _app_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_applications a
    WHERE a.id=_app_id AND (
      public.hrm_is_hr_admin(_uid)
      OR (a.profile_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=a.profile_id AND p.user_id=_uid))
      OR (public.has_profile_oversight_role(_uid) AND (
            (a.target_org_unit_id IS NOT NULL AND public.can_manage_org_unit(_uid, a.target_org_unit_id))
         OR (a.profile_id IS NOT NULL AND public.can_access_staff_profile(_uid, a.profile_id))))
    ));
$$;
CREATE OR REPLACE FUNCTION public.can_panel_staff_application(_uid uuid, _app_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_profile_oversight_role(_uid) AND public.can_view_staff_application(_uid,_app_id)
    AND NOT EXISTS (SELECT 1 FROM public.staff_applications a JOIN public.profiles p ON p.id=a.profile_id WHERE a.id=_app_id AND p.user_id=_uid);
$$;

CREATE POLICY "view applications" ON public.staff_applications FOR SELECT TO authenticated USING (public.can_view_staff_application(auth.uid(), id));
CREATE POLICY "view interviews" ON public.staff_application_interviews FOR SELECT TO authenticated USING (public.can_view_staff_application(auth.uid(), application_id));
CREATE POLICY "view events" ON public.staff_application_events FOR SELECT TO authenticated USING (public.can_view_staff_application(auth.uid(), application_id));

CREATE OR REPLACE FUNCTION public.block_staff_application_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Application history is immutable'; END $$;
CREATE TRIGGER staff_application_events_immutable BEFORE UPDATE OR DELETE ON public.staff_application_events FOR EACH ROW EXECUTE FUNCTION public.block_staff_application_event_mutation();

CREATE OR REPLACE FUNCTION public._app_set_status(_id uuid, _to text, _action text, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev text;
BEGIN
  SELECT status INTO prev FROM public.staff_applications WHERE id=_id;
  UPDATE public.staff_applications SET status=_to, updated_at=now() WHERE id=_id;
  INSERT INTO public.staff_application_events(application_id, action, from_status, to_status, note) VALUES (_id, _action, prev, _to, _note);
END $$;
REVOKE EXECUTE ON FUNCTION public._app_set_status(uuid,text,text,text) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.submit_staff_application(_type text, _position_title text, _target_org_unit_id uuid, _statement text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; nid uuid;
BEGIN
  IF _type NOT IN ('position','posting') THEN RAISE EXCEPTION 'Use Apply for transfer for transfers'; END IF;
  SELECT * INTO p FROM public.profiles WHERE user_id=auth.uid() AND deleted_at IS NULL LIMIT 1;
  IF p.id IS NULL THEN RAISE EXCEPTION 'No staff profile for this account'; END IF;
  IF length(trim(COALESCE(_statement,''))) < 20 THEN RAISE EXCEPTION 'Please write a statement of at least 20 characters'; END IF;
  IF _type='position' AND length(trim(COALESCE(_position_title,'')))=0 THEN RAISE EXCEPTION 'Position is required'; END IF;
  IF _type='posting' AND _target_org_unit_id IS NULL THEN RAISE EXCEPTION 'Choose where you want to be posted'; END IF;
  IF EXISTS (SELECT 1 FROM public.staff_applications WHERE profile_id=p.id AND application_type=_type AND COALESCE(position_title,'')=COALESCE(trim(_position_title),'')
             AND COALESCE(target_org_unit_id::text,'')=COALESCE(_target_org_unit_id::text,'') AND status NOT IN ('rejected','posted','withdrawn','panel_not_recommended')) THEN
    RAISE EXCEPTION 'You already have an open application for this'; END IF;
  INSERT INTO public.staff_applications(applicant_kind, application_type, profile_id, position_title, target_org_unit_id, statement)
  VALUES ('internal', _type, p.id, NULLIF(trim(_position_title),''), _target_org_unit_id, trim(_statement)) RETURNING id INTO nid;
  INSERT INTO public.staff_application_events(application_id, action, to_status) VALUES (nid, 'submitted', 'submitted');
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.create_external_application(_name text, _email text, _phone text, _ghana_card text, _position_title text, _target_org_unit_id uuid, _statement text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid;
BEGIN
  IF NOT (public.hrm_is_hr_admin(auth.uid()) OR (public.has_profile_oversight_role(auth.uid()) AND _target_org_unit_id IS NOT NULL AND public.can_manage_org_unit(auth.uid(), _target_org_unit_id))) THEN
    RAISE EXCEPTION 'Not authorised to record recruit applications'; END IF;
  IF length(trim(COALESCE(_name,''))) < 3 THEN RAISE EXCEPTION 'Applicant name is required'; END IF;
  IF _ghana_card IS NOT NULL AND trim(_ghana_card)<>'' AND EXISTS (SELECT 1 FROM public.staff_applications WHERE external_ghana_card=upper(trim(_ghana_card)) AND status NOT IN ('rejected','withdrawn','panel_not_recommended')) THEN
    RAISE EXCEPTION 'An open application already exists for this Ghana Card'; END IF;
  INSERT INTO public.staff_applications(applicant_kind, application_type, external_name, external_email, external_phone, external_ghana_card, position_title, target_org_unit_id, statement)
  VALUES ('external','recruitment', upper(regexp_replace(trim(_name),'\s+',' ','g')), NULLIF(lower(trim(_email)),''), NULLIF(trim(_phone),''), NULLIF(upper(trim(_ghana_card)),''), NULLIF(trim(_position_title),''), _target_org_unit_id, NULLIF(trim(_statement),''))
  RETURNING id INTO nid;
  INSERT INTO public.staff_application_events(application_id, action, to_status) VALUES (nid, 'submitted', 'submitted');
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.shortlist_staff_application(_id uuid, _shortlist boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text; t text;
BEGIN
  SELECT status, application_type INTO s, t FROM public.staff_applications WHERE id=_id;
  IF t='transfer' THEN RAISE EXCEPTION 'Transfer applications follow the transfer approval steps'; END IF;
  IF NOT public.can_panel_staff_application(auth.uid(), _id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF s<>'submitted' THEN RAISE EXCEPTION 'Only new applications can be shortlisted'; END IF;
  PERFORM public._app_set_status(_id, CASE WHEN _shortlist THEN 'shortlisted' ELSE 'rejected' END, CASE WHEN _shortlist THEN 'shortlisted' ELSE 'not_shortlisted' END, _note);
END $$;

CREATE OR REPLACE FUNCTION public.schedule_application_interview(_id uuid, _at timestamptz, _location text, _panel text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text; t text; nid uuid;
BEGIN
  IF NOT public.can_panel_staff_application(auth.uid(), _id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT status, application_type INTO s, t FROM public.staff_applications WHERE id=_id;
  IF t='transfer' THEN RAISE EXCEPTION 'Transfer applications follow the transfer approval steps'; END IF;
  IF s NOT IN ('shortlisted','interview_scheduled') THEN RAISE EXCEPTION 'Shortlist the application before scheduling an interview'; END IF;
  IF length(trim(COALESCE(_panel,'')))=0 THEN RAISE EXCEPTION 'Name the interview panel'; END IF;
  INSERT INTO public.staff_application_interviews(application_id, scheduled_at, location, panel_members) VALUES (_id, _at, NULLIF(trim(_location),''), trim(_panel)) RETURNING id INTO nid;
  PERFORM public._app_set_status(_id, 'interview_scheduled', 'interview_scheduled', to_char(_at AT TIME ZONE 'UTC','DD/MM/YYYY HH24:MI')||' UTC');
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.record_interview_result(_interview_id uuid, _score int, _recommend boolean, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aid uuid;
BEGIN
  SELECT application_id INTO aid FROM public.staff_application_interviews WHERE id=_interview_id AND recorded_at IS NULL;
  IF aid IS NULL THEN RAISE EXCEPTION 'Interview not found or already recorded'; END IF;
  IF NOT public.can_panel_staff_application(auth.uid(), aid) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _score IS NULL OR _score < 0 OR _score > 100 THEN RAISE EXCEPTION 'Score must be 0–100'; END IF;
  UPDATE public.staff_application_interviews SET score=_score, recommendation=CASE WHEN _recommend THEN 'recommend' ELSE 'not_recommend' END,
    notes=NULLIF(trim(_notes),''), recorded_by=auth.uid(), recorded_at=now() WHERE id=_interview_id;
  PERFORM public._app_set_status(aid, CASE WHEN _recommend THEN 'panel_recommended' ELSE 'panel_not_recommended' END, 'interview_recorded', 'Score '||_score);
END $$;

CREATE OR REPLACE FUNCTION public.decide_staff_application(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.staff_applications;
BEGIN
  IF NOT public.hrm_is_hr_admin(auth.uid()) THEN RAISE EXCEPTION 'Only administrators approve applications'; END IF;
  SELECT * INTO a FROM public.staff_applications WHERE id=_id FOR UPDATE;
  IF a.application_type='transfer' THEN RAISE EXCEPTION 'Transfer applications follow the transfer approval steps'; END IF;
  IF a.status NOT IN ('panel_recommended','panel_not_recommended') THEN RAISE EXCEPTION 'The interview panel must record a result first'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=a.profile_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'You cannot decide your own application'; END IF;
  UPDATE public.staff_applications SET decided_by=auth.uid(), decided_at=now(), decision_note=_note WHERE id=_id;
  PERFORM public._app_set_status(_id, CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, _note);
END $$;

CREATE OR REPLACE FUNCTION public.post_staff_application(_id uuid, _effective_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.staff_applications; cur uuid;
BEGIN
  IF NOT public.hrm_is_hr_admin(auth.uid()) THEN RAISE EXCEPTION 'Only administrators post applicants'; END IF;
  SELECT * INTO a FROM public.staff_applications WHERE id=_id FOR UPDATE;
  IF a.status<>'approved' THEN RAISE EXCEPTION 'Only approved applications can be posted'; END IF;
  IF a.applicant_kind='internal' THEN
    SELECT org_unit_id INTO cur FROM public.profiles WHERE id=a.profile_id;
    IF a.target_org_unit_id IS NOT NULL AND a.target_org_unit_id IS DISTINCT FROM cur THEN
      PERFORM public.command_move_officers(ARRAY[a.profile_id], a.target_org_unit_id, NULL, 'Application '||a.application_type||COALESCE(': '||a.position_title,''), COALESCE(_effective_date, current_date));
    END IF;
    IF a.position_title IS NOT NULL THEN
      UPDATE public.staff_appointments SET end_date=COALESCE(_effective_date,current_date) WHERE profile_id=a.profile_id AND end_date IS NULL;
      INSERT INTO public.staff_appointments(profile_id, position_title, org_unit_id, start_date, appointing_authority, reference_no, remarks)
      VALUES (a.profile_id, a.position_title, COALESCE(a.target_org_unit_id, cur), COALESCE(_effective_date,current_date), 'Staff application approval', a.id::text, 'Posted from staff application');
      UPDATE public.profiles SET current_appointment=a.position_title WHERE id=a.profile_id;
    END IF;
  END IF;
  UPDATE public.staff_applications SET posted_at=now(), posted_effective_date=COALESCE(_effective_date,current_date) WHERE id=_id;
  PERFORM public._app_set_status(_id, 'posted', 'posted', NULL);
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_staff_application(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.staff_applications;
BEGIN
  SELECT * INTO a FROM public.staff_applications WHERE id=_id;
  IF a.application_type='transfer' THEN RAISE EXCEPTION 'Withdraw the transfer from My command & transfer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=a.profile_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Not your application'; END IF;
  IF a.status IN ('approved','rejected','posted','withdrawn') THEN RAISE EXCEPTION 'Application can no longer be withdrawn'; END IF;
  PERFORM public._app_set_status(_id, 'withdrawn', 'withdrawn', NULL);
END $$;

CREATE OR REPLACE FUNCTION public.sync_transfer_to_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aid uuid; target text;
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.staff_applications(applicant_kind, application_type, profile_id, target_org_unit_id, transfer_request_id, statement, created_by, created_at)
    VALUES ('internal','transfer', NEW.profile_id, NEW.to_org_unit_id, NEW.id, NEW.reason, NEW.created_by, NEW.created_at) RETURNING id INTO aid;
    INSERT INTO public.staff_application_events(application_id, actor_id, action, to_status, note) VALUES (aid, NEW.created_by, 'transfer_submitted', 'submitted', 'From transfer request');
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    target := CASE NEW.status WHEN 'recommended' THEN 'panel_recommended' WHEN 'approved' THEN 'posted' WHEN 'rejected' THEN 'rejected' WHEN 'withdrawn' THEN 'withdrawn' ELSE NULL END;
    SELECT id INTO aid FROM public.staff_applications WHERE transfer_request_id=NEW.id;
    IF aid IS NOT NULL AND target IS NOT NULL THEN
      IF NEW.status='approved' THEN
        UPDATE public.staff_applications SET decided_by=NEW.decided_by, decided_at=NEW.decided_at, decision_note=NEW.decision_note, posted_at=now(), posted_effective_date=COALESCE(NEW.preferred_date,current_date) WHERE id=aid;
      ELSIF NEW.status='rejected' THEN
        UPDATE public.staff_applications SET decided_by=COALESCE(NEW.decided_by,NEW.recommended_by), decided_at=now(), decision_note=COALESCE(NEW.decision_note,NEW.recommend_note) WHERE id=aid;
      END IF;
      PERFORM public._app_set_status(aid, target, 'transfer_'||NEW.status, COALESCE(NEW.decision_note, NEW.recommend_note));
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_transfer_feeds_applications AFTER INSERT OR UPDATE ON public.staff_transfer_requests FOR EACH ROW EXECUTE FUNCTION public.sync_transfer_to_application();

INSERT INTO public.staff_applications(applicant_kind, application_type, profile_id, target_org_unit_id, transfer_request_id, statement, status, created_by, created_at)
SELECT 'internal','transfer', t.profile_id, t.to_org_unit_id, t.id, t.reason,
  CASE t.status WHEN 'pending' THEN 'submitted' WHEN 'recommended' THEN 'panel_recommended' WHEN 'approved' THEN 'posted' ELSE t.status END,
  t.created_by, t.created_at
FROM public.staff_transfer_requests t ON CONFLICT (transfer_request_id) DO NOTHING;

REVOKE EXECUTE ON FUNCTION public.submit_staff_application(text,text,uuid,text), public.create_external_application(text,text,text,text,text,uuid,text),
  public.shortlist_staff_application(uuid,boolean,text), public.schedule_application_interview(uuid,timestamptz,text,text), public.record_interview_result(uuid,int,boolean,text),
  public.decide_staff_application(uuid,boolean,text), public.post_staff_application(uuid,date), public.withdraw_staff_application(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_staff_application(text,text,uuid,text), public.create_external_application(text,text,text,text,text,uuid,text),
  public.shortlist_staff_application(uuid,boolean,text), public.schedule_application_interview(uuid,timestamptz,text,text), public.record_interview_result(uuid,int,boolean,text),
  public.decide_staff_application(uuid,boolean,text), public.post_staff_application(uuid,date), public.withdraw_staff_application(uuid),
  public.can_panel_staff_application(uuid,uuid), public.hrm_is_hr_admin(uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_applications, public.staff_application_interviews;

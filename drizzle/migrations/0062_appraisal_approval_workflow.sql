ALTER TABLE public.staff_appraisals ADD COLUMN workflow_state text NOT NULL DEFAULT 'draft';
UPDATE public.staff_appraisals SET workflow_state = status::text;
ALTER TABLE public.staff_appraisals ADD CONSTRAINT appraisal_workflow_state_valid CHECK (workflow_state IN ('draft','submitted','under_review','returned','approved','acknowledged'));
CREATE TABLE public.appraisal_workflow_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appraisal_id uuid NOT NULL REFERENCES public.staff_appraisals(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL, action text NOT NULL, from_state text, to_state text NOT NULL, note text, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.appraisal_workflow_events TO authenticated;
GRANT ALL ON public.appraisal_workflow_events TO service_role;
ALTER TABLE public.appraisal_workflow_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX appraisal_workflow_events_record ON public.appraisal_workflow_events(appraisal_id,created_at);
CREATE OR REPLACE FUNCTION public.appraisal_can_manage_profile(_uid uuid,_profile uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _uid IS NOT NULL AND public.can_manage_appraisals(_uid) AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_profile AND p.deleted_at IS NULL AND (public.has_role(_uid,'admin') OR (p.org_unit_id IN (SELECT public.user_org_scope(_uid)) AND public.can_access_staff_profile(_uid,p.id) AND public.so_can_see_profile(_uid,p.id))));
$$;
CREATE OR REPLACE FUNCTION public.appraisal_can_view_profile(_uid uuid,_profile uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _uid IS NOT NULL AND (public.appraisal_can_manage_profile(_uid,_profile) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_profile AND p.user_id=_uid AND p.deleted_at IS NULL));
$$;
REVOKE ALL ON FUNCTION public.appraisal_can_manage_profile(uuid,uuid), public.appraisal_can_view_profile(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.appraisal_can_manage_profile(uuid,uuid), public.appraisal_can_view_profile(uuid,uuid) TO authenticated,service_role;
CREATE POLICY appraisal_header_scoped_read ON public.staff_appraisals AS RESTRICTIVE FOR SELECT TO authenticated USING (public.appraisal_can_view_profile(auth.uid(),staff_profile_id));
CREATE POLICY appraisal_scores_scoped_read ON public.staff_appraisal_scores AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.staff_appraisals a WHERE a.id=appraisal_id AND public.appraisal_can_view_profile(auth.uid(),a.staff_profile_id)));
CREATE POLICY appraisal_audit_scoped_read ON public.staff_appraisal_audit AS RESTRICTIVE FOR SELECT TO authenticated USING (public.appraisal_can_view_profile(auth.uid(),staff_profile_id));
CREATE POLICY appraisal_events_scoped_read ON public.appraisal_workflow_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.staff_appraisals a WHERE a.id=appraisal_id AND public.appraisal_can_view_profile(auth.uid(),a.staff_profile_id)));
CREATE OR REPLACE FUNCTION public.block_appraisal_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Appraisal workflow history is immutable'; END $$;
CREATE TRIGGER immutable_appraisal_workflow_events BEFORE UPDATE OR DELETE ON public.appraisal_workflow_events FOR EACH ROW EXECUTE FUNCTION public.block_appraisal_event_mutation();
REVOKE INSERT,UPDATE,DELETE ON public.staff_appraisals,public.staff_appraisal_scores FROM authenticated;
CREATE OR REPLACE FUNCTION public.appraisal_allowed_actions(_appraisal uuid) RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.staff_appraisals; p public.profiles; actions text[] := '{}'; uid uuid := auth.uid(); manager boolean; head boolean;
BEGIN
 SELECT * INTO a FROM public.staff_appraisals WHERE id=_appraisal;
 IF NOT FOUND OR NOT public.appraisal_can_view_profile(uid,a.staff_profile_id) THEN RETURN actions; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=a.staff_profile_id;
 manager := public.appraisal_can_manage_profile(uid,p.id);
 head := manager AND (public.has_role(uid,'admin') OR public.is_command_head_for(uid,p.org_unit_id)) AND a.appraised_by<>uid AND p.user_id IS DISTINCT FROM uid;
 IF a.workflow_state IN ('draft','returned') AND manager AND (a.appraised_by=uid OR public.has_role(uid,'admin')) THEN actions:=ARRAY['save','submit']; END IF;
 IF a.workflow_state='submitted' AND head THEN actions:=ARRAY['review','return']; END IF;
 IF a.workflow_state='under_review' AND head THEN actions:=ARRAY['approve','return']; END IF;
 IF a.workflow_state='approved' AND p.user_id=uid THEN actions:=ARRAY['acknowledge']; END IF;
 RETURN actions;
END $$;
CREATE OR REPLACE FUNCTION public.appraisal_workflow_context(_appraisal uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.staff_appraisals;
BEGIN
 SELECT * INTO a FROM public.staff_appraisals WHERE id=_appraisal;
 IF NOT FOUND OR NOT public.appraisal_can_view_profile(auth.uid(),a.staff_profile_id) THEN RAISE EXCEPTION 'Not authorized to view this appraisal'; END IF;
 RETURN jsonb_build_object('actions',public.appraisal_allowed_actions(a.id),'record',to_jsonb(a),'scores',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.criterion) FROM public.staff_appraisal_scores s WHERE s.appraisal_id=a.id),'[]'::jsonb),'history',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC) FROM public.appraisal_workflow_events e WHERE e.appraisal_id=a.id),'[]'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION public.appraisal_save(_profile uuid,_year integer,_month integer,_scores jsonb,_comments text,_submit boolean DEFAULT false,_appraisal uuid DEFAULT NULL,_expected_state text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.staff_appraisals; aid uuid; oldstate text; k text; uid uuid:=auth.uid();
BEGIN
 IF NOT public.appraisal_can_manage_profile(uid,_profile) THEN RAISE EXCEPTION 'Not authorized to appraise this officer'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=_profile AND user_id=uid) THEN RAISE EXCEPTION 'You cannot appraise yourself'; END IF;
 IF _year<1900 OR _year>2200 OR (_month IS NOT NULL AND (_month<1 OR _month>12)) THEN RAISE EXCEPTION 'Invalid appraisal period'; END IF;
 IF jsonb_typeof(_scores) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(_scores))<>7 THEN RAISE EXCEPTION 'All seven criteria are required'; END IF;
 FOREACH k IN ARRAY ARRAY['job_knowledge','quality_of_work','productivity','discipline_conduct','leadership_teamwork','initiative','punctuality_attendance'] LOOP
  IF (_scores->>k) IS NULL OR (_scores->>k) !~ '^[1-5]$' THEN RAISE EXCEPTION 'Every criterion must have a score from 1 to 5'; END IF;
 END LOOP;
 IF _appraisal IS NULL THEN
  INSERT INTO public.staff_appraisals(staff_profile_id,appraised_by,period_year,period_month,status,comments) VALUES(_profile,uid,_year,_month,'draft',NULLIF(btrim(_comments),'')) RETURNING id INTO aid;
  oldstate:=NULL;
 ELSE
  SELECT * INTO a FROM public.staff_appraisals WHERE id=_appraisal FOR UPDATE;
  IF NOT FOUND OR a.staff_profile_id<>_profile OR a.period_year<>_year OR a.period_month IS DISTINCT FROM _month THEN RAISE EXCEPTION 'Appraisal does not match this officer and period'; END IF;
  IF a.workflow_state IS DISTINCT FROM _expected_state THEN RAISE EXCEPTION 'Appraisal changed; reload before saving'; END IF;
  IF NOT ('save'=ANY(public.appraisal_allowed_actions(a.id))) THEN RAISE EXCEPTION 'This appraisal cannot be edited'; END IF;
  aid:=a.id; oldstate:=a.workflow_state;
  UPDATE public.staff_appraisals SET comments=NULLIF(btrim(_comments),'') WHERE id=aid;
 END IF;
 INSERT INTO public.staff_appraisal_scores(appraisal_id,criterion,score) SELECT aid,key::public.appraisal_criterion,value::integer FROM jsonb_each_text(_scores) ON CONFLICT(appraisal_id,criterion) DO UPDATE SET score=excluded.score;
 UPDATE public.staff_appraisals SET workflow_state=CASE WHEN _submit THEN 'submitted' ELSE COALESCE(oldstate,'draft') END,status=CASE WHEN _submit THEN 'submitted'::public.appraisal_status ELSE 'draft'::public.appraisal_status END,submitted_at=CASE WHEN _submit THEN now() ELSE submitted_at END WHERE id=aid;
 INSERT INTO public.appraisal_workflow_events(appraisal_id,actor_id,action,from_state,to_state,note) VALUES(aid,uid,CASE WHEN _submit THEN 'submit' ELSE 'save' END,oldstate,CASE WHEN _submit THEN 'submitted' ELSE COALESCE(oldstate,'draft') END,NULLIF(btrim(_comments),''));
 RETURN aid;
END $$;
CREATE OR REPLACE FUNCTION public.appraisal_transition(_appraisal uuid,_action text,_expected_state text,_note text DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.staff_appraisals; nextstate text;
BEGIN
 SELECT * INTO a FROM public.staff_appraisals WHERE id=_appraisal FOR UPDATE;
 IF NOT FOUND OR NOT public.appraisal_can_view_profile(auth.uid(),a.staff_profile_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF a.workflow_state IS DISTINCT FROM _expected_state THEN RAISE EXCEPTION 'Appraisal changed; reload before deciding'; END IF;
 IF _action NOT IN ('review','return','approve','acknowledge') OR NOT (_action=ANY(public.appraisal_allowed_actions(a.id))) THEN RAISE EXCEPTION 'This action is not authorized at this stage'; END IF;
 IF _action='return' AND NULLIF(btrim(_note),'') IS NULL THEN RAISE EXCEPTION 'A correction reason is required'; END IF;
 IF (SELECT count(*) FROM public.staff_appraisal_scores WHERE appraisal_id=a.id)<>7 THEN RAISE EXCEPTION 'Appraisal must contain all seven scores'; END IF;
 nextstate:=CASE _action WHEN 'review' THEN 'under_review' WHEN 'return' THEN 'returned' WHEN 'approve' THEN 'approved' WHEN 'acknowledge' THEN 'acknowledged' END;
 UPDATE public.staff_appraisals SET workflow_state=nextstate,status=CASE WHEN nextstate='acknowledged' THEN 'acknowledged'::public.appraisal_status ELSE 'submitted'::public.appraisal_status END WHERE id=a.id;
 INSERT INTO public.appraisal_workflow_events(appraisal_id,actor_id,action,from_state,to_state,note) VALUES(a.id,auth.uid(),_action,a.workflow_state,nextstate,NULLIF(btrim(_note),''));
 RETURN nextstate;
END $$;
REVOKE ALL ON FUNCTION public.appraisal_allowed_actions(uuid),public.appraisal_workflow_context(uuid),public.appraisal_save(uuid,integer,integer,jsonb,text,boolean,uuid,text),public.appraisal_transition(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.appraisal_allowed_actions(uuid),public.appraisal_workflow_context(uuid),public.appraisal_save(uuid,integer,integer,jsonb,text,boolean,uuid,text),public.appraisal_transition(uuid,text,text,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.appraisal_queue_rows() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id),'[]'::jsonb) FROM (SELECT a.*,p.first_name,p.last_name,p.staff_id,p.org_unit_id,u.name AS command_name,public.appraisal_allowed_actions(a.id) AS actions FROM public.staff_appraisals a JOIN public.profiles p ON p.id=a.staff_profile_id LEFT JOIN public.org_units u ON u.id=p.org_unit_id WHERE public.appraisal_can_view_profile(auth.uid(),p.id)) x;
$$;
REVOKE ALL ON FUNCTION public.appraisal_queue_rows() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.appraisal_queue_rows() TO authenticated,service_role;
COMMENT ON COLUMN public.staff_appraisals.workflow_state IS 'Approval workflow state. Legacy status retained for existing reports; workflow_state drives queue decisions.';
CREATE TABLE public.command_reassignment_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 from_org_unit_id uuid REFERENCES public.org_units(id), to_org_unit_id uuid NOT NULL REFERENCES public.org_units(id),
 reason text NOT NULL, requested_by uuid NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
 decided_by uuid, decision_note text, decided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.command_reassignment_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES public.command_reassignment_requests(id) ON DELETE RESTRICT, actor_id uuid NOT NULL, action text NOT NULL, note text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.command_reassignment_requests,public.command_reassignment_events TO authenticated;
GRANT ALL ON public.command_reassignment_requests,public.command_reassignment_events TO service_role;
ALTER TABLE public.command_reassignment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.command_reassignment_events ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX one_pending_reassignment_per_officer ON public.command_reassignment_requests(profile_id) WHERE status='pending';
CREATE OR REPLACE FUNCTION public.can_view_reassignment(_uid uuid,_r public.command_reassignment_requests) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT _uid IS NOT NULL AND public.can_move_command(_uid) AND (public.has_role(_uid,'admin') OR ((_r.from_org_unit_id IS NOT NULL AND public.has_org_access(_uid,_r.from_org_unit_id)) OR public.has_org_access(_uid,_r.to_org_unit_id)) AND public.so_can_see_profile(_uid,_r.profile_id)) $$;
REVOKE ALL ON FUNCTION public.can_view_reassignment(uuid,public.command_reassignment_requests) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.can_view_reassignment(uuid,public.command_reassignment_requests) TO authenticated,service_role;
CREATE POLICY reassignment_scoped_read ON public.command_reassignment_requests FOR SELECT TO authenticated USING (public.can_view_reassignment(auth.uid(),command_reassignment_requests));
CREATE POLICY reassignment_event_scoped_read ON public.command_reassignment_events FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.command_reassignment_requests r WHERE r.id=request_id AND public.can_view_reassignment(auth.uid(),r)));
CREATE OR REPLACE FUNCTION public.block_reassignment_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Reassignment history is immutable'; END $$;
CREATE TRIGGER immutable_reassignment_events BEFORE UPDATE OR DELETE ON public.command_reassignment_events FOR EACH ROW EXECUTE FUNCTION public.block_reassignment_event_mutation();
CREATE OR REPLACE FUNCTION public.propose_command_reassignment(_profile_id uuid,_expected_org_unit_id uuid,_to_org_unit_id uuid,_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.profiles; rid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_move_command(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to propose reassignments'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=_profile_id AND deleted_at IS NULL FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Active staff record not found'; END IF;
 IF p.user_id=auth.uid() THEN RAISE EXCEPTION 'You cannot propose your own reassignment'; END IF;
 IF p.org_unit_id IS DISTINCT FROM _expected_org_unit_id THEN RAISE EXCEPTION 'Assignment changed; reload before proposing'; END IF;
 IF NOT public.has_role(auth.uid(),'admin') AND (p.org_unit_id IS NULL OR NOT public.has_org_access(auth.uid(),p.org_unit_id) OR NOT public.so_can_see_profile(auth.uid(),p.id)) THEN RAISE EXCEPTION 'Officer is outside your command scope'; END IF;
 IF _to_org_unit_id IS NULL OR _to_org_unit_id IS NOT DISTINCT FROM p.org_unit_id OR NOT EXISTS(SELECT 1 FROM public.org_units u WHERE u.id=_to_org_unit_id AND u.is_active AND (public.has_role(auth.uid(),'admin') OR public.has_org_access(auth.uid(),u.id))) THEN RAISE EXCEPTION 'Select a different active authorised command or unit'; END IF;
 IF NULLIF(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Enter the reassignment reason'; END IF;
 INSERT INTO public.command_reassignment_requests(profile_id,from_org_unit_id,to_org_unit_id,reason,requested_by) VALUES(p.id,p.org_unit_id,_to_org_unit_id,btrim(_reason),auth.uid()) RETURNING id INTO rid;
 INSERT INTO public.command_reassignment_events(request_id,actor_id,action,note) VALUES(rid,auth.uid(),'proposed',btrim(_reason));
 RETURN rid;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'This officer already has a pending reassignment';
END $$;
CREATE OR REPLACE FUNCTION public.decide_command_reassignment(_request_id uuid,_decision text,_note text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.command_reassignment_requests; p public.profiles;
BEGIN
 SELECT * INTO r FROM public.command_reassignment_requests WHERE id=_request_id FOR UPDATE;
 IF r.id IS NULL OR r.status<>'pending' THEN RAISE EXCEPTION 'Reassignment is no longer pending'; END IF;
 IF _decision NOT IN ('approve','reject','cancel') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF _decision='cancel' THEN IF r.requested_by<>auth.uid() THEN RAISE EXCEPTION 'Only the proposer can cancel'; END IF;
 ELSE
  IF r.requested_by=auth.uid() THEN RAISE EXCEPTION 'You cannot decide your own proposal'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.is_command_head_for(auth.uid(),r.from_org_unit_id)) THEN RAISE EXCEPTION 'Only the releasing command OIC/2IC or Super Admin can decide'; END IF;
 END IF;
 IF _decision IN ('reject','cancel') AND NULLIF(btrim(_note),'') IS NULL THEN RAISE EXCEPTION 'A decision reason is required'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=r.profile_id FOR UPDATE;
 IF _decision='approve' THEN
  IF p.deleted_at IS NOT NULL OR p.org_unit_id IS DISTINCT FROM r.from_org_unit_id THEN RAISE EXCEPTION 'Officer assignment changed; reject and re-propose'; END IF;
  IF p.user_id=auth.uid() THEN RAISE EXCEPTION 'You cannot approve your own reassignment'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.org_units WHERE id=r.to_org_unit_id AND is_active) THEN RAISE EXCEPTION 'Destination is no longer active'; END IF;
  PERFORM public.command_move_officers(ARRAY[r.profile_id],r.to_org_unit_id,NULL,r.reason,current_date);
 END IF;
 UPDATE public.command_reassignment_requests SET status=CASE _decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'cancelled' END,decided_by=auth.uid(),decision_note=NULLIF(btrim(_note),''),decided_at=now(),updated_at=now() WHERE id=r.id;
 INSERT INTO public.command_reassignment_events(request_id,actor_id,action,note) VALUES(r.id,auth.uid(),_decision,NULLIF(btrim(_note),''));
 RETURN _decision;
END $$;
REVOKE ALL ON FUNCTION public.propose_command_reassignment(uuid,uuid,uuid,text),public.decide_command_reassignment(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.propose_command_reassignment(uuid,uuid,uuid,text),public.decide_command_reassignment(uuid,text,text) TO authenticated,service_role;
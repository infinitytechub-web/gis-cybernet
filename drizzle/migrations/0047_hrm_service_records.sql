
CREATE OR REPLACE FUNCTION public.hrm_can_record(_uid uuid, _profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin') OR public.has_role(_uid,'head_of_administration')
    OR (public.has_profile_oversight_role(_uid) AND public.can_access_staff_profile(_uid,_profile_id));
$$;

CREATE OR REPLACE FUNCTION public.hrm_can_view(_uid uuid, _profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=_profile_id AND user_id=_uid)
    OR public.hrm_can_record(_uid,_profile_id);
$$;

CREATE TABLE public.staff_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  position_title text NOT NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date,
  appointing_authority text,
  reference_no text,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.staff_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_rank_id uuid REFERENCES public.ranks(id) ON DELETE SET NULL,
  to_rank_id uuid NOT NULL REFERENCES public.ranks(id),
  effective_date date NOT NULL,
  authority text,
  reference_no text,
  remarks text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid, decided_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.staff_exits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exit_type text NOT NULL CHECK (exit_type IN ('resignation','retirement','dismissal','death')),
  notice_date date,
  effective_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid, decided_at timestamptz, decision_note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.staff_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  to_org_unit_id uuid NOT NULL REFERENCES public.org_units(id),
  reason text NOT NULL,
  preferred_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','recommended','approved','rejected','withdrawn')),
  recommended_by uuid, recommended_at timestamptz, recommend_note text,
  decided_by uuid, decided_at timestamptz, decision_note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX staff_transfer_one_open ON public.staff_transfer_requests(profile_id) WHERE status IN ('pending','recommended');
CREATE INDEX ON public.staff_appointments(profile_id);
CREATE INDEX ON public.staff_promotions(profile_id);
CREATE INDEX ON public.staff_exits(profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_appointments TO authenticated;
GRANT SELECT, INSERT ON public.staff_promotions, public.staff_exits TO authenticated;
GRANT SELECT ON public.staff_transfer_requests TO authenticated;
GRANT ALL ON public.staff_appointments, public.staff_promotions, public.staff_exits, public.staff_transfer_requests TO service_role;

ALTER TABLE public.staff_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_exits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_transfer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hrm view appointments" ON public.staff_appointments FOR SELECT TO authenticated USING (public.hrm_can_view(auth.uid(), profile_id));
CREATE POLICY "hrm insert appointments" ON public.staff_appointments FOR INSERT TO authenticated WITH CHECK (public.hrm_can_record(auth.uid(), profile_id));
CREATE POLICY "hrm update appointments" ON public.staff_appointments FOR UPDATE TO authenticated USING (public.hrm_can_record(auth.uid(), profile_id)) WITH CHECK (public.hrm_can_record(auth.uid(), profile_id));
CREATE POLICY "hrm delete appointments" ON public.staff_appointments FOR DELETE TO authenticated USING (public.hrm_can_record(auth.uid(), profile_id));
CREATE POLICY "hrm view promotions" ON public.staff_promotions FOR SELECT TO authenticated USING (public.hrm_can_view(auth.uid(), profile_id));
CREATE POLICY "hrm insert promotions" ON public.staff_promotions FOR INSERT TO authenticated WITH CHECK (public.hrm_can_record(auth.uid(), profile_id) AND status='pending');
CREATE POLICY "hrm view exits" ON public.staff_exits FOR SELECT TO authenticated USING (public.hrm_can_view(auth.uid(), profile_id));
CREATE POLICY "hrm insert exits" ON public.staff_exits FOR INSERT TO authenticated WITH CHECK (public.hrm_can_record(auth.uid(), profile_id) AND status='pending');
CREATE POLICY "hrm view transfers" ON public.staff_transfer_requests FOR SELECT TO authenticated USING (
  public.hrm_can_view(auth.uid(), profile_id)
  OR (to_org_unit_id IS NOT NULL AND public.has_profile_oversight_role(auth.uid()) AND public.can_manage_org_unit(auth.uid(), to_org_unit_id)));

-- Audit
CREATE OR REPLACE FUNCTION public.audit_hrm_service_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.hrm_export_audit(exported_by, export_kind, format, subject, row_count, watermarked, details)
  VALUES (auth.uid(), 'hrm_record_change', TG_OP, TG_TABLE_NAME, 1, false,
    jsonb_build_object('profile_id', COALESCE(NEW.profile_id, OLD.profile_id), 'record_id', COALESCE(NEW.id, OLD.id),
      'new', CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END, 'old', CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END));
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER audit_staff_appointments AFTER INSERT OR UPDATE OR DELETE ON public.staff_appointments FOR EACH ROW EXECUTE FUNCTION public.audit_hrm_service_record();
CREATE TRIGGER audit_staff_promotions AFTER INSERT OR UPDATE ON public.staff_promotions FOR EACH ROW EXECUTE FUNCTION public.audit_hrm_service_record();
CREATE TRIGGER audit_staff_exits AFTER INSERT OR UPDATE ON public.staff_exits FOR EACH ROW EXECUTE FUNCTION public.audit_hrm_service_record();
CREATE TRIGGER audit_staff_transfer_requests AFTER INSERT OR UPDATE ON public.staff_transfer_requests FOR EACH ROW EXECUTE FUNCTION public.audit_hrm_service_record();

-- Decisions
CREATE OR REPLACE FUNCTION public.decide_staff_promotion(_id uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.staff_promotions;
BEGIN
  SELECT * INTO r FROM public.staff_promotions WHERE id=_id FOR UPDATE;
  IF r.id IS NULL OR r.status<>'pending' THEN RAISE EXCEPTION 'Promotion is not pending'; END IF;
  IF NOT public.hrm_can_record(auth.uid(), r.profile_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  UPDATE public.staff_promotions SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, decided_by=auth.uid(), decided_at=now() WHERE id=_id;
  IF _approve THEN UPDATE public.profiles SET rank_id=r.to_rank_id WHERE id=r.profile_id; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.decide_staff_exit(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.staff_exits;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'head_of_administration')) THEN RAISE EXCEPTION 'Only administrators can decide exits'; END IF;
  SELECT * INTO r FROM public.staff_exits WHERE id=_id FOR UPDATE;
  IF r.id IS NULL OR r.status<>'pending' THEN RAISE EXCEPTION 'Exit is not pending'; END IF;
  UPDATE public.staff_exits SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, decided_by=auth.uid(), decided_at=now(), decision_note=_note WHERE id=_id;
  IF _approve THEN
    UPDATE public.profiles SET status = (CASE WHEN r.exit_type='retirement' THEN 'retired' ELSE 'inactive' END)::staff_status,
      deactivated_by=auth.uid(), deactivated_at=now(), deactivation_reason=initcap(r.exit_type)||COALESCE(': '||r.reason,'')
    WHERE id=r.profile_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.request_staff_transfer(_to_org_unit_id uuid, _reason text, _preferred_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; nid uuid;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE user_id=auth.uid() AND deleted_at IS NULL LIMIT 1;
  IF p.id IS NULL THEN RAISE EXCEPTION 'No staff profile for this account'; END IF;
  IF length(trim(COALESCE(_reason,''))) < 10 THEN RAISE EXCEPTION 'Please give a reason (at least 10 characters)'; END IF;
  IF p.org_unit_id = _to_org_unit_id THEN RAISE EXCEPTION 'You are already posted there'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.org_units WHERE id=_to_org_unit_id AND is_active) THEN RAISE EXCEPTION 'Destination is not active'; END IF;
  INSERT INTO public.staff_transfer_requests(profile_id, from_org_unit_id, to_org_unit_id, reason, preferred_date)
  VALUES (p.id, p.org_unit_id, _to_org_unit_id, trim(_reason), _preferred_date) RETURNING id INTO nid;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_staff_transfer(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.staff_transfer_requests t SET status='withdrawn', updated_at=now()
  WHERE t.id=_id AND t.status IN ('pending','recommended')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=t.profile_id AND p.user_id=auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Request cannot be withdrawn'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.recommend_staff_transfer(_id uuid, _recommend boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.staff_transfer_requests;
BEGIN
  SELECT * INTO r FROM public.staff_transfer_requests WHERE id=_id FOR UPDATE;
  IF r.id IS NULL OR r.status<>'pending' THEN RAISE EXCEPTION 'Request is not awaiting recommendation'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR ((public.has_role(auth.uid(),'oic') OR public.has_role(auth.uid(),'2ic')) AND public.can_access_staff_profile(auth.uid(), r.profile_id))) THEN
    RAISE EXCEPTION 'Only the current command OIC/2IC can recommend'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=r.profile_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'You cannot recommend your own request'; END IF;
  UPDATE public.staff_transfer_requests SET status=CASE WHEN _recommend THEN 'recommended' ELSE 'rejected' END,
    recommended_by=auth.uid(), recommended_at=now(), recommend_note=_note, updated_at=now() WHERE id=_id;
END $$;

CREATE OR REPLACE FUNCTION public.decide_staff_transfer(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.staff_transfer_requests;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'head_of_administration')) THEN RAISE EXCEPTION 'Only administrators can approve transfers'; END IF;
  SELECT * INTO r FROM public.staff_transfer_requests WHERE id=_id FOR UPDATE;
  IF r.id IS NULL OR r.status<>'recommended' THEN RAISE EXCEPTION 'Request must be recommended first'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=r.profile_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'You cannot approve your own request'; END IF;
  UPDATE public.staff_transfer_requests SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    decided_by=auth.uid(), decided_at=now(), decision_note=_note, updated_at=now() WHERE id=_id;
  IF _approve THEN
    PERFORM public.command_move_officers(ARRAY[r.profile_id], r.to_org_unit_id, NULL, 'Transfer request: '||r.reason, COALESCE(r.preferred_date, current_date));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.log_kyc_export(_format text, _row_count int, _fields text[], _scope text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_profile_oversight_role(auth.uid())) THEN RAISE EXCEPTION 'Not authorised to export staff profiles'; END IF;
  INSERT INTO public.hrm_export_audit(exported_by, export_kind, format, subject, row_count, watermarked, details)
  VALUES (auth.uid(), 'kyc_profiles', _format, _scope, _row_count, true, jsonb_build_object('fields', _fields));
END $$;

REVOKE EXECUTE ON FUNCTION public.decide_staff_promotion(uuid,boolean), public.decide_staff_exit(uuid,boolean,text), public.request_staff_transfer(uuid,text,date),
  public.withdraw_staff_transfer(uuid), public.recommend_staff_transfer(uuid,boolean,text), public.decide_staff_transfer(uuid,boolean,text), public.log_kyc_export(text,int,text[],text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.decide_staff_promotion(uuid,boolean), public.decide_staff_exit(uuid,boolean,text), public.request_staff_transfer(uuid,text,date),
  public.withdraw_staff_transfer(uuid), public.recommend_staff_transfer(uuid,boolean,text), public.decide_staff_transfer(uuid,boolean,text), public.log_kyc_export(text,int,text[],text),
  public.hrm_can_record(uuid,uuid), public.hrm_can_view(uuid,uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_appointments, public.staff_promotions, public.staff_exits, public.staff_transfer_requests;

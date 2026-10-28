CREATE TABLE public.holding_staff_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 profile_id uuid NOT NULL REFERENCES public.profiles(id),
 org_unit_id uuid NOT NULL REFERENCES public.org_units(id),
 submitted_staff_id text NOT NULL,
 photo_path text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by uuid,
 review_reason text
);
GRANT SELECT ON public.holding_staff_verifications TO authenticated;
GRANT ALL ON public.holding_staff_verifications TO service_role;
ALTER TABLE public.holding_staff_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY holding_verification_read ON public.holding_staff_verifications FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE UNIQUE INDEX holding_one_open_verification ON public.holding_staff_verifications(user_id) WHERE status IN ('pending','approved');
CREATE INDEX holding_verification_review ON public.holding_staff_verifications(status,created_at DESC);

CREATE FUNCTION public.has_holding_verified_access(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (SELECT 1 FROM public.holding_staff_verifications v JOIN public.profiles p ON p.id=v.profile_id WHERE v.user_id=_uid AND v.status='approved' AND p.user_id=_uid AND p.deleted_at IS NULL AND p.status='active' AND p.org_unit_id=v.org_unit_id);
$$;
CREATE FUNCTION public.holding_verified_record_access(_uid uuid,_record uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_holding_verified_access(_uid) AND EXISTS (
 SELECT 1 FROM public.detention_records d JOIN public.profiles creator ON creator.user_id=d.created_by
 JOIN public.profiles viewer ON viewer.user_id=_uid
 WHERE d.id=_record AND d.deleted_at IS NULL AND creator.org_unit_id=viewer.org_unit_id);
$$;
CREATE FUNCTION public.submit_holding_staff_verification(_staff_id text,_photo_path text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.profiles; new_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before submitting verification'; END IF;
 SELECT * INTO p FROM public.profiles WHERE user_id=auth.uid() AND deleted_at IS NULL AND status='active';
 IF p.id IS NULL OR p.org_unit_id IS NULL THEN RAISE EXCEPTION 'An active staff record and assigned Command are required'; END IF;
 IF upper(btrim(_staff_id)) IS DISTINCT FROM upper(btrim(p.staff_id)) OR nullif(btrim(_staff_id),'') IS NULL THEN RAISE EXCEPTION 'Staff ID does not match your registered record'; END IF;
 IF EXISTS (SELECT 1 FROM public.holding_staff_verifications WHERE user_id=auth.uid() AND status IN ('pending','approved')) THEN RAISE EXCEPTION 'You already have a pending or approved verification'; END IF;
 IF split_part(_photo_path,'/',1)<>auth.uid()::text OR NOT EXISTS (
 SELECT 1 FROM storage.objects WHERE bucket_id='holding-staff-verification' AND name=_photo_path AND (metadata->>'mimetype') IN ('image/jpeg','image/png','image/webp') AND (metadata->>'size')::bigint > 0 AND (metadata->>'size')::bigint < 3145728
 ) THEN RAISE EXCEPTION 'Upload a valid private staff photo first'; END IF;
 INSERT INTO public.holding_staff_verifications(user_id,profile_id,org_unit_id,submitted_staff_id,photo_path) VALUES(auth.uid(),p.id,p.org_unit_id,p.staff_id,_photo_path) RETURNING id INTO new_id;
 RETURN new_id;
END;
$$;
CREATE FUNCTION public.review_holding_staff_verification(_id uuid,_decision text,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.holding_staff_verifications;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only Super Admins may review Holding Center access'; END IF;
 IF _decision NOT IN ('approved','rejected','revoked') OR nullif(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'A valid decision and review reason are required'; END IF;
 SELECT * INTO v FROM public.holding_staff_verifications WHERE id=_id FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'Verification not found'; END IF;
 IF v.user_id=auth.uid() THEN RAISE EXCEPTION 'You cannot approve or review your own access'; END IF;
 IF (_decision IN ('approved','rejected') AND v.status<>'pending') OR (_decision='revoked' AND v.status<>'approved') THEN RAISE EXCEPTION 'This verification has already changed; refresh before reviewing'; END IF;
 IF _decision='approved' AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v.profile_id AND p.user_id=v.user_id AND p.deleted_at IS NULL AND p.status='active' AND p.org_unit_id=v.org_unit_id AND p.staff_id=v.submitted_staff_id) THEN RAISE EXCEPTION 'Staff identity or Command has changed; request a new submission'; END IF;
 UPDATE public.holding_staff_verifications SET status=_decision,reviewed_at=now(),reviewed_by=auth.uid(),review_reason=btrim(_reason) WHERE id=_id;
END;
$$;
CREATE FUNCTION public.audit_holding_staff_verification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.system_audit_log(action,entity_type,entity_id,performed_by,details) VALUES(CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'update' END,'holding_staff_verification',NEW.id,auth.uid(),jsonb_build_object('status',NEW.status,'previous_status',CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END,'profile_id',NEW.profile_id,'org_unit_id',NEW.org_unit_id,'reason',NEW.review_reason));
 RETURN NEW;
END;
$$;
CREATE TRIGGER holding_verification_audit AFTER INSERT OR UPDATE ON public.holding_staff_verifications FOR EACH ROW EXECUTE FUNCTION public.audit_holding_staff_verification();
REVOKE ALL ON FUNCTION public.has_holding_verified_access(uuid),public.holding_verified_record_access(uuid,uuid),public.submit_holding_staff_verification(text,text),public.review_holding_staff_verification(uuid,text,text),public.audit_holding_staff_verification() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_holding_verified_access(uuid),public.holding_verified_record_access(uuid,uuid),public.submit_holding_staff_verification(text,text),public.review_holding_staff_verification(uuid,text,text) TO authenticated,service_role;

CREATE POLICY holding_verification_photo_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='holding-staff-verification' AND (storage.foldername(name))[1]=auth.uid()::text AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp') AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.deleted_at IS NULL AND p.status='active' AND p.org_unit_id IS NOT NULL));
CREATE POLICY holding_verification_photo_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='holding-staff-verification' AND EXISTS(SELECT 1 FROM public.holding_staff_verifications v WHERE v.photo_path=name AND (v.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY holding_verification_photo_cleanup ON storage.objects FOR DELETE TO authenticated USING (bucket_id='holding-staff-verification' AND (storage.foldername(name))[1]=auth.uid()::text AND NOT EXISTS(SELECT 1 FROM public.holding_staff_verifications v WHERE v.photo_path=name));
CREATE POLICY verified_staff_read_detention ON public.detention_records FOR SELECT TO authenticated USING (public.holding_verified_record_access(auth.uid(),id));
CREATE POLICY verified_staff_read_offences ON public.suspect_offences FOR SELECT TO authenticated USING (public.holding_verified_record_access(auth.uid(),detention_id));
CREATE POLICY verified_staff_read_documents ON public.suspect_documents FOR SELECT TO authenticated USING (public.holding_verified_record_access(auth.uid(),detention_id));
CREATE POLICY verified_staff_read_repatriation ON public.repatriation_details FOR SELECT TO authenticated USING (public.holding_verified_record_access(auth.uid(),detention_id));
CREATE POLICY verified_staff_read_bail ON public.detention_bail_records FOR SELECT TO authenticated USING (public.holding_verified_record_access(auth.uid(),detention_id));
CREATE POLICY verified_staff_read_visitor ON public.detention_visitor_log FOR SELECT TO authenticated USING (public.holding_verified_record_access(auth.uid(),detention_id));
CREATE POLICY verified_staff_read_medical ON public.detention_medical_log FOR SELECT TO authenticated USING (public.holding_verified_record_access(auth.uid(),detention_id));
CREATE POLICY verified_staff_read_property ON public.detention_property_log FOR SELECT TO authenticated USING (public.holding_verified_record_access(auth.uid(),detention_id));
CREATE POLICY verified_staff_read_transfers ON public.detention_transfers FOR SELECT TO authenticated USING (public.holding_verified_record_access(auth.uid(),detention_id));
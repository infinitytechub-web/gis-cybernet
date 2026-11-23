CREATE OR REPLACE FUNCTION public.admin_hr_grant_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (TG_OP<>'INSERT' AND OLD.capability IN ('payroll-admin','training-admin','performance-admin')) OR (TG_OP<>'DELETE' AND NEW.capability IN ('payroll-admin','training-admin','performance-admin')) THEN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only Super Admins can change personnel administration grants' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN NEW.granted_by=auth.uid(); END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.admin_hr_grant_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER admin_hr_grants_protected BEFORE INSERT OR UPDATE OR DELETE ON public.command_tier_grants FOR EACH ROW EXECUTE FUNCTION public.admin_hr_grant_guard();
CREATE OR REPLACE FUNCTION public.admin_hr_record_history(_module text,_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE target uuid; kind text;
BEGIN
 IF _module='payroll-admin' THEN SELECT profile_id INTO target FROM public.staff_payroll_records WHERE id=_id; kind='staff_payroll_records';
 ELSIF _module='training-admin' THEN SELECT profile_id INTO target FROM public.certifications WHERE id=_id; kind='certifications';
 ELSE RAISE EXCEPTION 'Unsupported record'; END IF;
 IF target IS NULL OR NOT public.admin_hr_profile_allowed(_module,target) THEN RAISE EXCEPTION 'Record history access denied' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'created_at',a.created_at,'reason',a.details->>'reason','actor',trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,''))) ORDER BY a.created_at DESC,a.id) FROM public.system_audit_log a LEFT JOIN public.profiles p ON p.user_id=a.performed_by WHERE a.entity_type=kind AND a.entity_id=_id),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_hr_record_history(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_hr_record_history(text,uuid) TO authenticated,service_role;
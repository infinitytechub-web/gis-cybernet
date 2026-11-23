CREATE OR REPLACE FUNCTION public.admin_hr_module_allowed(_module text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND _module IN ('payroll-admin','training-admin','performance-admin') AND (
 public.has_role(auth.uid(),'admin') OR (
 EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('oic','2ic','chief_staff_officer','staff_officer')) AND (
 (_module <> 'payroll-admin' AND (public.has_role(auth.uid(),'oic') OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'chief_staff_officer')))
 OR EXISTS(SELECT 1 FROM public.command_tier_grants g WHERE g.user_id=auth.uid() AND g.capability=_module AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now()) AND public.has_role(g.granted_by,'admin')))))
$$;
REVOKE ALL ON FUNCTION public.admin_hr_module_allowed(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_hr_module_allowed(text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_hr_profile_allowed(_module text,_profile uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.admin_hr_module_allowed(_module) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=_profile AND p.deleted_at IS NULL AND (public.has_role(auth.uid(),'admin') OR (p.org_unit_id IN (SELECT public.user_org_scope(auth.uid())) AND public.so_can_see_profile(auth.uid(),p.id))))
$$;
REVOKE ALL ON FUNCTION public.admin_hr_profile_allowed(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_hr_profile_allowed(text,uuid) TO authenticated,service_role;
CREATE TABLE public.staff_payroll_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_id uuid NOT NULL REFERENCES public.profiles(id),pay_month date NOT NULL CHECK(extract(day from pay_month)=1),gross_pay numeric(14,2) NOT NULL CHECK(gross_pay>=0),deductions numeric(14,2) NOT NULL DEFAULT 0 CHECK(deductions>=0 AND deductions<=gross_pay),net_pay numeric(14,2) GENERATED ALWAYS AS (gross_pay-deductions) STORED,currency text NOT NULL DEFAULT 'GHS' CHECK(currency ~ '^[A-Z]{3}$'),reference text NOT NULL,notes text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded','void')),revision integer NOT NULL DEFAULT 1,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(profile_id,pay_month)
);
GRANT SELECT ON public.staff_payroll_records TO authenticated;
GRANT ALL ON public.staff_payroll_records TO service_role;
ALTER TABLE public.staff_payroll_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_scoped_read ON public.staff_payroll_records FOR SELECT TO authenticated USING(public.admin_hr_profile_allowed('payroll-admin',profile_id));
CREATE OR REPLACE FUNCTION public.admin_hr_context(_module text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.admin_hr_module_allowed(_module) THEN RAISE EXCEPTION 'You do not have access to this administration screen' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('staff',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'first_name',p.first_name,'last_name',p.last_name,'org_unit_id',p.org_unit_id,'command_name',u.name) ORDER BY p.last_name,p.id) FROM public.profiles p LEFT JOIN public.org_units u ON u.id=p.org_unit_id WHERE public.admin_hr_profile_allowed(_module,p.id)),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_hr_context(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_hr_context(text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_hr_payroll_save(_id uuid,_profile uuid,_month date,_gross numeric,_deductions numeric,_currency text,_reference text,_notes text,_reason text,_revision integer DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.staff_payroll_records; result uuid; before_value jsonb;
BEGIN
 IF NOT public.admin_hr_profile_allowed('payroll-admin',_profile) THEN RAISE EXCEPTION 'Payroll access denied for this officer' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=_profile FOR UPDATE;
 IF length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 OR length(trim(coalesce(_reference,'')))=0 THEN RAISE EXCEPTION 'Reference and change reason are required'; END IF;
 IF _month IS NULL OR extract(day from _month)<>1 OR _gross IS NULL OR _deductions IS NULL OR _gross<0 OR _deductions<0 OR _deductions>_gross OR _currency IS NULL OR _currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Check month, currency and payroll amounts'; END IF;
 IF _id IS NOT NULL THEN
 SELECT * INTO r FROM public.staff_payroll_records WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR r.profile_id<>_profile THEN RAISE EXCEPTION 'Payroll record not found'; END IF;
 IF r.status='void' OR r.revision IS DISTINCT FROM _revision THEN RAISE EXCEPTION 'Record was changed or voided; reload it before editing'; END IF;
 before_value=to_jsonb(r);
 UPDATE public.staff_payroll_records SET pay_month=_month,gross_pay=_gross,deductions=_deductions,currency=_currency,reference=trim(_reference),notes=coalesce(_notes,''),revision=revision+1,updated_at=now() WHERE id=_id RETURNING id INTO result;
 ELSE
 INSERT INTO public.staff_payroll_records(profile_id,pay_month,gross_pay,deductions,currency,reference,notes,created_by) VALUES(_profile,_month,_gross,_deductions,_currency,trim(_reference),coalesce(_notes,''),auth.uid()) RETURNING id INTO result;
 END IF;
 INSERT INTO public.system_audit_log(action,entity_type,entity_id,performed_by,details) SELECT CASE WHEN _id IS NULL THEN 'created' ELSE 'updated' END,'staff_payroll_records',result,auth.uid(),jsonb_build_object('reason',trim(_reason),'before',before_value,'after',to_jsonb(p)) FROM public.staff_payroll_records p WHERE p.id=result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_hr_payroll_save(uuid,uuid,date,numeric,numeric,text,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_hr_payroll_save(uuid,uuid,date,numeric,numeric,text,text,text,text,integer) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_hr_payroll_void(_id uuid,_revision integer,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.staff_payroll_records;
BEGIN
 SELECT * INTO r FROM public.staff_payroll_records WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT public.admin_hr_profile_allowed('payroll-admin',r.profile_id) THEN RAISE EXCEPTION 'Payroll access denied' USING ERRCODE='42501'; END IF;
 IF r.revision IS DISTINCT FROM _revision OR r.status='void' THEN RAISE EXCEPTION 'Record has changed; reload'; END IF;
 IF length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'A reason is required'; END IF;
 UPDATE public.staff_payroll_records SET status='void',revision=revision+1,updated_at=now() WHERE id=_id;
 INSERT INTO public.system_audit_log(action,entity_type,entity_id,performed_by,details) VALUES('voided','staff_payroll_records',_id,auth.uid(),jsonb_build_object('reason',trim(_reason),'before',to_jsonb(r)));
END $$;
REVOKE ALL ON FUNCTION public.admin_hr_payroll_void(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_hr_payroll_void(uuid,integer,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_hr_training_rows() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.admin_hr_module_allowed('training-admin') THEN RAISE EXCEPTION 'Training access denied' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.date_obtained DESC NULLS LAST,x.id) FROM (SELECT c.id,c.profile_id,c.certification_name,c.issuing_body,c.date_obtained,c.expiry_date,c.certificate_number,c.status,c.notes,c.updated_at,p.first_name,p.last_name,p.org_unit_id,u.name AS command_name FROM public.certifications c JOIN public.profiles p ON p.id=c.profile_id LEFT JOIN public.org_units u ON u.id=p.org_unit_id WHERE public.admin_hr_profile_allowed('training-admin',p.id)) x),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_hr_training_rows() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_hr_training_rows() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_hr_training_save(_id uuid,_profile uuid,_name text,_body text,_obtained date,_expiry date,_number text,_notes text,_reason text,_updated_at timestamptz DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.certifications; result uuid; before_value jsonb;
BEGIN
 IF NOT public.admin_hr_profile_allowed('training-admin',_profile) THEN RAISE EXCEPTION 'Training access denied for this officer' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=_profile FOR UPDATE;
 IF length(trim(coalesce(_name,'')))=0 OR _obtained IS NULL OR (_expiry IS NOT NULL AND _expiry<_obtained) OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Check training name, dates and change reason'; END IF;
 IF _id IS NOT NULL THEN
 SELECT * INTO r FROM public.certifications WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR r.profile_id<>_profile OR r.updated_at IS DISTINCT FROM _updated_at THEN RAISE EXCEPTION 'Training record changed; reload it'; END IF;
 before_value=to_jsonb(r);
 UPDATE public.certifications SET certification_name=trim(_name),issuing_body=nullif(trim(_body),''),date_obtained=_obtained,expiry_date=_expiry,certificate_number=nullif(trim(_number),''),notes=_notes,status=CASE WHEN _expiry<current_date THEN 'expired' ELSE 'valid' END,updated_at=now() WHERE id=_id RETURNING id INTO result;
 ELSE
 IF EXISTS(SELECT 1 FROM public.certifications WHERE profile_id=_profile AND lower(trim(certification_name))=lower(trim(_name)) AND date_obtained=_obtained AND coalesce(certificate_number,'')=coalesce(_number,'')) THEN RAISE EXCEPTION 'This training record already exists'; END IF;
 INSERT INTO public.certifications(profile_id,certification_name,issuing_body,date_obtained,expiry_date,certificate_number,notes,status) VALUES(_profile,trim(_name),nullif(trim(_body),''),_obtained,_expiry,nullif(trim(_number),''),_notes,CASE WHEN _expiry<current_date THEN 'expired' ELSE 'valid' END) RETURNING id INTO result;
 END IF;
 INSERT INTO public.system_audit_log(action,entity_type,entity_id,performed_by,details) SELECT CASE WHEN _id IS NULL THEN 'created' ELSE 'updated' END,'certifications',result,auth.uid(),jsonb_build_object('reason',trim(_reason),'before',before_value,'after',to_jsonb(c)) FROM public.certifications c WHERE c.id=result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_hr_training_save(uuid,uuid,text,text,date,date,text,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_hr_training_save(uuid,uuid,text,text,date,date,text,text,text,timestamptz) TO authenticated,service_role;
CREATE POLICY certifications_command_boundary ON public.certifications AS RESTRICTIVE FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=profile_id AND p.deleted_at IS NULL AND (public.has_role(auth.uid(),'admin') OR p.user_id=auth.uid() OR p.org_unit_id IN (SELECT public.user_org_scope(auth.uid()))))) WITH CHECK(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=profile_id AND p.deleted_at IS NULL AND (public.has_role(auth.uid(),'admin') OR p.user_id=auth.uid() OR p.org_unit_id IN (SELECT public.user_org_scope(auth.uid())))));
CREATE POLICY appraisal_command_boundary ON public.staff_appraisals AS RESTRICTIVE FOR SELECT TO authenticated USING(public.appraisal_can_view_profile(auth.uid(),staff_profile_id));
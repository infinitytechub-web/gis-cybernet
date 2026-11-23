CREATE OR REPLACE FUNCTION public.admin_hr_payroll_save(_id uuid,_profile uuid,_month date,_gross numeric,_deductions numeric,_currency text,_reference text,_notes text,_reason text,_revision integer DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.staff_payroll_records; result uuid; before_value jsonb;
BEGIN
 IF NOT public.admin_hr_profile_allowed('payroll-admin',_profile) THEN RAISE EXCEPTION 'Payroll access denied for this officer' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=_profile FOR UPDATE;
 IF NOT public.admin_hr_profile_allowed('payroll-admin',_profile) THEN RAISE EXCEPTION 'Officer assignment changed; payroll access denied' USING ERRCODE='42501'; END IF;
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
CREATE OR REPLACE FUNCTION public.admin_hr_training_save(_id uuid,_profile uuid,_name text,_body text,_obtained date,_expiry date,_number text,_notes text,_reason text,_updated_at timestamptz DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.certifications; result uuid; before_value jsonb;
BEGIN
 IF NOT public.admin_hr_profile_allowed('training-admin',_profile) THEN RAISE EXCEPTION 'Training access denied for this officer' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=_profile FOR UPDATE;
 IF NOT public.admin_hr_profile_allowed('training-admin',_profile) THEN RAISE EXCEPTION 'Officer assignment changed; training access denied' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_name,'')))=0 OR _obtained IS NULL OR (_expiry IS NOT NULL AND _expiry<_obtained) OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Check training name, dates and change reason'; END IF;
 IF _id IS NOT NULL THEN
 SELECT * INTO r FROM public.certifications WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR r.profile_id<>_profile OR r.updated_at IS DISTINCT FROM _updated_at THEN RAISE EXCEPTION 'Training record changed; reload it'; END IF;
 before_value=to_jsonb(r);
 UPDATE public.certifications SET certification_name=trim(_name),issuing_body=nullif(trim(_body),''),date_obtained=_obtained,expiry_date=_expiry,certificate_number=nullif(trim(_number),''),notes=_notes,status=CASE WHEN _expiry<current_date THEN 'expired' ELSE 'valid' END,updated_at=now() WHERE id=_id RETURNING id INTO result;
 ELSE
 IF EXISTS(SELECT 1 FROM public.certifications WHERE profile_id=_profile AND lower(trim(certification_name))=lower(trim(_name)) AND date_obtained=_obtained AND coalesce(certificate_number,'')=coalesce(nullif(trim(_number),''),'')) THEN RAISE EXCEPTION 'This training record already exists'; END IF;
 INSERT INTO public.certifications(profile_id,certification_name,issuing_body,date_obtained,expiry_date,certificate_number,notes,status) VALUES(_profile,trim(_name),nullif(trim(_body),''),_obtained,_expiry,nullif(trim(_number),''),_notes,CASE WHEN _expiry<current_date THEN 'expired' ELSE 'valid' END) RETURNING id INTO result;
 END IF;
 INSERT INTO public.system_audit_log(action,entity_type,entity_id,performed_by,details) SELECT CASE WHEN _id IS NULL THEN 'created' ELSE 'updated' END,'certifications',result,auth.uid(),jsonb_build_object('reason',trim(_reason),'before',before_value,'after',to_jsonb(c)) FROM public.certifications c WHERE c.id=result;
 RETURN result;
END $$;
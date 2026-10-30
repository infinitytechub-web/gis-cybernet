CREATE OR REPLACE FUNCTION public.log_biodata_export(_profile_id uuid, _format text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _name text; _stored_format text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_access_staff_profile(auth.uid(),_profile_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF _format NOT IN ('pdf','word','excel','csv') THEN RAISE EXCEPTION 'Invalid format'; END IF;
 _stored_format := CASE _format WHEN 'word' THEN 'docx' WHEN 'excel' THEN 'xlsx' ELSE _format END;
 SELECT trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) INTO _name FROM public.profiles WHERE id=_profile_id AND deleted_at IS NULL;
 IF _name IS NULL THEN RAISE EXCEPTION 'Staff record unavailable'; END IF;
 INSERT INTO public.hrm_export_audit(exported_by,export_kind,format,subject,row_count,watermarked,details)
 VALUES(auth.uid(),'biodata_service_record',_stored_format,coalesce(nullif(_name,''),'Staff record'),1,false,jsonb_build_object('profile_id',_profile_id));
END $$;
ALTER TABLE public.hrm_export_audit DROP CONSTRAINT hrm_export_audit_format_check;
ALTER TABLE public.hrm_export_audit ADD CONSTRAINT hrm_export_audit_format_check CHECK (format IN ('pdf','csv','xlsx','docx','json'));
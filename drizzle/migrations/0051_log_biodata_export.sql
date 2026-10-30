CREATE OR REPLACE FUNCTION public.log_biodata_export(_profile_id uuid, _format text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_staff_profile(auth.uid(), _profile_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _format NOT IN ('pdf','word','excel','csv') THEN RAISE EXCEPTION 'Invalid format'; END IF;
  SELECT trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) INTO _name FROM public.profiles WHERE id=_profile_id;
  INSERT INTO public.hrm_export_audit(exported_by, export_kind, format, subject, row_count, watermarked, details)
  VALUES (auth.uid(), 'biodata_service_record', _format, coalesce(nullif(_name,''),'Staff record'), 1, false, jsonb_build_object('profile_id', _profile_id));
END $$;
REVOKE EXECUTE ON FUNCTION public.log_biodata_export(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_biodata_export(uuid,text) TO authenticated, service_role;
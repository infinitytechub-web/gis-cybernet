CREATE OR REPLACE FUNCTION public.purge_expired_recycle_bin()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _all JSONB;
BEGIN
  IF session_user IN ('anon','authenticator') AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only Super Admins can purge the recycle bin' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(p), '[]'::jsonb) INTO _all
  FROM public.recycle_bin r, LATERAL jsonb_array_elements(COALESCE(r.storage_paths, '[]'::jsonb)) p
  WHERE r.restored_at IS NULL AND r.purged_at IS NULL AND r.expires_at < now();
  DELETE FROM public.recycle_bin WHERE restored_at IS NULL AND purged_at IS NULL AND expires_at < now();
  RETURN _all;
END;
$function$;
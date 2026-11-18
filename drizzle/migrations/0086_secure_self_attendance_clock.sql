DROP POLICY IF EXISTS "Users can create own attendance" ON public.attendances;
CREATE OR REPLACE FUNCTION public.self_attendance_clock(_action text, _notes text DEFAULT NULL, _token_hash text DEFAULT NULL, _device text DEFAULT NULL, _ip text DEFAULT NULL, _lat double precision DEFAULT NULL, _lng double precision DEFAULT NULL, _address text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); pid uuid; result jsonb; verified_method text := 'manual';
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF _action IS NULL OR _action NOT IN ('check_in','check_out') THEN RAISE EXCEPTION 'Invalid clock action'; END IF;
 IF length(coalesce(_notes,'')) > 2000 OR length(coalesce(_address,'')) > 500 OR length(coalesce(_device,'')) > 200 OR length(coalesce(_ip,'')) > 64 THEN RAISE EXCEPTION 'Clock details are too long'; END IF;
 IF _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Invalid location'; END IF;
 SELECT id INTO pid FROM public.profiles WHERE user_id=uid AND deleted_at IS NULL FOR UPDATE;
 IF pid IS NULL THEN RAISE EXCEPTION 'Active staff record required'; END IF;
 IF _token_hash IS NOT NULL THEN
  UPDATE public.webauthn_stepup_tokens SET used_at=now() WHERE token_hash=_token_hash AND user_id=uid AND action='attendance_clock' AND method='biometric' AND used_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Biometric confirmation expired'; END IF;
  verified_method := 'biometric';
 END IF;
 result := public.roster_clock_action(pid,_action,_notes,NULL::text,NULL::text);
 IF _action='check_in' THEN
  UPDATE public.attendances SET check_in_method=verified_method,check_in_device=_device,check_in_ip=_ip,check_in_lat=_lat,check_in_lng=_lng,check_in_address=_address WHERE id=(result->>'attendance_id')::uuid AND profile_id=pid;
 ELSE
  UPDATE public.attendances SET check_out_method=verified_method,check_out_device=_device,check_out_ip=_ip,check_out_lat=_lat,check_out_lng=_lng,check_out_address=_address WHERE id=(result->>'attendance_id')::uuid AND profile_id=pid;
 END IF;
 RETURN result || jsonb_build_object('method',verified_method);
END; $$;
REVOKE ALL ON FUNCTION public.self_attendance_clock(text,text,text,text,text,double precision,double precision,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.self_attendance_clock(text,text,text,text,text,double precision,double precision,text) TO authenticated,service_role;
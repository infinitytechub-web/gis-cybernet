-- Attendance clock photos: path is "<profile_id>/<action>-<uuid>.<ext>"
CREATE OR REPLACE FUNCTION public.can_touch_attendance_photo(_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  BEGIN
    v_profile := (split_part(_path, '/', 1))::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_profile AND p.user_id = v_uid)
      OR public.has_role(v_uid, 'admin')
      OR public.has_role(v_uid, 'oic')
      OR public.has_role(v_uid, '2ic')
      OR public.has_role(v_uid, 'staff_officer')
      OR public.is_supervisor_for_profile(v_uid, v_profile);
END;
$function$;

REVOKE ALL ON FUNCTION public.can_touch_attendance_photo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_touch_attendance_photo(text) TO authenticated;

CREATE POLICY "Attendance photos: authorised upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance-photos' AND public.can_touch_attendance_photo(name));

CREATE POLICY "Attendance photos: authorised read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-photos' AND public.can_touch_attendance_photo(name));
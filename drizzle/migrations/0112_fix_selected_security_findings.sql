CREATE OR REPLACE FUNCTION public.handle_attendance_edit_request_update()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _is_command boolean;
BEGIN
  _is_command := public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic') OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'staff_officer') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'shift_supervisor') OR public.has_role(auth.uid(),'deputy_shift_supervisor');

  IF auth.uid() = OLD.requested_by AND NOT _is_command THEN
    IF NEW.status <> OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'You may only cancel your own request';
    END IF;
  END IF;

  IF auth.uid() = OLD.requested_by OR auth.uid() = (SELECT user_id FROM public.profiles WHERE id = OLD.profile_id) THEN
    IF NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'You cannot approve or reject your own attendance change request' USING ERRCODE='42501';
    END IF;
    NEW.profile_id := OLD.profile_id; NEW.attendance_id := OLD.attendance_id; NEW.affected_date := OLD.affected_date;
    NEW.field := OLD.field; NEW.proposed_check_in := OLD.proposed_check_in; NEW.proposed_check_out := OLD.proposed_check_out; NEW.reason := OLD.reason;
  END IF;

  IF NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.reviewed_by := auth.uid(); NEW.reviewed_at := now();
    IF NEW.status = 'rejected' AND (NEW.review_comment IS NULL OR length(trim(NEW.review_comment))=0) THEN
      RAISE EXCEPTION 'A review comment is required when rejecting a request';
    END IF;
    IF NEW.status = 'approved' AND NEW.attendance_id IS NOT NULL THEN
      UPDATE public.attendances SET
        check_in = CASE WHEN NEW.field IN ('check_in','both') AND NEW.proposed_check_in IS NOT NULL THEN NEW.proposed_check_in ELSE check_in END,
        check_out = CASE WHEN NEW.field IN ('check_out','both') AND NEW.proposed_check_out IS NOT NULL THEN NEW.proposed_check_out ELSE check_out END
      WHERE id = NEW.attendance_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.appraisal_can_manage_profile(_uid uuid, _profile uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT _uid IS NOT NULL AND (auth.uid() IS NULL OR _uid = auth.uid()) AND public.can_manage_appraisals(_uid) AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_profile AND p.deleted_at IS NULL AND (public.has_role(_uid,'admin') OR (p.org_unit_id IN (SELECT public.user_org_scope(_uid)) AND public.can_access_staff_profile(_uid,p.id) AND public.so_can_see_profile(_uid,p.id))));
$function$;

CREATE OR REPLACE FUNCTION public.appraisal_can_view_profile(_uid uuid, _profile uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT _uid IS NOT NULL AND (auth.uid() IS NULL OR _uid = auth.uid()) AND (public.appraisal_can_manage_profile(_uid,_profile) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_profile AND p.user_id=_uid AND p.deleted_at IS NULL));
$function$;

CREATE OR REPLACE FUNCTION public.guard_visa_extension_decision()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic') OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'staff_officer')) THEN
    RAISE EXCEPTION 'Only approving officers can approve or reject visa extensions' USING ERRCODE='42501';
  END IF;
  IF auth.uid() IS NOT NULL AND NEW.status = 'approved' AND NEW.status IS DISTINCT FROM OLD.status
     AND OLD.processed_by = auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'You cannot approve a visa extension you processed' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_guard_visa_extension_decision ON public.visa_extensions;
CREATE TRIGGER trg_guard_visa_extension_decision BEFORE UPDATE ON public.visa_extensions
  FOR EACH ROW EXECUTE FUNCTION public.guard_visa_extension_decision();

REVOKE EXECUTE ON FUNCTION public.purge_expired_recycle_bin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_expired_recycle_bin() TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.purge_expired_recycle_bin()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _all JSONB;
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.role(),'') <> 'service_role' THEN
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
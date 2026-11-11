CREATE OR REPLACE FUNCTION public.guard_leave_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.profiles%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=NEW.profile_id AND deleted_at IS NULL;
 IF p.id IS NULL THEN RAISE EXCEPTION 'An active officer profile is required'; END IF;
 IF TG_OP='INSERT' THEN
  IF auth.uid() IS NULL OR p.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Submit leave only for your own officer profile' USING ERRCODE='42501'; END IF;
  IF NEW.status<>'pending' OR NEW.approved_by IS NOT NULL OR NEW.decided_at IS NOT NULL THEN RAISE EXCEPTION 'New leave requests must await command approval'; END IF;
  IF NEW.end_date<NEW.start_date THEN RAISE EXCEPTION 'End date cannot precede start date'; END IF;
 ELSE
  IF NEW.status IS DISTINCT FROM OLD.status THEN
   IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.is_command_head_for(auth.uid(),p.org_unit_id)) THEN RAISE EXCEPTION 'Only the officer command OIC, 2IC or Super Admin may decide leave' USING ERRCODE='42501'; END IF;
   IF p.user_id=auth.uid() THEN RAISE EXCEPTION 'You cannot decide your own leave' USING ERRCODE='42501'; END IF;
   IF OLD.status<>'pending' AND NOT (NEW.status='pending' AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'This request has already been decided'; END IF;
   IF NEW.status IN ('approved','rejected') AND nullif(btrim(NEW.comments),'') IS NULL THEN RAISE EXCEPTION 'Decision comments are required'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER aaa_guard_leave_workflow BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.guard_leave_workflow();
CREATE OR REPLACE FUNCTION public.decide_leave_request(_id uuid,_action public.leave_status,_comments text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.leave_requests%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.leave_requests WHERE id=_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Leave request unavailable'; END IF;
 IF _action NOT IN ('approved','rejected','pending') THEN RAISE EXCEPTION 'Invalid leave decision'; END IF;
 UPDATE public.leave_requests SET status=_action,comments=nullif(btrim(_comments),'') WHERE id=_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Leave decision not authorized' USING ERRCODE='42501'; END IF;
 RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.decide_leave_request(uuid,public.leave_status,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.decide_leave_request(uuid,public.leave_status,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.leave_request_queue()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('profiles',jsonb_build_object('first_name',p.first_name,'last_name',p.last_name,'staff_id',p.staff_id,'shift_group',p.shift_group),'approver',(SELECT jsonb_build_object('first_name',a.first_name,'last_name',a.last_name) FROM public.profiles a WHERE a.id=l.approved_by),'can_review',coalesce(p.user_id IS DISTINCT FROM auth.uid() AND (public.has_role(auth.uid(),'admin') OR public.is_command_head_for(auth.uid(),p.org_unit_id)),false)) ORDER BY l.created_at DESC,l.id), '[]'::jsonb)
 FROM public.leave_requests l JOIN public.profiles p ON p.id=l.profile_id AND p.deleted_at IS NULL WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.leave_request_queue() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.leave_request_queue() TO authenticated;
COMMENT ON FUNCTION public.decide_leave_request(uuid,public.leave_status,text) IS 'Caller-RLS locked leave decisions; command heads only, no self decision, comments required; existing metadata and immutable approval audit triggers retained.';
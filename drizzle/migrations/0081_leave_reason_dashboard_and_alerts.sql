ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS reason_category text;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_reason_category_len CHECK (reason_category IS NULL OR char_length(reason_category) BETWEEN 1 AND 80);

CREATE OR REPLACE FUNCTION public.guard_leave_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.profiles%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=NEW.profile_id AND deleted_at IS NULL;
 IF p.id IS NULL THEN RAISE EXCEPTION 'An active officer profile is required'; END IF;
 IF TG_OP='INSERT' THEN
  IF auth.uid() IS NULL OR NOT (p.user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.is_command_head_for(auth.uid(),p.org_unit_id)) THEN RAISE EXCEPTION 'Submit leave only for your own officer profile' USING ERRCODE='42501'; END IF;
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

CREATE OR REPLACE FUNCTION public.notify_leave_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid;
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
  SELECT user_id INTO v_user FROM public.profiles WHERE id=NEW.profile_id;
  IF v_user IS NOT NULL THEN
   INSERT INTO public.notifications(user_id,title,message,type,reference_id)
   VALUES (v_user,
     CASE WHEN NEW.status='approved' THEN 'Leave Approved' ELSE 'Leave Rejected' END,
     format('Your %s leave (%s to %s) was %s. %s', NEW.type, to_char(NEW.start_date,'DD/MM/YYYY'), to_char(NEW.end_date,'DD/MM/YYYY'), NEW.status, coalesce('Comments: '||NEW.comments,'')),
     'leave', NEW.id);
  END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS zz_notify_leave_decision ON public.leave_requests;
CREATE TRIGGER zz_notify_leave_decision AFTER UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.notify_leave_decision();

CREATE OR REPLACE FUNCTION public.command_leave_dashboard(p_from date, p_to date, p_org_unit uuid DEFAULT NULL)
RETURNS TABLE(org_unit_id uuid, command_name text, pending bigint, approved bigint, rejected bigint, approved_days bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT p.org_unit_id, coalesce(o.name,'Unassigned'),
  count(*) FILTER (WHERE l.status='pending'),
  count(*) FILTER (WHERE l.status='approved'),
  count(*) FILTER (WHERE l.status='rejected'),
  coalesce(sum((l.end_date-l.start_date+1)) FILTER (WHERE l.status='approved'),0)::bigint
 FROM public.leave_requests l
 JOIN public.profiles p ON p.id=l.profile_id AND p.deleted_at IS NULL
 LEFT JOIN public.org_units o ON o.id=p.org_unit_id
 WHERE auth.uid() IS NOT NULL
   AND l.start_date <= p_to AND l.end_date >= p_from
   AND (p_org_unit IS NULL OR p.org_unit_id IN (SELECT public.user_org_scope(auth.uid()) INTERSECT SELECT p_org_unit))
   AND (public.has_role(auth.uid(),'admin') OR p.org_unit_id IN (SELECT public.user_org_scope(auth.uid())))
 GROUP BY p.org_unit_id, o.name
 ORDER BY 2;
$$;
REVOKE ALL ON FUNCTION public.command_leave_dashboard(date,date,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.command_leave_dashboard(date,date,uuid) TO authenticated;
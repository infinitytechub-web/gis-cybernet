CREATE OR REPLACE FUNCTION public.guard_own_payroll_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND (p.id=NEW.profile_id OR (TG_OP='UPDATE' AND p.id=OLD.profile_id))) THEN
  RAISE EXCEPTION 'Your payroll must be recorded or changed by another authorized officer' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_own_payroll_changes() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_own_payroll_changes BEFORE INSERT OR UPDATE ON public.staff_payroll_records FOR EACH ROW EXECUTE FUNCTION public.guard_own_payroll_changes();

CREATE OR REPLACE FUNCTION public.guard_own_department_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.department_id IS DISTINCT FROM OLD.department_id AND OLD.user_id=auth.uid() AND NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
  RAISE EXCEPTION 'Your department must be changed by another authorized officer' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_own_department_changes() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_own_department_changes BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_own_department_changes();

CREATE OR REPLACE FUNCTION public.guard_own_posting_decisions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND (p.id=NEW.profile_id OR (TG_OP='UPDATE' AND p.id=OLD.profile_id))) THEN
  IF TG_OP='INSERT' THEN
   IF NEW.status IN ('approved','rejected') OR NEW.approved_by IS NOT NULL THEN
    RAISE EXCEPTION 'You cannot decide your own posting or transfer' USING ERRCODE='42501';
   END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
   RAISE EXCEPTION 'You cannot decide your own posting or transfer' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_own_posting_decisions() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_own_posting_decisions BEFORE INSERT OR UPDATE ON public.postings_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_own_posting_decisions();

CREATE OR REPLACE FUNCTION public.admin_command_officer_search(_term text)
RETURNS TABLE(id uuid,staff_id text,first_name text,last_name text,status public.staff_status)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE pattern text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'Officer search access denied' USING ERRCODE='42501'; END IF;
 IF _term IS NULL OR length(trim(_term))<2 THEN RETURN; END IF;
 IF length(_term)>100 THEN RAISE EXCEPTION 'Search text is too long' USING ERRCODE='22023'; END IF;
 pattern := '%' || replace(replace(replace(trim(_term), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
 RETURN QUERY SELECT p.id,p.staff_id,p.first_name,p.last_name,p.status FROM public.profiles p
 WHERE p.first_name ILIKE pattern ESCAPE E'\\' OR p.last_name ILIKE pattern ESCAPE E'\\' OR p.staff_id ILIKE pattern ESCAPE E'\\'
 ORDER BY p.last_name,p.first_name,p.id LIMIT 20;
END $$;
REVOKE ALL ON FUNCTION public.admin_command_officer_search(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_command_officer_search(text) TO authenticated,service_role;
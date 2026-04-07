-- 1. Fix is_supervisor_for_profile to prevent self-approval
CREATE OR REPLACE FUNCTION public.is_supervisor_for_profile(_user_id uuid, _profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS supervisor
    JOIN public.profiles AS staff ON staff.id = _profile_id
    WHERE supervisor.user_id = _user_id
      AND public.has_role(_user_id, 'supervisor')
      AND staff.user_id IS DISTINCT FROM _user_id
      AND (
        supervisor.department_id IS NOT NULL
        AND (
          supervisor.department_id = (SELECT id FROM departments WHERE name = 'OIC')
          OR supervisor.department_id = staff.department_id
        )
      )
  )
$$;

-- 2. Restrict supervisor updates on leave_requests
CREATE OR REPLACE FUNCTION public.restrict_leave_request_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'Cannot change profile_id';
  END IF;
  IF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'Cannot change leave type';
  END IF;
  IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    RAISE EXCEPTION 'Cannot change start_date';
  END IF;
  IF NEW.end_date IS DISTINCT FROM OLD.end_date THEN
    RAISE EXCEPTION 'Cannot change end_date';
  END IF;
  IF NEW.reason IS DISTINCT FROM OLD.reason THEN
    RAISE EXCEPTION 'Cannot change reason';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER restrict_leave_request_updates_trigger
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.restrict_leave_request_updates();

-- 3. Restrict supervisor updates on postings_transfers
CREATE OR REPLACE FUNCTION public.restrict_posting_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'Cannot change profile_id';
  END IF;
  IF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'Cannot change type';
  END IF;
  IF NEW.from_department_id IS DISTINCT FROM OLD.from_department_id THEN
    RAISE EXCEPTION 'Cannot change from_department_id';
  END IF;
  IF NEW.to_department_id IS DISTINCT FROM OLD.to_department_id THEN
    RAISE EXCEPTION 'Cannot change to_department_id';
  END IF;
  IF NEW.effective_date IS DISTINCT FROM OLD.effective_date THEN
    RAISE EXCEPTION 'Cannot change effective_date';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER restrict_posting_updates_trigger
BEFORE UPDATE ON public.postings_transfers
FOR EACH ROW
EXECUTE FUNCTION public.restrict_posting_updates();

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id),
  ADD COLUMN IF NOT EXISTS shift_group text;

CREATE INDEX IF NOT EXISTS idx_leave_requests_department_id ON public.leave_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_shift_group ON public.leave_requests(shift_group);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status_created ON public.leave_requests(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.snapshot_leave_request_routing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    SELECT department_id, shift_group
      INTO NEW.department_id, NEW.shift_group
    FROM public.profiles
    WHERE id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_leave_request_routing ON public.leave_requests;
CREATE TRIGGER trg_snapshot_leave_request_routing
BEFORE INSERT OR UPDATE OF profile_id ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.snapshot_leave_request_routing();

UPDATE public.leave_requests lr
SET department_id = p.department_id, shift_group = p.shift_group
FROM public.profiles p
WHERE lr.profile_id = p.id
  AND (lr.department_id IS NULL OR lr.shift_group IS NULL);

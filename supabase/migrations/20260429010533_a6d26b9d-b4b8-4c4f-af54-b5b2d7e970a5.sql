-- Approval history timeline for staff requests
CREATE TABLE IF NOT EXISTS public.staff_request_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_kind text NOT NULL CHECK (request_kind IN ('shift_change','attendance_edit')),
  request_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor uuid,
  actor_name text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srh_request ON public.staff_request_history(request_kind, request_id, created_at);

ALTER TABLE public.staff_request_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Command tier views request history" ON public.staff_request_history;
CREATE POLICY "Command tier views request history"
ON public.staff_request_history FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic') OR public.has_role(auth.uid(),'2ic')
  OR public.has_role(auth.uid(),'staff_officer') OR public.has_role(auth.uid(),'supervisor')
  OR public.has_role(auth.uid(),'shift_supervisor') OR public.has_role(auth.uid(),'deputy_shift_supervisor')
  OR EXISTS (
    SELECT 1 FROM public.shift_change_requests r
    WHERE r.id = staff_request_history.request_id AND r.requested_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.attendance_edit_requests r
    WHERE r.id = staff_request_history.request_id AND r.requested_by = auth.uid()
  )
);

-- Trigger function to record status changes
CREATE OR REPLACE FUNCTION public.record_staff_request_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _kind text;
  _name text;
  _old_status text;
  _new_status text;
BEGIN
  IF TG_TABLE_NAME = 'shift_change_requests' THEN _kind := 'shift_change';
  ELSE _kind := 'attendance_edit';
  END IF;

  _new_status := NEW.status;
  _old_status := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;

  IF TG_OP = 'UPDATE' AND _old_status IS NOT DISTINCT FROM _new_status THEN
    RETURN NEW;
  END IF;

  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO _name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.staff_request_history
    (request_kind, request_id, from_status, to_status, actor, actor_name, comment)
  VALUES
    (_kind, NEW.id, _old_status, _new_status, auth.uid(), NULLIF(trim(_name),''),
     CASE WHEN _new_status IN ('approved','rejected','cancelled') THEN NEW.review_comment ELSE NULL END);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_change_history ON public.shift_change_requests;
CREATE TRIGGER trg_shift_change_history
AFTER INSERT OR UPDATE OF status ON public.shift_change_requests
FOR EACH ROW EXECUTE FUNCTION public.record_staff_request_history();

DROP TRIGGER IF EXISTS trg_attendance_edit_history ON public.attendance_edit_requests;
CREATE TRIGGER trg_attendance_edit_history
AFTER INSERT OR UPDATE OF status ON public.attendance_edit_requests
FOR EACH ROW EXECUTE FUNCTION public.record_staff_request_history();
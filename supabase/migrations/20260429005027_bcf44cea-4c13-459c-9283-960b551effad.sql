-- Shift change / override requests submitted by staff to their supervisors
CREATE TABLE IF NOT EXISTS public.shift_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('change','override','swap')),
  affected_date date NOT NULL,
  current_shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  requested_shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  requested_start_time time,
  requested_end_time time,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_change_requests_profile ON public.shift_change_requests(profile_id);
CREATE INDEX IF NOT EXISTS idx_shift_change_requests_status ON public.shift_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_shift_change_requests_date ON public.shift_change_requests(affected_date);

ALTER TABLE public.shift_change_requests ENABLE ROW LEVEL SECURITY;

-- Staff can view their own requests
CREATE POLICY "Users view their own shift change requests"
ON public.shift_change_requests FOR SELECT
USING (auth.uid() = requested_by);

-- Command tier and supervisors can view all
CREATE POLICY "Command tier views all shift change requests"
ON public.shift_change_requests FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
  OR public.has_role(auth.uid(), 'supervisor')
  OR public.has_role(auth.uid(), 'shift_supervisor')
  OR public.has_role(auth.uid(), 'deputy_shift_supervisor')
);

-- Staff create their own requests
CREATE POLICY "Users create their own shift change requests"
ON public.shift_change_requests FOR INSERT
WITH CHECK (
  auth.uid() = requested_by
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profile_id AND p.user_id = auth.uid())
);

-- Staff cancel their own pending requests
CREATE POLICY "Users cancel their own pending requests"
ON public.shift_change_requests FOR UPDATE
USING (auth.uid() = requested_by AND status = 'pending')
WITH CHECK (auth.uid() = requested_by AND status IN ('pending','cancelled'));

-- Command tier and supervisors approve/reject
CREATE POLICY "Command tier reviews shift change requests"
ON public.shift_change_requests FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
  OR public.has_role(auth.uid(), 'supervisor')
  OR public.has_role(auth.uid(), 'shift_supervisor')
  OR public.has_role(auth.uid(), 'deputy_shift_supervisor')
);

CREATE TRIGGER trg_shift_change_requests_updated
BEFORE UPDATE ON public.shift_change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation: requester restrictions + reviewer audit fields
CREATE OR REPLACE FUNCTION public.handle_shift_change_request_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_command boolean;
BEGIN
  _is_command :=
    public.has_role(auth.uid(),'admin') OR
    public.has_role(auth.uid(),'oic') OR
    public.has_role(auth.uid(),'2ic') OR
    public.has_role(auth.uid(),'staff_officer') OR
    public.has_role(auth.uid(),'supervisor') OR
    public.has_role(auth.uid(),'shift_supervisor') OR
    public.has_role(auth.uid(),'deputy_shift_supervisor');

  -- Requester can only set status to cancelled
  IF auth.uid() = OLD.requested_by AND NOT _is_command THEN
    IF NEW.status <> OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'You may only cancel your own request';
    END IF;
    -- Lock immutable fields
    NEW.profile_id := OLD.profile_id;
    NEW.affected_date := OLD.affected_date;
    NEW.request_type := OLD.request_type;
    NEW.reason := OLD.reason;
  END IF;

  -- On approval/rejection, stamp reviewer
  IF NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
    IF NEW.status = 'rejected' AND (NEW.review_comment IS NULL OR length(trim(NEW.review_comment))=0) THEN
      RAISE EXCEPTION 'A review comment is required when rejecting a request';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shift_change_requests_validate
BEFORE UPDATE ON public.shift_change_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_shift_change_request_update();

-- Notify supervisors / command tier on new requests
CREATE OR REPLACE FUNCTION public.notify_new_shift_change_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
BEGIN
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO _name FROM public.profiles WHERE id = NEW.profile_id LIMIT 1;

  PERFORM public.notify_roles(
    ARRAY['admin','oic','2ic','staff_officer','supervisor','shift_supervisor','deputy_shift_supervisor']::app_role[],
    'New Shift Change Request',
    format('%s requested a shift %s for %s.', COALESCE(NULLIF(_name,''),'A staff member'), NEW.request_type, to_char(NEW.affected_date,'DD Mon YYYY')),
    'general',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shift_change_requests_notify_new
AFTER INSERT ON public.shift_change_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_new_shift_change_request();

-- Notify requester on review outcome
CREATE OR REPLACE FUNCTION public.notify_shift_change_request_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.notifications (user_id, title, message, type, reference_id)
    VALUES (
      NEW.requested_by,
      format('Shift Request %s', initcap(NEW.status)),
      format('Your %s request for %s was %s%s.',
        NEW.request_type,
        to_char(NEW.affected_date,'DD Mon YYYY'),
        NEW.status,
        CASE WHEN NEW.review_comment IS NOT NULL AND length(trim(NEW.review_comment))>0
             THEN ' — ' || NEW.review_comment ELSE '' END
      ),
      'general',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shift_change_requests_notify_review
AFTER UPDATE ON public.shift_change_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_shift_change_request_review();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_change_requests;
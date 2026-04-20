-- Department parent linkage (Night Guard under IPSE)
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS parent_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

UPDATE public.departments
SET parent_department_id = (SELECT id FROM public.departments WHERE name = 'IPSE')
WHERE name = 'Night Guard Duty';

-- Sanctions reference table
CREATE TABLE IF NOT EXISTS public.ipse_sanctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  recommended_action text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ipse_sanctions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view sanctions" ON public.ipse_sanctions;
CREATE POLICY "Authenticated can view sanctions"
  ON public.ipse_sanctions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage sanctions" ON public.ipse_sanctions;
CREATE POLICY "Admins manage sanctions"
  ON public.ipse_sanctions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_ipse_sanctions_updated_at ON public.ipse_sanctions;
CREATE TRIGGER update_ipse_sanctions_updated_at
  BEFORE UPDATE ON public.ipse_sanctions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ipse_sanctions (code, label, description, recommended_action, sort_order) VALUES
  ('low', 'Low', 'Minor breach of conduct or procedure with no material impact.', 'Verbal counselling and note in personnel file.', 1),
  ('medium', 'Medium', 'Repeated minor breaches or a single moderate breach affecting service delivery.', 'Written caution; recommend additional training; monitor for 30 days.', 2),
  ('high', 'High', 'Serious misconduct, integrity breach, or act endangering the service or the public.', 'Immediate referral to 2IC/OIC for disciplinary board and possible suspension.', 3)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  recommended_action = EXCLUDED.recommended_action,
  sort_order = EXCLUDED.sort_order;

-- IPSE-aware approval chain on report_uploads
ALTER TABLE public.report_uploads
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS ipse_status text NOT NULL DEFAULT 'pending_ipse',
  ADD COLUMN IF NOT EXISTS ipse_reviewer uuid,
  ADD COLUMN IF NOT EXISTS ipse_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ipse_comment text,
  ADD COLUMN IF NOT EXISTS two_ic_reviewer uuid,
  ADD COLUMN IF NOT EXISTS two_ic_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS two_ic_comment text,
  ADD COLUMN IF NOT EXISTS forwarded_to text;

UPDATE public.report_uploads
SET ipse_status = CASE
  WHEN approval_status = 'approved' THEN 'approved'
  WHEN approval_status = 'rejected' THEN 'rejected'
  ELSE 'pending_ipse'
END
WHERE ipse_status IS NULL OR ipse_status = '';

-- Helper: IPSE tier
CREATE OR REPLACE FUNCTION public.is_ipse_tier(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'ipse_supervisor'::app_role)
      OR public.has_role(_user_id, 'ipse_deputy_supervisor'::app_role);
$$;

-- Updated approval validation enforcing the IPSE → 2IC → OIC chain
CREATE OR REPLACE FUNCTION public.validate_report_approval()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_ipse boolean;
  _is_2ic  boolean;
  _is_oic  boolean;
  _is_admin boolean;
BEGIN
  IF NEW.approval_status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'Invalid approval_status: %', NEW.approval_status;
  END IF;

  IF NEW.ipse_status NOT IN ('pending_ipse','forwarded_to_2ic','forwarded_to_oic','approved','rejected') THEN
    RAISE EXCEPTION 'Invalid ipse_status: %', NEW.ipse_status;
  END IF;

  IF NEW.severity IS NOT NULL AND NEW.severity NOT IN ('low','medium','high') THEN
    RAISE EXCEPTION 'Invalid severity: %', NEW.severity;
  END IF;

  IF NEW.approval_status = 'rejected' AND (NEW.review_comment IS NULL OR length(trim(NEW.review_comment)) = 0) THEN
    RAISE EXCEPTION 'A review comment is required when rejecting a report';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.ipse_status IS DISTINCT FROM NEW.ipse_status THEN
    _is_admin := public.has_role(auth.uid(), 'admin');
    _is_ipse  := public.is_ipse_tier(auth.uid());
    _is_2ic   := public.has_role(auth.uid(), '2ic');
    _is_oic   := public.has_role(auth.uid(), 'oic');

    IF NEW.ipse_status = 'forwarded_to_2ic' THEN
      IF NOT (_is_admin OR _is_ipse) THEN
        RAISE EXCEPTION 'Only IPSE supervisors can forward reports to the 2IC';
      END IF;
      IF NEW.severity IS NULL THEN
        RAISE EXCEPTION 'A severity level must be set before forwarding to the 2IC';
      END IF;
      NEW.ipse_reviewer := auth.uid();
      NEW.ipse_reviewed_at := now();
    ELSIF NEW.ipse_status = 'forwarded_to_oic' THEN
      IF NOT (_is_admin OR _is_2ic) THEN
        RAISE EXCEPTION 'Only the 2IC can forward reports to the OIC';
      END IF;
      NEW.two_ic_reviewer := auth.uid();
      NEW.two_ic_reviewed_at := now();
    ELSIF NEW.ipse_status = 'approved' THEN
      IF NOT (_is_admin OR _is_oic) THEN
        RAISE EXCEPTION 'Only the OIC can issue final approval';
      END IF;
      NEW.approval_status := 'approved';
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    ELSIF NEW.ipse_status = 'rejected' THEN
      IF NOT (_is_admin OR _is_ipse OR _is_2ic OR _is_oic) THEN
        RAISE EXCEPTION 'Not permitted to reject this report';
      END IF;
      NEW.approval_status := 'rejected';
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    NEW.approved_by := auth.uid();
    NEW.approved_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- RLS additions for IPSE tier on report_uploads
DROP POLICY IF EXISTS "IPSE views all reports" ON public.report_uploads;
CREATE POLICY "IPSE views all reports"
  ON public.report_uploads FOR SELECT
  TO authenticated
  USING (public.is_ipse_tier(auth.uid()));

DROP POLICY IF EXISTS "IPSE updates pending reports" ON public.report_uploads;
CREATE POLICY "IPSE updates pending reports"
  ON public.report_uploads FOR UPDATE
  TO authenticated
  USING (public.is_ipse_tier(auth.uid()))
  WITH CHECK (public.is_ipse_tier(auth.uid()));
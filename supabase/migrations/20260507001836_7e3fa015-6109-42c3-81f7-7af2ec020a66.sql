
-- ============= REPORT APPROVAL: Head of Administration stage =============
ALTER TABLE public.report_uploads
  ADD COLUMN IF NOT EXISTS hoa_reviewer uuid,
  ADD COLUMN IF NOT EXISTS hoa_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS hoa_comment text;

CREATE OR REPLACE FUNCTION public.validate_report_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_ipse boolean;
  _is_hoa  boolean;
  _is_2ic  boolean;
  _is_oic  boolean;
  _is_admin boolean;
BEGIN
  IF NEW.approval_status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'Invalid approval_status: %', NEW.approval_status;
  END IF;

  IF NEW.ipse_status NOT IN ('pending_ipse','forwarded_to_hoa','forwarded_to_2ic','forwarded_to_oic','approved','rejected') THEN
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
    _is_hoa   := public.has_role(auth.uid(), 'head_of_administration');
    _is_2ic   := public.has_role(auth.uid(), '2ic');
    _is_oic   := public.has_role(auth.uid(), 'oic');

    IF NEW.ipse_status = 'forwarded_to_hoa' THEN
      IF NOT (_is_admin OR _is_ipse) THEN
        RAISE EXCEPTION 'Only IPSE supervisors can forward reports to the Head of Administration';
      END IF;
      IF NEW.severity IS NULL THEN
        RAISE EXCEPTION 'A severity level must be set before forwarding to the Head of Administration';
      END IF;
      NEW.ipse_reviewer := auth.uid();
      NEW.ipse_reviewed_at := now();
    ELSIF NEW.ipse_status = 'forwarded_to_2ic' THEN
      IF NOT (_is_admin OR _is_hoa) THEN
        RAISE EXCEPTION 'Only the Head of Administration can forward reports to the 2IC';
      END IF;
      NEW.hoa_reviewer := auth.uid();
      NEW.hoa_reviewed_at := now();
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
      IF NOT (_is_admin OR _is_ipse OR _is_hoa OR _is_2ic OR _is_oic) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.notify_ipse_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _submitter uuid;
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.ipse_status IS NOT DISTINCT FROM NEW.ipse_status THEN
    RETURN NEW;
  END IF;

  _submitter := COALESCE(NEW.submitted_by, NEW.uploaded_by);

  IF NEW.ipse_status = 'forwarded_to_hoa' THEN
    PERFORM public.notify_roles(
      ARRAY['admin','head_of_administration']::app_role[],
      'IPSE Report — Awaiting Head of Administration',
      format('"%s" forwarded by IPSE (severity: %s).', NEW.title, COALESCE(upper(NEW.severity),'—')),
      'general',
      NEW.id
    );
  ELSIF NEW.ipse_status = 'forwarded_to_2ic' THEN
    PERFORM public.notify_roles(
      ARRAY['admin','2ic']::app_role[],
      'IPSE Report — Awaiting 2IC',
      format('"%s" forwarded by Head of Administration (severity: %s).', NEW.title, COALESCE(upper(NEW.severity),'—')),
      'general',
      NEW.id
    );
  ELSIF NEW.ipse_status = 'forwarded_to_oic' THEN
    PERFORM public.notify_roles(
      ARRAY['admin','oic']::app_role[],
      'IPSE Report — Awaiting OIC',
      format('"%s" forwarded by 2IC for final approval (severity: %s).', NEW.title, COALESCE(upper(NEW.severity),'—')),
      'general',
      NEW.id
    );
  ELSIF NEW.ipse_status = 'approved' THEN
    IF _submitter IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_id)
      VALUES (_submitter, 'Report Approved', format('Your report "%s" has been approved by the OIC.', NEW.title), 'general', NEW.id);
    END IF;
  ELSIF NEW.ipse_status = 'rejected' THEN
    IF _submitter IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_id)
      VALUES (_submitter, 'Report Returned', format('Your report "%s" was returned. Comment: %s', NEW.title, COALESCE(NEW.review_comment,'(none)')), 'general', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============= IPSE NIGHT GUARD: shift_assignments management =============
DROP POLICY IF EXISTS "IPSE tier can manage shift assignments" ON public.shift_assignments;
CREATE POLICY "IPSE tier can manage shift assignments"
ON public.shift_assignments
FOR ALL
TO authenticated
USING (public.is_ipse_tier(auth.uid()))
WITH CHECK (public.is_ipse_tier(auth.uid()));

-- ============= GIS HEALTH LAB =============

-- helper: command tier check (mirrors AuthContext)
CREATE OR REPLACE FUNCTION public.is_command_tier(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id,'admin')
      OR public.has_role(_user_id,'oic')
      OR public.has_role(_user_id,'2ic')
      OR public.has_role(_user_id,'head_of_administration')
      OR public.has_role(_user_id,'chief_staff_officer')
      OR public.has_role(_user_id,'staff_officer')
      OR public.has_role(_user_id,'supervisor');
$$;

-- Medical records
CREATE TABLE IF NOT EXISTS public.medical_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visit_date date NOT NULL DEFAULT current_date,
  chief_complaint text,
  diagnosis text,
  treatment text,
  vitals jsonb,
  notes text,
  attachment_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view own medical records" ON public.medical_records FOR SELECT TO authenticated
  USING (staff_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Command tier manage medical records" ON public.medical_records FOR ALL TO authenticated
  USING (public.is_command_tier(auth.uid())) WITH CHECK (public.is_command_tier(auth.uid()));
CREATE TRIGGER trg_medical_records_updated BEFORE UPDATE ON public.medical_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Health reports
CREATE TABLE IF NOT EXISTS public.health_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'monthly',
  report_date date NOT NULL DEFAULT current_date,
  summary text,
  file_path text,
  file_name text,
  file_type text,
  file_size integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.health_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated view health reports" ON public.health_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Command tier manage health reports" ON public.health_reports FOR ALL TO authenticated
  USING (public.is_command_tier(auth.uid())) WITH CHECK (public.is_command_tier(auth.uid()));
CREATE TRIGGER trg_health_reports_updated BEFORE UPDATE ON public.health_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Appointments
CREATE TABLE IF NOT EXISTS public.medical_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id uuid,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.medical_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view own appointments" ON public.medical_appointments FOR SELECT TO authenticated
  USING (staff_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Command tier manage appointments" ON public.medical_appointments FOR ALL TO authenticated
  USING (public.is_command_tier(auth.uid())) WITH CHECK (public.is_command_tier(auth.uid()));
CREATE TRIGGER trg_medical_appointments_updated BEFORE UPDATE ON public.medical_appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Healthcare services catalog
CREATE TABLE IF NOT EXISTS public.healthcare_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  description text,
  fee numeric(10,2) DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.healthcare_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated view services" ON public.healthcare_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Command tier manage services" ON public.healthcare_services FOR ALL TO authenticated
  USING (public.is_command_tier(auth.uid())) WITH CHECK (public.is_command_tier(auth.uid()));
CREATE TRIGGER trg_healthcare_services_updated BEFORE UPDATE ON public.healthcare_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Medical inventory
CREATE TABLE IF NOT EXISTS public.medical_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  category text,
  quantity integer NOT NULL DEFAULT 0,
  unit text,
  reorder_threshold integer DEFAULT 0,
  expiry_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.medical_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated view inventory" ON public.medical_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Command tier manage inventory" ON public.medical_inventory FOR ALL TO authenticated
  USING (public.is_command_tier(auth.uid())) WITH CHECK (public.is_command_tier(auth.uid()));
CREATE TRIGGER trg_medical_inventory_updated BEFORE UPDATE ON public.medical_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Excuse duty forms
CREATE TABLE IF NOT EXISTS public.excuse_duty_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL,
  diagnosis text,
  doctor_name text,
  facility text,
  attachment_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.excuse_duty_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view own excuse duty" ON public.excuse_duty_forms FOR SELECT TO authenticated
  USING (submitted_by = auth.uid()
      OR staff_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Staff submit own excuse duty" ON public.excuse_duty_forms FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "Staff update own pending excuse duty" ON public.excuse_duty_forms FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'pending')
  WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "Command tier manage excuse duty" ON public.excuse_duty_forms FOR ALL TO authenticated
  USING (public.is_command_tier(auth.uid())) WITH CHECK (public.is_command_tier(auth.uid()));
CREATE TRIGGER trg_excuse_duty_forms_updated BEFORE UPDATE ON public.excuse_duty_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= STORAGE BUCKETS =============
INSERT INTO storage.buckets (id, name, public) VALUES ('health-lab','health-lab',false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('excuse-duty','excuse-duty',false) ON CONFLICT (id) DO NOTHING;

-- health-lab: command tier full, staff read own files (filename pattern: <staff_profile_id>/...)
CREATE POLICY "health_lab command manage" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'health-lab' AND public.is_command_tier(auth.uid()))
  WITH CHECK (bucket_id = 'health-lab' AND public.is_command_tier(auth.uid()));
CREATE POLICY "health_lab staff read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'health-lab' AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
  ));

-- excuse-duty: staff manage their own folder; command tier read all
CREATE POLICY "excuse_duty staff own folder" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'excuse-duty' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'excuse-duty' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "excuse_duty command read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'excuse-duty' AND public.is_command_tier(auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_medical_records_staff ON public.medical_records(staff_profile_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_visit ON public.medical_records(visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_reports_date ON public.health_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_staff ON public.medical_appointments(staff_profile_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled ON public.medical_appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON public.medical_inventory(expiry_date);
CREATE INDEX IF NOT EXISTS idx_excuse_duty_staff ON public.excuse_duty_forms(staff_profile_id);
CREATE INDEX IF NOT EXISTS idx_excuse_duty_submitted_by ON public.excuse_duty_forms(submitted_by);
CREATE INDEX IF NOT EXISTS idx_excuse_duty_status ON public.excuse_duty_forms(status);

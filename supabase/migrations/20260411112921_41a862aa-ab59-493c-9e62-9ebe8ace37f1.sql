
-- ===================
-- FRONT DESK MODULE
-- ===================

CREATE TABLE public.visa_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_name TEXT NOT NULL,
  passport_number TEXT NOT NULL,
  nationality TEXT NOT NULL,
  visa_type TEXT NOT NULL DEFAULT 'tourist',
  purpose TEXT,
  entry_date DATE,
  exit_date DATE,
  status TEXT NOT NULL DEFAULT 'submitted',
  processed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.visa_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage visa applications"
  ON public.visa_applications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Front desk can create visa applications"
  ON public.visa_applications FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'front_desk'));

CREATE POLICY "Front desk can view visa applications"
  ON public.visa_applications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'front_desk') OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Front desk can update visa applications"
  ON public.visa_applications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'front_desk'))
  WITH CHECK (public.has_role(auth.uid(), 'front_desk'));

CREATE TRIGGER update_visa_applications_updated_at
  BEFORE UPDATE ON public.visa_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Visa Extensions
CREATE TABLE public.visa_extensions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visa_application_id UUID REFERENCES public.visa_applications(id) ON DELETE SET NULL,
  applicant_name TEXT NOT NULL,
  passport_number TEXT NOT NULL,
  current_visa_expiry DATE NOT NULL,
  requested_extension_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  processed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.visa_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage visa extensions"
  ON public.visa_extensions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Front desk can create visa extensions"
  ON public.visa_extensions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'front_desk'));

CREATE POLICY "Front desk can view visa extensions"
  ON public.visa_extensions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'front_desk') OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Front desk can update visa extensions"
  ON public.visa_extensions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'front_desk'))
  WITH CHECK (public.has_role(auth.uid(), 'front_desk'));

CREATE TRIGGER update_visa_extensions_updated_at
  BEFORE UPDATE ON public.visa_extensions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Passport Applications
CREATE TABLE public.passport_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  nationality TEXT NOT NULL,
  application_type TEXT NOT NULL DEFAULT 'new',
  gender TEXT,
  phone TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  processed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.passport_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage passport applications"
  ON public.passport_applications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Front desk can create passport applications"
  ON public.passport_applications FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'front_desk'));

CREATE POLICY "Front desk can view passport applications"
  ON public.passport_applications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'front_desk') OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Front desk can update passport applications"
  ON public.passport_applications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'front_desk'))
  WITH CHECK (public.has_role(auth.uid(), 'front_desk'));

CREATE TRIGGER update_passport_applications_updated_at
  BEFORE UPDATE ON public.passport_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Front Desk Audit Log
CREATE TABLE public.front_desk_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  performed_by UUID NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.front_desk_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
  ON public.front_desk_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Front desk can view own audit logs"
  ON public.front_desk_audit_log FOR SELECT TO authenticated
  USING (performed_by = auth.uid());

CREATE POLICY "Authenticated users can create audit logs"
  ON public.front_desk_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'front_desk') OR public.has_role(auth.uid(), 'admin'));

-- Audit log trigger function
CREATE OR REPLACE FUNCTION public.log_front_desk_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.front_desk_audit_log (action, entity_type, entity_id, performed_by, details)
  VALUES (
    TG_ARGV[0],
    TG_ARGV[1],
    COALESCE(NEW.id, OLD.id),
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    jsonb_build_object(
      'status', COALESCE(NEW.status, OLD.status),
      'applicant_name', COALESCE(NEW.applicant_name, OLD.applicant_name)
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Audit triggers
CREATE TRIGGER audit_visa_application_insert
  AFTER INSERT ON public.visa_applications FOR EACH ROW
  EXECUTE FUNCTION public.log_front_desk_action('create', 'visa_application');

CREATE TRIGGER audit_visa_application_update
  AFTER UPDATE ON public.visa_applications FOR EACH ROW
  EXECUTE FUNCTION public.log_front_desk_action('update', 'visa_application');

CREATE TRIGGER audit_visa_extension_insert
  AFTER INSERT ON public.visa_extensions FOR EACH ROW
  EXECUTE FUNCTION public.log_front_desk_action('create', 'visa_extension');

CREATE TRIGGER audit_visa_extension_update
  AFTER UPDATE ON public.visa_extensions FOR EACH ROW
  EXECUTE FUNCTION public.log_front_desk_action('update', 'visa_extension');

CREATE TRIGGER audit_passport_insert
  AFTER INSERT ON public.passport_applications FOR EACH ROW
  EXECUTE FUNCTION public.log_front_desk_action('create', 'passport_application');

CREATE TRIGGER audit_passport_update
  AFTER UPDATE ON public.passport_applications FOR EACH ROW
  EXECUTE FUNCTION public.log_front_desk_action('update', 'passport_application');

-- ===================
-- REPORTING MODULE
-- ===================

CREATE TABLE public.report_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'daily',
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by UUID NOT NULL,
  department_id UUID REFERENCES public.departments(id),
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage report uploads"
  ON public.report_uploads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Supervisors can manage department reports"
  ON public.report_uploads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor') AND department_id = public.get_user_department_id(auth.uid()));

CREATE POLICY "Staff can view department reports"
  ON public.report_uploads FOR SELECT TO authenticated
  USING (department_id = public.get_user_department_id(auth.uid()));

CREATE TRIGGER update_report_uploads_updated_at
  BEFORE UPDATE ON public.report_uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for reports
INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', false);

CREATE POLICY "Admins can manage report files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'reports' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Supervisors can upload report files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reports' AND public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Supervisors can view report files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reports' AND public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Staff can download report files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reports');

-- ===================
-- 2FA OTP TABLE
-- ===================

CREATE TABLE public.otp_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'login_2fa',
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own OTP codes"
  ON public.otp_codes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert OTP codes"
  ON public.otp_codes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own OTP codes"
  ON public.otp_codes FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_otp_codes_user_id ON public.otp_codes (user_id, used, expires_at);

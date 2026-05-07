
CREATE TABLE public.permits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_reference TEXT,
  applicant_name TEXT NOT NULL,
  passport_number TEXT NOT NULL,
  nationality TEXT,
  date_of_birth DATE,
  gender TEXT,
  marital_status TEXT,
  phone TEXT,
  home_address TEXT,
  foreign_address TEXT,
  street_name TEXT,
  nearest_landmark TEXT,
  next_of_kin TEXT,
  emergency_contact TEXT,
  permit_type TEXT NOT NULL,
  permit_category TEXT,
  purpose TEXT,
  occupation TEXT,
  employer_sponsor_name TEXT,
  employer_sponsor_address TEXT,
  institution_name TEXT,
  course_of_study TEXT,
  intended_duration_months INTEGER,
  current_permit_expiry DATE,
  requested_start_date DATE,
  fee_charged NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'submitted',
  notes TEXT,
  processed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_permits_applicant_name ON public.permits (lower(applicant_name));
CREATE INDEX idx_permits_passport_number ON public.permits (passport_number);
CREATE INDEX idx_permits_status ON public.permits (status);
CREATE INDEX idx_permits_permit_type ON public.permits (permit_type);
CREATE INDEX idx_permits_created_at_id_desc ON public.permits (created_at DESC, id DESC);
CREATE INDEX idx_permits_processed_by ON public.permits (processed_by);

ALTER TABLE public.permits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage permits"
  ON public.permits FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Front desk can create permits"
  ON public.permits FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role));

CREATE POLICY "Front desk can view own processed permits"
  ON public.permits FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'front_desk'::app_role)
    AND processed_by = auth.uid()
  );

CREATE POLICY "Front desk can update own processed permits"
  ON public.permits FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid());

CREATE POLICY "Command tier can view all permits"
  ON public.permits FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'staff_officer'::app_role)
    OR has_role(auth.uid(), 'shift_supervisor'::app_role)
    OR has_role(auth.uid(), 'deputy_shift_supervisor'::app_role)
  );

CREATE POLICY "Command tier can approve permits"
  ON public.permits FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'staff_officer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'staff_officer'::app_role));

CREATE TRIGGER update_permits_updated_at
  BEFORE UPDATE ON public.permits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

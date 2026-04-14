
-- Create official_applications table
CREATE TABLE public.official_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_name TEXT NOT NULL,
  nationality TEXT NOT NULL,
  passport_number TEXT,
  official_type TEXT NOT NULL DEFAULT 'diplomatic',
  reference_number TEXT,
  requesting_entity TEXT,
  purpose TEXT,
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
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  processed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.official_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage official applications" ON public.official_applications FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "OIC and 2IC can manage official applications" ON public.official_applications FOR ALL TO authenticated USING (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role)) WITH CHECK (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role));
CREATE POLICY "Front desk can create official applications" ON public.official_applications FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role));
CREATE POLICY "Front desk can view own processed official applications" ON public.official_applications FOR SELECT TO authenticated USING (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid());
CREATE POLICY "Front desk can update own processed official applications" ON public.official_applications FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid()) WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid());
CREATE POLICY "Supervisors can view department official applications" ON public.official_applications FOR SELECT TO authenticated USING (has_role(auth.uid(), 'supervisor'::app_role) AND processed_by IN (SELECT p.user_id FROM profiles p WHERE p.department_id = get_user_department_id(auth.uid())));
CREATE POLICY "Shift roles can view department official applications" ON public.official_applications FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'shift_supervisor'::app_role) OR has_role(auth.uid(), 'deputy_shift_supervisor'::app_role) OR has_role(auth.uid(), 'shift_leader'::app_role)) AND processed_by IN (SELECT p.user_id FROM profiles p WHERE p.department_id = get_user_department_id(auth.uid())));

-- Create enquiry_applications table
CREATE TABLE public.enquiry_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_name TEXT NOT NULL,
  nationality TEXT NOT NULL,
  passport_number TEXT,
  enquiry_type TEXT NOT NULL DEFAULT 'general',
  subject TEXT,
  response TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,
  purpose TEXT,
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
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  processed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.enquiry_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage enquiry applications" ON public.enquiry_applications FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "OIC and 2IC can manage enquiry applications" ON public.enquiry_applications FOR ALL TO authenticated USING (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role)) WITH CHECK (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role));
CREATE POLICY "Front desk can create enquiry applications" ON public.enquiry_applications FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role));
CREATE POLICY "Front desk can view own processed enquiry applications" ON public.enquiry_applications FOR SELECT TO authenticated USING (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid());
CREATE POLICY "Front desk can update own processed enquiry applications" ON public.enquiry_applications FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid()) WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid());
CREATE POLICY "Supervisors can view department enquiry applications" ON public.enquiry_applications FOR SELECT TO authenticated USING (has_role(auth.uid(), 'supervisor'::app_role) AND processed_by IN (SELECT p.user_id FROM profiles p WHERE p.department_id = get_user_department_id(auth.uid())));
CREATE POLICY "Shift roles can view department enquiry applications" ON public.enquiry_applications FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'shift_supervisor'::app_role) OR has_role(auth.uid(), 'deputy_shift_supervisor'::app_role) OR has_role(auth.uid(), 'shift_leader'::app_role)) AND processed_by IN (SELECT p.user_id FROM profiles p WHERE p.department_id = get_user_department_id(auth.uid())));

-- Add auto-update triggers for updated_at
CREATE TRIGGER update_official_applications_updated_at BEFORE UPDATE ON public.official_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_enquiry_applications_updated_at BEFORE UPDATE ON public.enquiry_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.official_applications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.enquiry_applications;

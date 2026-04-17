-- MISD/CYBER unit assignments
CREATE TABLE public.misd_unit_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL,
  unit_key text NOT NULL,
  unit_name text NOT NULL,
  role_title text,
  is_lead boolean NOT NULL DEFAULT false,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, unit_key)
);

CREATE INDEX idx_misd_unit_assignments_profile ON public.misd_unit_assignments(profile_id);
CREATE INDEX idx_misd_unit_assignments_unit ON public.misd_unit_assignments(unit_key);

ALTER TABLE public.misd_unit_assignments ENABLE ROW LEVEL SECURITY;

-- Admins / OIC / 2IC manage everything
CREATE POLICY "Cmd manage misd assignments" ON public.misd_unit_assignments
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role));

-- All authenticated users can view assignments (read-only directory)
CREATE POLICY "Authenticated view misd assignments" ON public.misd_unit_assignments
FOR SELECT TO authenticated USING (true);

-- Auto-update updated_at
CREATE TRIGGER trg_misd_unit_assignments_updated
BEFORE UPDATE ON public.misd_unit_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
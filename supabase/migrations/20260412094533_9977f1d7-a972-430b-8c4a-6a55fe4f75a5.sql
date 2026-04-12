-- Create security incidents table
CREATE TABLE public.security_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_type TEXT NOT NULL DEFAULT 'other',
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  reported_by UUID NOT NULL,
  assigned_to UUID,
  status TEXT NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  department_id UUID REFERENCES public.departments(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;

-- Admins can manage all incidents
CREATE POLICY "Admins can manage incidents"
ON public.security_incidents
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Supervisors can view department incidents
CREATE POLICY "Supervisors can view department incidents"
ON public.security_incidents
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor')
  AND department_id = public.get_user_department_id(auth.uid())
);

-- Supervisors can create incidents
CREATE POLICY "Supervisors can create incidents"
ON public.security_incidents
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'supervisor')
  AND reported_by = auth.uid()
);

-- Staff can view own reported incidents
CREATE POLICY "Users can view own reported incidents"
ON public.security_incidents
FOR SELECT
TO authenticated
USING (reported_by = auth.uid());

-- Staff can create incidents
CREATE POLICY "Users can create incidents"
ON public.security_incidents
FOR INSERT
TO authenticated
WITH CHECK (reported_by = auth.uid());

-- Add updated_at trigger
CREATE TRIGGER update_security_incidents_updated_at
BEFORE UPDATE ON public.security_incidents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
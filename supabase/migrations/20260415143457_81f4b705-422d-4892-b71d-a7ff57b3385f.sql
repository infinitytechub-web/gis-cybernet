
-- Create enforcement_operations table for Amasaman Sector Command
CREATE TABLE public.enforcement_operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_type TEXT NOT NULL DEFAULT 'patrol',
  operation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  location TEXT,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  suspects_count INTEGER NOT NULL DEFAULT 0,
  arrests_count INTEGER NOT NULL DEFAULT 0,
  officer_in_charge UUID,
  department_id UUID REFERENCES public.departments(id),
  reported_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  outcome TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.enforcement_operations ENABLE ROW LEVEL SECURITY;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.enforcement_operations;

-- RLS Policies
-- Admins full access
CREATE POLICY "Admins can manage enforcement operations"
  ON public.enforcement_operations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- OIC and 2IC full access
CREATE POLICY "OIC and 2IC can manage enforcement operations"
  ON public.enforcement_operations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic'))
  WITH CHECK (public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic'));

-- Supervisors and shift supervisors can view
CREATE POLICY "Supervisors can view enforcement operations"
  ON public.enforcement_operations FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'shift_supervisor')
    OR public.has_role(auth.uid(), 'deputy_shift_supervisor')
  );

-- Supervisors and shift supervisors can create
CREATE POLICY "Supervisors can create enforcement operations"
  ON public.enforcement_operations FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'shift_supervisor')
    OR public.has_role(auth.uid(), 'deputy_shift_supervisor'))
    AND reported_by = auth.uid()
  );

-- Users can view their own reported operations
CREATE POLICY "Users can view own enforcement operations"
  ON public.enforcement_operations FOR SELECT
  TO authenticated
  USING (reported_by = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_enforcement_operations_updated_at
  BEFORE UPDATE ON public.enforcement_operations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- System audit trigger
CREATE TRIGGER audit_enforcement_operations
  AFTER INSERT OR UPDATE OR DELETE ON public.enforcement_operations
  FOR EACH ROW
  EXECUTE FUNCTION public.log_system_audit();

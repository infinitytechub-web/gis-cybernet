
CREATE TABLE public.operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_type TEXT NOT NULL DEFAULT 'patrol',
  operation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  location TEXT,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  suspects_count INTEGER NOT NULL DEFAULT 0,
  arrests_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  outcome TEXT,
  notes TEXT,
  officer_in_charge UUID,
  contact_details TEXT,
  department_id UUID REFERENCES public.departments(id),
  reported_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operations"
  ON public.operations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "OIC and 2IC can manage operations"
  ON public.operations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'oic') OR has_role(auth.uid(), '2ic'))
  WITH CHECK (has_role(auth.uid(), 'oic') OR has_role(auth.uid(), '2ic'));

CREATE POLICY "Supervisors can view operations"
  ON public.operations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'shift_supervisor') OR has_role(auth.uid(), 'deputy_shift_supervisor'));

CREATE POLICY "Supervisors can create operations"
  ON public.operations FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'shift_supervisor') OR has_role(auth.uid(), 'deputy_shift_supervisor')) AND reported_by = auth.uid());

CREATE POLICY "Users can view own operations"
  ON public.operations FOR SELECT TO authenticated
  USING (reported_by = auth.uid());

CREATE TRIGGER update_operations_updated_at
  BEFORE UPDATE ON public.operations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

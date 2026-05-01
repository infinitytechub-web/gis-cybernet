-- Duty roster import staging + commit tables
CREATE TABLE public.duty_roster_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_date DATE NOT NULL,
  source_filename TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','committed','cancelled')),
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.duty_roster_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.duty_roster_imports(id) ON DELETE CASCADE,
  shift TEXT NOT NULL CHECK (shift IN ('A','B','C','D')),
  serial_no INTEGER NOT NULL,
  rank TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT,
  unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_duty_roster_entries_import ON public.duty_roster_entries(import_id);
CREATE INDEX idx_duty_roster_imports_eff ON public.duty_roster_imports(effective_date DESC);

ALTER TABLE public.duty_roster_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_roster_entries ENABLE ROW LEVEL SECURITY;

-- Helper: command tier check
CREATE OR REPLACE FUNCTION public.is_roster_manager(_uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_uid,'admin'::app_role)
      OR public.has_role(_uid,'oic'::app_role)
      OR public.has_role(_uid,'2ic'::app_role)
      OR public.has_role(_uid,'staff_officer'::app_role)
      OR public.has_role(_uid,'supervisor'::app_role);
$$;

CREATE POLICY "Command tier read imports" ON public.duty_roster_imports
  FOR SELECT USING (public.is_roster_manager(auth.uid()));
CREATE POLICY "Command tier insert imports" ON public.duty_roster_imports
  FOR INSERT WITH CHECK (public.is_roster_manager(auth.uid()) AND uploaded_by = auth.uid());
CREATE POLICY "Command tier update imports" ON public.duty_roster_imports
  FOR UPDATE USING (public.is_roster_manager(auth.uid()));
CREATE POLICY "Command tier delete imports" ON public.duty_roster_imports
  FOR DELETE USING (public.is_roster_manager(auth.uid()));

CREATE POLICY "Command tier read entries" ON public.duty_roster_entries
  FOR SELECT USING (public.is_roster_manager(auth.uid()));
CREATE POLICY "Command tier insert entries" ON public.duty_roster_entries
  FOR INSERT WITH CHECK (public.is_roster_manager(auth.uid()));
CREATE POLICY "Command tier delete entries" ON public.duty_roster_entries
  FOR DELETE USING (public.is_roster_manager(auth.uid()));

-- updated_at trigger
CREATE TRIGGER trg_duty_roster_imports_updated
BEFORE UPDATE ON public.duty_roster_imports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit log on status change to committed/cancelled
CREATE OR REPLACE FUNCTION public.audit_duty_roster_import()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status AND NEW.status IN ('committed','cancelled') THEN
    INSERT INTO public.security_audit_log (category, action, severity, actor_id, subject, details)
    VALUES (
      'account',
      'duty_roster_' || NEW.status,
      'info',
      auth.uid(),
      NEW.source_filename,
      jsonb_build_object(
        'import_id', NEW.id,
        'effective_date', NEW.effective_date,
        'row_count', NEW.row_count
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_duty_roster_import
AFTER UPDATE ON public.duty_roster_imports
FOR EACH ROW EXECUTE FUNCTION public.audit_duty_roster_import();
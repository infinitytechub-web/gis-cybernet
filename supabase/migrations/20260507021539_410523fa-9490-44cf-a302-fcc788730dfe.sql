
-- Permissions matrix overrides (admin-controlled, persisted)
CREATE TABLE IF NOT EXISTS public.permission_matrix_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_name text NOT NULL,
  role public.app_role NOT NULL,
  access text NOT NULL CHECK (access IN ('full','dept','own','view','none')),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_name, role)
);

ALTER TABLE public.permission_matrix_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view permission overrides"
  ON public.permission_matrix_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins can insert permission overrides"
  ON public.permission_matrix_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can update permission overrides"
  ON public.permission_matrix_overrides FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can delete permission overrides"
  ON public.permission_matrix_overrides FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER permission_matrix_overrides_set_updated_at
  BEFORE UPDATE ON public.permission_matrix_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Staff mapping import audit trail
CREATE TABLE IF NOT EXISTS public.staff_mapping_imports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  imported_by uuid,
  filename text,
  total_rows integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_mapping_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view mapping imports"
  ON public.staff_mapping_imports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins insert mapping imports"
  ON public.staff_mapping_imports FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

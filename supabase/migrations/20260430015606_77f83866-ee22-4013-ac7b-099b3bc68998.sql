CREATE TABLE public.staff_bulk_upload_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_by_name TEXT,
  file_name TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_staff_bulk_upload_audit_at ON public.staff_bulk_upload_audit(uploaded_at DESC);

ALTER TABLE public.staff_bulk_upload_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier reads bulk staff audit"
  ON public.staff_bulk_upload_audit FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
  );

CREATE POLICY "Block direct writes to bulk staff audit"
  ON public.staff_bulk_upload_audit FOR INSERT TO authenticated
  WITH CHECK (false);
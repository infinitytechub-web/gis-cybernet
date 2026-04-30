-- Audit trail for command-tier role changes
CREATE TABLE IF NOT EXISTS public.command_role_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL,
  target_staff_id TEXT,
  target_name TEXT,
  from_role app_role,
  to_role app_role,
  action TEXT NOT NULL CHECK (action IN ('assign','remove','change')),
  changed_by UUID,
  changed_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cra_target ON public.command_role_audit(target_user_id);
CREATE INDEX IF NOT EXISTS idx_cra_created ON public.command_role_audit(created_at DESC);

ALTER TABLE public.command_role_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view command role audit"
  ON public.command_role_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert command role audit"
  ON public.command_role_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
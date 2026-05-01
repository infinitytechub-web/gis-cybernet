
CREATE TABLE public.system_backup_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  actor_email TEXT,
  tables_requested TEXT[] NOT NULL,
  tables_exported TEXT[] NOT NULL DEFAULT '{}',
  row_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_rows INTEGER NOT NULL DEFAULT 0,
  byte_size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.system_backup_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view backup audit"
ON public.system_backup_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Inserts only via SECURITY DEFINER (edge function uses service role); block direct client writes.
CREATE POLICY "Block direct insert"
ON public.system_backup_audit
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE INDEX idx_system_backup_audit_created_at ON public.system_backup_audit (created_at DESC);
CREATE INDEX idx_system_backup_audit_user ON public.system_backup_audit (user_id);

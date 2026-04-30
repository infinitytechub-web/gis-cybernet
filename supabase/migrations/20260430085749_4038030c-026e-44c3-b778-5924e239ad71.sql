-- Add batch_id to group entries created together (e.g., bulk assign or undo).
ALTER TABLE public.command_role_audit
  ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_cra_batch ON public.command_role_audit(batch_id);

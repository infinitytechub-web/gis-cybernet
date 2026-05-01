
-- Settings table (single row enforced via unique constraint on a constant key)
CREATE TABLE public.system_backup_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  singleton BOOLEAN NOT NULL DEFAULT true UNIQUE,
  retention_count INTEGER NOT NULL DEFAULT 50,
  retention_days INTEGER,
  cleanup_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT retention_count_positive CHECK (retention_count >= 1 AND retention_count <= 1000),
  CONSTRAINT retention_days_positive CHECK (retention_days IS NULL OR (retention_days >= 1 AND retention_days <= 3650))
);

ALTER TABLE public.system_backup_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view backup settings"
ON public.system_backup_settings
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert backup settings"
ON public.system_backup_settings
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update backup settings"
ON public.system_backup_settings
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed the singleton row
INSERT INTO public.system_backup_settings (singleton, retention_count, cleanup_enabled)
VALUES (true, 50, true)
ON CONFLICT (singleton) DO NOTHING;

-- Allow audit rows that are not tied to a real user (e.g. system cleanup events)
ALTER TABLE public.system_backup_audit
  ALTER COLUMN user_id DROP NOT NULL;

-- Pruning function: keeps last N successful/partial entries + entries newer than retention_days,
-- always preserves "denied"/"rejected" entries (security signal), and records a cleanup event.
CREATE OR REPLACE FUNCTION public.prune_system_backup_audit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg RECORD;
  keep_ids UUID[];
  deleted_count INTEGER := 0;
  cutoff TIMESTAMPTZ;
BEGIN
  SELECT retention_count, retention_days, cleanup_enabled
    INTO cfg
    FROM public.system_backup_settings
    WHERE singleton = true
    LIMIT 1;

  IF cfg IS NULL OR cfg.cleanup_enabled = false THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'cleanup disabled');
  END IF;

  -- Build the keep set: last N export rows
  SELECT array_agg(id) INTO keep_ids
  FROM (
    SELECT id
      FROM public.system_backup_audit
      WHERE status IN ('success', 'partial')
      ORDER BY created_at DESC
      LIMIT cfg.retention_count
  ) k;

  IF cfg.retention_days IS NOT NULL THEN
    cutoff := now() - (cfg.retention_days || ' days')::interval;
  ELSE
    cutoff := NULL;
  END IF;

  WITH del AS (
    DELETE FROM public.system_backup_audit a
    WHERE a.status IN ('success', 'partial')
      AND (keep_ids IS NULL OR NOT (a.id = ANY(keep_ids)))
      AND (cutoff IS NULL OR a.created_at < cutoff)
    RETURNING a.id
  )
  SELECT count(*)::int INTO deleted_count FROM del;

  -- Record the cleanup event in the same audit log (system actor)
  IF deleted_count > 0 THEN
    INSERT INTO public.system_backup_audit (
      user_id, actor_email, tables_requested, tables_exported,
      row_counts, total_rows, byte_size, status, error_message
    ) VALUES (
      NULL,
      'system@cleanup',
      ARRAY[]::text[],
      ARRAY[]::text[],
      jsonb_build_object('pruned_audit_rows', deleted_count),
      deleted_count,
      0,
      'cleanup',
      format('Pruned %s backup audit rows (retention: last %s, days: %s)',
             deleted_count, cfg.retention_count, COALESCE(cfg.retention_days::text, '∞'))
    );
  END IF;

  RETURN jsonb_build_object(
    'deleted', deleted_count,
    'retention_count', cfg.retention_count,
    'retention_days', cfg.retention_days
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prune_system_backup_audit() FROM PUBLIC, anon, authenticated;

-- Maintain updated_at on settings
CREATE TRIGGER trg_system_backup_settings_updated_at
BEFORE UPDATE ON public.system_backup_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

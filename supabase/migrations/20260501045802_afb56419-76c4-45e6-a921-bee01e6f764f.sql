
INSERT INTO storage.buckets (id, name, public)
VALUES ('system-backups', 'system-backups', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Admins can view system backups"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'system-backups' AND public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can upload system backups"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'system-backups' AND public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can delete system backups"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'system-backups' AND public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.system_backup_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID REFERENCES public.system_backup_audit(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  tables_included TEXT[] NOT NULL DEFAULT '{}',
  row_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_rows INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'auto',
  created_by UUID,
  actor_email TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT snapshot_source_valid CHECK (source IN ('auto','upload'))
);

ALTER TABLE public.system_backup_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins view system_backup_snapshots"
    ON public.system_backup_snapshots FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Block direct snapshot insert"
    ON public.system_backup_snapshots FOR INSERT TO authenticated
    WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Block direct snapshot update"
    ON public.system_backup_snapshots FOR UPDATE TO authenticated
    USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can delete snapshots"
    ON public.system_backup_snapshots FOR DELETE TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_sb_snapshots_created_at
  ON public.system_backup_snapshots (created_at DESC);

CREATE TABLE IF NOT EXISTS public.system_backup_restore_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  actor_email TEXT,
  snapshot_id UUID REFERENCES public.system_backup_snapshots(id) ON DELETE SET NULL,
  source_label TEXT,
  tables_requested TEXT[] NOT NULL,
  tables_restored TEXT[] NOT NULL DEFAULT '{}',
  rows_written JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_rows_written INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.system_backup_restore_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins view restore audit"
    ON public.system_backup_restore_audit FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Block direct restore-audit insert"
    ON public.system_backup_restore_audit FOR INSERT TO authenticated
    WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_sb_restore_audit_created_at
  ON public.system_backup_restore_audit (created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_admins(
  _title TEXT,
  _message TEXT,
  _type TEXT DEFAULT 'general',
  _reference_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted INTEGER := 0;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, reference_id)
  SELECT ur.user_id, _title, _message, _type, _reference_id
    FROM public.user_roles ur
   WHERE ur.role = 'admin';
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_admins(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

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
  deleted_files INTEGER := 0;
  cutoff TIMESTAMPTZ;
  err_text TEXT;
BEGIN
  SELECT retention_count, retention_days, cleanup_enabled
    INTO cfg
    FROM public.system_backup_settings
    WHERE singleton = true
    LIMIT 1;

  IF cfg IS NULL OR cfg.cleanup_enabled = false THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'cleanup disabled');
  END IF;

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

  -- Delete archived storage files for prunable audit rows
  WITH prunable_audit AS (
    SELECT a.id FROM public.system_backup_audit a
     WHERE a.status IN ('success','partial')
       AND (keep_ids IS NULL OR NOT (a.id = ANY(keep_ids)))
       AND (cutoff IS NULL OR a.created_at < cutoff)
  ),
  doomed_files AS (
    SELECT s.storage_path
      FROM public.system_backup_snapshots s
      JOIN prunable_audit p ON p.id = s.audit_id
  ),
  removed AS (
    DELETE FROM storage.objects o
     USING doomed_files d
     WHERE o.bucket_id = 'system-backups'
       AND o.name = d.storage_path
    RETURNING 1
  )
  SELECT count(*)::int INTO deleted_files FROM removed;

  -- Delete the snapshot index rows
  DELETE FROM public.system_backup_snapshots s
   USING (
     SELECT a.id FROM public.system_backup_audit a
      WHERE a.status IN ('success','partial')
        AND (keep_ids IS NULL OR NOT (a.id = ANY(keep_ids)))
        AND (cutoff IS NULL OR a.created_at < cutoff)
   ) p
   WHERE s.audit_id = p.id;

  WITH del AS (
    DELETE FROM public.system_backup_audit a
    WHERE a.status IN ('success', 'partial')
      AND (keep_ids IS NULL OR NOT (a.id = ANY(keep_ids)))
      AND (cutoff IS NULL OR a.created_at < cutoff)
    RETURNING a.id
  )
  SELECT count(*)::int INTO deleted_count FROM del;

  INSERT INTO public.system_backup_audit (
    user_id, actor_email, tables_requested, tables_exported,
    row_counts, total_rows, byte_size, status, error_message
  ) VALUES (
    NULL,
    'system@cleanup',
    ARRAY[]::text[],
    ARRAY[]::text[],
    jsonb_build_object(
      'pruned_audit_rows', deleted_count,
      'pruned_snapshot_files', deleted_files
    ),
    deleted_count,
    0,
    'cleanup',
    format('Pruned %s audit rows and %s snapshot files (retention: last %s, days: %s)',
           deleted_count, deleted_files, cfg.retention_count,
           COALESCE(cfg.retention_days::text, '∞'))
  );

  PERFORM public.notify_admins(
    'Backup cleanup completed',
    format('Pruned %s old audit rows and %s archived snapshot files.', deleted_count, deleted_files),
    'general'
  );

  RETURN jsonb_build_object(
    'deleted', deleted_count,
    'deleted_files', deleted_files,
    'retention_count', cfg.retention_count,
    'retention_days', cfg.retention_days
  );
EXCEPTION WHEN OTHERS THEN
  err_text := SQLERRM;
  INSERT INTO public.system_backup_audit (
    user_id, actor_email, tables_requested, tables_exported,
    status, error_message
  ) VALUES (
    NULL, 'system@cleanup', ARRAY[]::text[], ARRAY[]::text[],
    'cleanup_failed', err_text
  );
  PERFORM public.notify_admins(
    'Backup cleanup FAILED',
    format('Cleanup task raised an error: %s', err_text),
    'general'
  );
  RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prune_system_backup_audit() FROM PUBLIC, anon, authenticated;

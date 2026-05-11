-- 1. Retention settings on app_settings (singleton)
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS announcement_file_retention_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS announcement_file_retention_days_global INT NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS announcement_file_retention_days_department INT NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS announcement_file_cleanup_mode TEXT NOT NULL DEFAULT 'deactivate',
  ADD COLUMN IF NOT EXISTS announcement_file_cleanup_last_run_at TIMESTAMPTZ;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_ann_cleanup_mode_check
  CHECK (announcement_file_cleanup_mode IN ('deactivate','soft_delete'));

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_ann_retention_global_check
  CHECK (announcement_file_retention_days_global BETWEEN 1 AND 3650);

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_ann_retention_dept_check
  CHECK (announcement_file_retention_days_department BETWEEN 1 AND 3650);

-- 2. Per-file expiry columns
ALTER TABLE public.announcement_files
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retention_days INT,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_announcement_files_expires_at
  ON public.announcement_files(expires_at)
  WHERE is_active = true;

-- Update RLS: staff should not see files past their expiry
DROP POLICY IF EXISTS "Staff view targeted shared files" ON public.announcement_files;
CREATE POLICY "Staff view targeted shared files"
ON public.announcement_files FOR SELECT
TO authenticated
USING (
  is_active = true
  AND (expires_at IS NULL OR expires_at > now())
  AND (
    department_id IS NULL
    OR department_id = public.get_user_department_id(auth.uid())
    OR public.is_command_tier(auth.uid())
  )
);

-- 3. Cleanup runs history
CREATE TABLE IF NOT EXISTS public.announcement_file_cleanup_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  triggered_by UUID,
  trigger_kind TEXT NOT NULL DEFAULT 'manual',
  files_scanned INT NOT NULL DEFAULT 0,
  files_deactivated INT NOT NULL DEFAULT 0,
  files_soft_deleted INT NOT NULL DEFAULT 0,
  files_with_default_applied INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

ALTER TABLE public.announcement_file_cleanup_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read cleanup runs"
ON public.announcement_file_cleanup_runs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert cleanup runs"
ON public.announcement_file_cleanup_runs FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Retention application function (admin-callable)
CREATE OR REPLACE FUNCTION public.apply_announcement_file_retention()
RETURNS TABLE (
  scanned INT,
  default_applied INT,
  deactivated INT,
  soft_deleted INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  v_scanned INT := 0;
  v_default INT := 0;
  v_deactivated INT := 0;
  v_softdel INT := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can apply retention policy';
  END IF;

  SELECT * INTO s FROM public.app_settings LIMIT 1;
  IF s IS NULL OR s.announcement_file_retention_enabled = false THEN
    RETURN QUERY SELECT 0, 0, 0, 0;
    RETURN;
  END IF;

  -- 1. Apply default retention to active files missing expires_at
  WITH applied AS (
    UPDATE public.announcement_files af
    SET
      expires_at = af.created_at + (
        CASE
          WHEN af.department_id IS NULL
            THEN (s.announcement_file_retention_days_global || ' days')::INTERVAL
          ELSE (s.announcement_file_retention_days_department || ' days')::INTERVAL
        END
      ),
      retention_days = CASE
        WHEN af.department_id IS NULL THEN s.announcement_file_retention_days_global
        ELSE s.announcement_file_retention_days_department
      END
    WHERE af.is_active = true AND af.expires_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_default FROM applied;

  -- 2. Count active files we'll evaluate
  SELECT count(*) INTO v_scanned
  FROM public.announcement_files
  WHERE is_active = true;

  -- 3. Apply expiry action
  IF s.announcement_file_cleanup_mode = 'soft_delete' THEN
    WITH expired AS (
      UPDATE public.announcement_files
      SET is_active = false,
          expired_at = now()
      WHERE is_active = true
        AND expires_at IS NOT NULL
        AND expires_at <= now()
        AND deleted_at IS NULL
      RETURNING id
    )
    SELECT count(*) INTO v_softdel FROM expired;

    -- Move them through soft_delete_record so they show in recycle bin
    -- (soft_delete_record requires per-row call; we just mark deleted_at here)
    UPDATE public.announcement_files
    SET deleted_at = now(),
        deleted_by = auth.uid()
    WHERE expired_at = now()
      AND deleted_at IS NULL;
  ELSE
    WITH expired AS (
      UPDATE public.announcement_files
      SET is_active = false,
          expired_at = now()
      WHERE is_active = true
        AND expires_at IS NOT NULL
        AND expires_at <= now()
      RETURNING id
    )
    SELECT count(*) INTO v_deactivated FROM expired;
  END IF;

  UPDATE public.app_settings
  SET announcement_file_cleanup_last_run_at = now();

  RETURN QUERY SELECT v_scanned, v_default, v_deactivated, v_softdel;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_announcement_file_retention() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_announcement_file_retention() TO authenticated;
-- 1. Allow snapshots to be tagged as 'scheduled' (in addition to 'auto' and 'upload').
ALTER TABLE public.system_backup_snapshots
  DROP CONSTRAINT IF EXISTS snapshot_source_valid;
ALTER TABLE public.system_backup_snapshots
  ADD CONSTRAINT snapshot_source_valid
  CHECK (source = ANY (ARRAY['auto'::text, 'upload'::text, 'scheduled'::text]));

-- 2. Frequency enum
DO $$ BEGIN
  CREATE TYPE public.backup_frequency AS ENUM
    ('hourly','daily','weekly','monthly','quarterly','annually');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Schedules table
CREATE TABLE IF NOT EXISTS public.system_backup_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  frequency       public.backup_frequency NOT NULL,
  tables_included text[] NOT NULL DEFAULT '{}',
  retention_days  integer CHECK (retention_days IS NULL OR (retention_days >= 1 AND retention_days <= 3650)),
  is_active       boolean NOT NULL DEFAULT true,
  last_run_at     timestamptz,
  last_run_status text,
  last_run_error  text,
  next_run_at     timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sb_schedules_due
  ON public.system_backup_schedules (next_run_at)
  WHERE is_active;

CREATE TRIGGER trg_system_backup_schedules_updated_at
  BEFORE UPDATE ON public.system_backup_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.system_backup_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view backup schedules"
  ON public.system_backup_schedules FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert backup schedules"
  ON public.system_backup_schedules FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update backup schedules"
  ON public.system_backup_schedules FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete backup schedules"
  ON public.system_backup_schedules FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. schedule_id link on audit + snapshots
ALTER TABLE public.system_backup_audit
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.system_backup_schedules(id) ON DELETE SET NULL;

ALTER TABLE public.system_backup_snapshots
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.system_backup_schedules(id) ON DELETE SET NULL;

-- 5. Compute next run-time for a given frequency
CREATE OR REPLACE FUNCTION public.compute_next_backup_run(
  _frequency public.backup_frequency,
  _from timestamptz
) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _frequency
    WHEN 'hourly'    THEN _from + interval '1 hour'
    WHEN 'daily'     THEN _from + interval '1 day'
    WHEN 'weekly'    THEN _from + interval '7 days'
    WHEN 'monthly'   THEN _from + interval '1 month'
    WHEN 'quarterly' THEN _from + interval '3 months'
    WHEN 'annually'  THEN _from + interval '1 year'
  END
$$;

-- 6. Atomically claim schedules that are due. Returns id+frequency+tables+retention.
-- Marks next_run_at forward so concurrent dispatchers don't double-fire.
CREATE OR REPLACE FUNCTION public.claim_due_backup_schedules()
RETURNS TABLE (
  id uuid, name text, frequency public.backup_frequency,
  tables_included text[], retention_days integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT s.id
    FROM public.system_backup_schedules s
    WHERE s.is_active AND s.next_run_at <= now()
    ORDER BY s.next_run_at
    FOR UPDATE SKIP LOCKED
    LIMIT 25
  ),
  bumped AS (
    UPDATE public.system_backup_schedules s
       SET next_run_at = public.compute_next_backup_run(s.frequency, now())
     WHERE s.id IN (SELECT due.id FROM due)
     RETURNING s.id, s.name, s.frequency, s.tables_included, s.retention_days
  )
  SELECT b.id, b.name, b.frequency, b.tables_included, b.retention_days FROM bumped b;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_backup_schedules() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_backup_schedules() TO service_role;

-- 7. Mark a schedule's last-run result
CREATE OR REPLACE FUNCTION public.mark_backup_schedule_ran(
  _schedule_id uuid, _status text, _error text
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.system_backup_schedules
     SET last_run_at = now(),
         last_run_status = _status,
         last_run_error = _error
   WHERE id = _schedule_id;
$$;

REVOKE ALL ON FUNCTION public.mark_backup_schedule_ran(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_backup_schedule_ran(uuid, text, text) TO service_role;

-- 8. Per-schedule retention pruning: deletes audit/snapshot rows older than retention_days
CREATE OR REPLACE FUNCTION public.prune_backup_schedule_history(_schedule_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _days integer;
  _deleted integer := 0;
BEGIN
  SELECT retention_days INTO _days
  FROM public.system_backup_schedules WHERE id = _schedule_id;
  IF _days IS NULL THEN RETURN 0; END IF;

  DELETE FROM public.system_backup_audit
   WHERE schedule_id = _schedule_id
     AND created_at < now() - (_days || ' days')::interval
     AND status NOT IN ('denied','rejected');
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_backup_schedule_history(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_backup_schedule_history(uuid) TO service_role;
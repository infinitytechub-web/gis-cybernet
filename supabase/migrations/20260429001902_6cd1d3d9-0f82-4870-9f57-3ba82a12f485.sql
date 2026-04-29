-- Extend alert settings with channels
ALTER TABLE public.inventory_alert_settings
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS email_recipients text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS alert_email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_webhook_enabled boolean NOT NULL DEFAULT false;

-- Schedules
CREATE TABLE IF NOT EXISTS public.inventory_audit_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frequency text NOT NULL CHECK (frequency IN ('hourly','daily','weekly','monthly')),
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_report_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_audit_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_sched_select" ON public.inventory_audit_schedules;
CREATE POLICY "audit_sched_select" ON public.inventory_audit_schedules
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic')
    OR public.has_role(auth.uid(),'storekeeper')
  );

DROP POLICY IF EXISTS "audit_sched_insert" ON public.inventory_audit_schedules;
CREATE POLICY "audit_sched_insert" ON public.inventory_audit_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic')
    OR public.has_role(auth.uid(),'storekeeper')
  );

DROP POLICY IF EXISTS "audit_sched_update" ON public.inventory_audit_schedules;
CREATE POLICY "audit_sched_update" ON public.inventory_audit_schedules
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic')
    OR public.has_role(auth.uid(),'storekeeper')
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "audit_sched_delete" ON public.inventory_audit_schedules;
CREATE POLICY "audit_sched_delete" ON public.inventory_audit_schedules
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'oic')
  );

DROP TRIGGER IF EXISTS trg_audit_sched_updated ON public.inventory_audit_schedules;
CREATE TRIGGER trg_audit_sched_updated
  BEFORE UPDATE ON public.inventory_audit_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Runs (history)
CREATE TABLE IF NOT EXISTS public.inventory_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES public.inventory_audit_schedules(id) ON DELETE SET NULL,
  triggered_by uuid,
  triggered_kind text NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'manual'
  mismatched_count integer NOT NULL DEFAULT 0,
  net_variance_value numeric NOT NULL DEFAULT 0,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_csv_path text,
  report_pdf_path text,
  delivery_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_audit_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_runs_select" ON public.inventory_audit_runs;
CREATE POLICY "audit_runs_select" ON public.inventory_audit_runs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic')
    OR public.has_role(auth.uid(),'storekeeper')
  );

DROP POLICY IF EXISTS "audit_runs_insert" ON public.inventory_audit_runs;
CREATE POLICY "audit_runs_insert" ON public.inventory_audit_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic')
    OR public.has_role(auth.uid(),'storekeeper')
  );

CREATE INDEX IF NOT EXISTS idx_audit_runs_created ON public.inventory_audit_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_runs_schedule ON public.inventory_audit_runs(schedule_id);
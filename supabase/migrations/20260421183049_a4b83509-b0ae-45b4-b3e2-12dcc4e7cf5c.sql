-- Monthly attendance compliance snapshots — one row per staff per period.
-- Re-importing the same period UPSERTs on (profile_id, period_start, period_type)
-- so figures update in place rather than creating duplicates.

CREATE TABLE IF NOT EXISTS public.attendance_compliance_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL DEFAULT 'monthly',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  staff_id_snapshot TEXT,
  name_snapshot TEXT,
  department_snapshot TEXT,
  office_snapshot TEXT,
  shift_snapshot TEXT,
  working_days INTEGER NOT NULL DEFAULT 0,
  present INTEGER NOT NULL DEFAULT 0,
  absent INTEGER NOT NULL DEFAULT 0,
  late INTEGER NOT NULL DEFAULT 0,
  leave_days INTEGER NOT NULL DEFAULT 0,
  missing_logs INTEGER NOT NULL DEFAULT 0,
  compliance_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  log_completeness_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'import',
  imported_by UUID,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  filters JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_compliance_snapshots_unique
    UNIQUE (profile_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_acs_period
  ON public.attendance_compliance_snapshots (period_type, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_acs_profile
  ON public.attendance_compliance_snapshots (profile_id);

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS trg_acs_updated_at ON public.attendance_compliance_snapshots;
CREATE TRIGGER trg_acs_updated_at
BEFORE UPDATE ON public.attendance_compliance_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.attendance_compliance_snapshots ENABLE ROW LEVEL SECURITY;

-- Read: command tier + supervisors (same audience as attendance reports)
CREATE POLICY "ACS readable by command/supervisor"
ON public.attendance_compliance_snapshots
FOR SELECT
TO authenticated
USING (
  public.is_command_tier(auth.uid())
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
);

-- Write (insert/update/delete): admin + command tier (admin/oic/2ic/staff_officer)
CREATE POLICY "ACS insertable by command tier"
ON public.attendance_compliance_snapshots
FOR INSERT
TO authenticated
WITH CHECK (public.is_command_tier(auth.uid()));

CREATE POLICY "ACS updatable by command tier"
ON public.attendance_compliance_snapshots
FOR UPDATE
TO authenticated
USING (public.is_command_tier(auth.uid()))
WITH CHECK (public.is_command_tier(auth.uid()));

CREATE POLICY "ACS deletable by command tier"
ON public.attendance_compliance_snapshots
FOR DELETE
TO authenticated
USING (public.is_command_tier(auth.uid()));

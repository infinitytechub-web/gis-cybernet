
-- 1) Audit log table
CREATE TABLE IF NOT EXISTS public.staff_appraisal_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appraisal_id UUID,                              -- nullable: duplicate attempts have no appraisal row
  staff_profile_id UUID NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER,
  action TEXT NOT NULL,                           -- 'created' | 'updated' | 'submitted' | 'duplicate_attempt' | 'deleted'
  actor_id UUID,                                  -- auth.uid() of reviewer
  bulk_batch_id UUID,                             -- groups bulk-loop entries
  bulk_size INTEGER,                              -- #targets in the originating batch
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appraisal_audit_appraisal ON public.staff_appraisal_audit(appraisal_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_audit_staff ON public.staff_appraisal_audit(staff_profile_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_audit_period ON public.staff_appraisal_audit(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_appraisal_audit_batch ON public.staff_appraisal_audit(bulk_batch_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_audit_created ON public.staff_appraisal_audit(created_at DESC);

ALTER TABLE public.staff_appraisal_audit ENABLE ROW LEVEL SECURITY;

-- Command tier (admins, supervisors, OIC, 2IC, staff_officer) and HoA can read;
-- staff can read entries for their own profile.
DROP POLICY IF EXISTS "Audit visible to command and owner" ON public.staff_appraisal_audit;
CREATE POLICY "Audit visible to command and owner"
ON public.staff_appraisal_audit FOR SELECT
TO authenticated
USING (
  public.can_manage_appraisals(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = staff_appraisal_audit.staff_profile_id AND p.user_id = auth.uid()
  )
);

-- Inserts only via SECURITY DEFINER triggers / RPCs.
DROP POLICY IF EXISTS "No client inserts on appraisal audit" ON public.staff_appraisal_audit;
CREATE POLICY "No client inserts on appraisal audit"
ON public.staff_appraisal_audit FOR INSERT
TO authenticated
WITH CHECK (false);

-- 2) Trigger: log created/updated/submitted/deleted on staff_appraisals
CREATE OR REPLACE FUNCTION public.log_staff_appraisal_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_details JSONB := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := CASE WHEN NEW.status = 'submitted' THEN 'submitted' ELSE 'created' END;
    v_details := jsonb_build_object('status', NEW.status, 'total_score', NEW.total_score);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'submitted' THEN
      v_action := 'submitted';
    ELSE
      v_action := 'updated';
    END IF;
    v_details := jsonb_build_object(
      'status', NEW.status,
      'prev_status', OLD.status,
      'total_score', NEW.total_score,
      'prev_total_score', OLD.total_score
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_details := jsonb_build_object('status', OLD.status, 'total_score', OLD.total_score);
  END IF;

  INSERT INTO public.staff_appraisal_audit
    (appraisal_id, staff_profile_id, period_year, period_month, action, actor_id, details)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.staff_profile_id, OLD.staff_profile_id),
    COALESCE(NEW.period_year, OLD.period_year),
    COALESCE(NEW.period_month, OLD.period_month),
    v_action,
    auth.uid(),
    v_details
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.log_staff_appraisal_change() FROM public;

DROP TRIGGER IF EXISTS staff_appraisals_log_change ON public.staff_appraisals;
CREATE TRIGGER staff_appraisals_log_change
AFTER INSERT OR UPDATE OR DELETE ON public.staff_appraisals
FOR EACH ROW EXECUTE FUNCTION public.log_staff_appraisal_change();

-- 3) Duplicate-attempt logger (called from client when 23505/trigger error caught)
CREATE OR REPLACE FUNCTION public.log_appraisal_duplicate_attempt(
  _staff_profile_id UUID,
  _period_year INTEGER,
  _period_month INTEGER,
  _bulk_batch_id UUID DEFAULT NULL,
  _bulk_size INTEGER DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_appraisals(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to log appraisal events';
  END IF;
  INSERT INTO public.staff_appraisal_audit
    (appraisal_id, staff_profile_id, period_year, period_month, action,
     actor_id, bulk_batch_id, bulk_size, details)
  VALUES (
    NULL, _staff_profile_id, _period_year, _period_month, 'duplicate_attempt',
    auth.uid(), _bulk_batch_id, _bulk_size,
    jsonb_build_object('reason', 'unique_index_or_trigger')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_appraisal_duplicate_attempt(UUID,INTEGER,INTEGER,UUID,INTEGER) FROM public;
GRANT EXECUTE ON FUNCTION public.log_appraisal_duplicate_attempt(UUID,INTEGER,INTEGER,UUID,INTEGER) TO authenticated;

-- 4) Tag a successfully-created appraisal with bulk batch info (post-insert).
CREATE OR REPLACE FUNCTION public.tag_appraisal_audit_batch(
  _appraisal_id UUID,
  _bulk_batch_id UUID,
  _bulk_size INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_appraisals(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.staff_appraisal_audit
     SET bulk_batch_id = _bulk_batch_id,
         bulk_size = _bulk_size
   WHERE appraisal_id = _appraisal_id
     AND actor_id = auth.uid()
     AND bulk_batch_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tag_appraisal_audit_batch(UUID,UUID,INTEGER) FROM public;
GRANT EXECUTE ON FUNCTION public.tag_appraisal_audit_batch(UUID,UUID,INTEGER) TO authenticated;

-- 5) Coverage report RPC: who is missing an appraisal for a period, plus duplicate-attempt counts.
CREATE OR REPLACE FUNCTION public.appraisal_coverage_report(
  _period_year INTEGER,
  _period_month INTEGER DEFAULT NULL
) RETURNS TABLE (
  staff_profile_id UUID,
  staff_id TEXT,
  first_name TEXT,
  last_name TEXT,
  rank_name TEXT,
  rank_level INTEGER,
  department_name TEXT,
  has_appraisal BOOLEAN,
  appraisal_status TEXT,
  total_score NUMERIC,
  duplicate_attempts INTEGER,
  last_attempt_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_appraisals(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.staff_id,
    p.first_name,
    p.last_name,
    r.name,
    r.level,
    d.name,
    (a.id IS NOT NULL) AS has_appraisal,
    a.status::text,
    a.total_score,
    COALESCE(dup.cnt, 0)::int,
    dup.last_at
  FROM public.profiles p
  LEFT JOIN public.ranks r ON r.id = p.rank_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.staff_appraisals a
    ON a.staff_profile_id = p.id
   AND a.period_year = _period_year
   AND COALESCE(a.period_month, 0) = COALESCE(_period_month, 0)
  LEFT JOIN (
    SELECT staff_profile_id,
           COUNT(*)::int AS cnt,
           MAX(created_at) AS last_at
    FROM public.staff_appraisal_audit
    WHERE action = 'duplicate_attempt'
      AND period_year = _period_year
      AND COALESCE(period_month, 0) = COALESCE(_period_month, 0)
    GROUP BY staff_profile_id
  ) dup ON dup.staff_profile_id = p.id
  WHERE p.status = 'active'
  ORDER BY r.level DESC NULLS LAST, p.last_name, p.first_name;
END;
$$;

REVOKE ALL ON FUNCTION public.appraisal_coverage_report(INTEGER,INTEGER) FROM public;
GRANT EXECUTE ON FUNCTION public.appraisal_coverage_report(INTEGER,INTEGER) TO authenticated;

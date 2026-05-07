
DROP FUNCTION IF EXISTS public.appraisal_coverage_report(INTEGER, INTEGER);

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
  unit TEXT,
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
    p.id, p.staff_id, p.first_name, p.last_name,
    r.name, r.level, d.name, p.unit,
    (a.id IS NOT NULL),
    a.status::text, a.total_score,
    COALESCE(dup.cnt, 0)::int, dup.last_at
  FROM public.profiles p
  LEFT JOIN public.ranks r ON r.id = p.rank_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.staff_appraisals a
    ON a.staff_profile_id = p.id
   AND a.period_year = _period_year
   AND COALESCE(a.period_month, 0) = COALESCE(_period_month, 0)
  LEFT JOIN (
    SELECT staff_profile_id, COUNT(*)::int AS cnt, MAX(created_at) AS last_at
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

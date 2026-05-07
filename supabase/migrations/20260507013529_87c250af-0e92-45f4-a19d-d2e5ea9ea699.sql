-- Standard 7 GIS HR/PPMED/Promotion appraisal criteria (placeholder, editable later)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appraisal_criterion') THEN
    CREATE TYPE public.appraisal_criterion AS ENUM (
      'job_knowledge',
      'quality_of_work',
      'productivity',
      'discipline_conduct',
      'leadership_teamwork',
      'initiative',
      'punctuality_attendance'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appraisal_status') THEN
    CREATE TYPE public.appraisal_status AS ENUM ('draft','submitted','acknowledged');
  END IF;
END$$;

-- Appraisal header
CREATE TABLE IF NOT EXISTS public.staff_appraisals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  appraised_by uuid NOT NULL,                 -- auth.users id of reviewer
  period_year int  NOT NULL,
  period_month int CHECK (period_month BETWEEN 1 AND 12), -- nullable for annual
  status public.appraisal_status NOT NULL DEFAULT 'draft',
  total_score numeric(5,2) NOT NULL DEFAULT 0,    -- sum of 7 criteria (max 35)
  average_score numeric(4,2) NOT NULL DEFAULT 0,  -- /5
  outstanding boolean NOT NULL DEFAULT false,
  comments text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_appraisals_staff ON public.staff_appraisals(staff_profile_id);
CREATE INDEX IF NOT EXISTS idx_staff_appraisals_period ON public.staff_appraisals(period_year, period_month);

-- Per-criterion scores
CREATE TABLE IF NOT EXISTS public.staff_appraisal_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appraisal_id uuid NOT NULL REFERENCES public.staff_appraisals(id) ON DELETE CASCADE,
  criterion public.appraisal_criterion NOT NULL,
  score int NOT NULL CHECK (score BETWEEN 1 AND 5),
  remarks text,
  UNIQUE (appraisal_id, criterion)
);

-- updated_at trigger
DROP TRIGGER IF EXISTS update_staff_appraisals_updated_at ON public.staff_appraisals;
CREATE TRIGGER update_staff_appraisals_updated_at
BEFORE UPDATE ON public.staff_appraisals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-recompute totals when scores change
CREATE OR REPLACE FUNCTION public.recompute_appraisal_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _aid uuid;
  _sum numeric;
  _cnt int;
BEGIN
  _aid := COALESCE(NEW.appraisal_id, OLD.appraisal_id);
  SELECT COALESCE(SUM(score), 0), COUNT(*) INTO _sum, _cnt
    FROM public.staff_appraisal_scores WHERE appraisal_id = _aid;
  UPDATE public.staff_appraisals
     SET total_score   = _sum,
         average_score = CASE WHEN _cnt > 0 THEN ROUND(_sum::numeric / _cnt, 2) ELSE 0 END,
         outstanding   = (_sum >= 30) -- >=30/35 ≈ avg ≥ 4.3
   WHERE id = _aid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_appraisal_scores ON public.staff_appraisal_scores;
CREATE TRIGGER trg_recompute_appraisal_scores
AFTER INSERT OR UPDATE OR DELETE ON public.staff_appraisal_scores
FOR EACH ROW EXECUTE FUNCTION public.recompute_appraisal_totals();

-- RLS
ALTER TABLE public.staff_appraisals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_appraisal_scores ENABLE ROW LEVEL SECURITY;

-- Helper: command tier check (mirrors AuthContext command tier) + HoA + Chief Staff Officer
CREATE OR REPLACE FUNCTION public.can_manage_appraisals(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_uid, 'admin'::app_role)
    OR public.has_role(_uid, 'oic'::app_role)
    OR public.has_role(_uid, '2ic'::app_role)
    OR public.has_role(_uid, 'staff_officer'::app_role)
    OR public.has_role(_uid, 'supervisor'::app_role)
    OR public.has_role(_uid, 'head_of_administration'::app_role)
    OR public.has_role(_uid, 'chief_staff_officer'::app_role)
$$;

-- Appraisal headers
DROP POLICY IF EXISTS "Staff can view own appraisals" ON public.staff_appraisals;
CREATE POLICY "Staff can view own appraisals"
  ON public.staff_appraisals FOR SELECT TO authenticated
  USING (
    public.can_manage_appraisals(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = staff_profile_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Reviewers can insert appraisals" ON public.staff_appraisals;
CREATE POLICY "Reviewers can insert appraisals"
  ON public.staff_appraisals FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_appraisals(auth.uid()) AND appraised_by = auth.uid());

DROP POLICY IF EXISTS "Reviewers can update appraisals" ON public.staff_appraisals;
CREATE POLICY "Reviewers can update appraisals"
  ON public.staff_appraisals FOR UPDATE TO authenticated
  USING (public.can_manage_appraisals(auth.uid()))
  WITH CHECK (public.can_manage_appraisals(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete appraisals" ON public.staff_appraisals;
CREATE POLICY "Admins can delete appraisals"
  ON public.staff_appraisals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Per-criterion scores follow the parent
DROP POLICY IF EXISTS "View scores when can view appraisal" ON public.staff_appraisal_scores;
CREATE POLICY "View scores when can view appraisal"
  ON public.staff_appraisal_scores FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_appraisals a
       WHERE a.id = appraisal_id
         AND (
           public.can_manage_appraisals(auth.uid())
           OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = a.staff_profile_id AND p.user_id = auth.uid())
         )
    )
  );

DROP POLICY IF EXISTS "Reviewers manage scores" ON public.staff_appraisal_scores;
CREATE POLICY "Reviewers manage scores"
  ON public.staff_appraisal_scores FOR ALL TO authenticated
  USING (public.can_manage_appraisals(auth.uid()))
  WITH CHECK (public.can_manage_appraisals(auth.uid()));

-- Top-5 helpers
CREATE OR REPLACE FUNCTION public.top5_staff_of_month(_year int, _month int)
RETURNS TABLE (
  staff_profile_id uuid,
  staff_name text,
  avg_score numeric,
  appraisal_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.staff_profile_id,
         (p.last_name || ', ' || p.first_name) AS staff_name,
         ROUND(AVG(a.average_score)::numeric, 2) AS avg_score,
         COUNT(*)::int AS appraisal_count
    FROM public.staff_appraisals a
    JOIN public.profiles p ON p.id = a.staff_profile_id
   WHERE a.status IN ('submitted','acknowledged')
     AND a.period_year = _year
     AND a.period_month = _month
   GROUP BY a.staff_profile_id, p.last_name, p.first_name
   ORDER BY avg_score DESC, appraisal_count DESC
   LIMIT 5
$$;

CREATE OR REPLACE FUNCTION public.top5_staff_of_year(_year int)
RETURNS TABLE (
  staff_profile_id uuid,
  staff_name text,
  avg_score numeric,
  appraisal_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.staff_profile_id,
         (p.last_name || ', ' || p.first_name) AS staff_name,
         ROUND(AVG(a.average_score)::numeric, 2) AS avg_score,
         COUNT(*)::int AS appraisal_count
    FROM public.staff_appraisals a
    JOIN public.profiles p ON p.id = a.staff_profile_id
   WHERE a.status IN ('submitted','acknowledged')
     AND a.period_year = _year
   GROUP BY a.staff_profile_id, p.last_name, p.first_name
   ORDER BY avg_score DESC, appraisal_count DESC
   LIMIT 5
$$;
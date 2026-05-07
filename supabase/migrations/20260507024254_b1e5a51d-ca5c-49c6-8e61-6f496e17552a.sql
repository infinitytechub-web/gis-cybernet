-- Enforce one appraisal per officer per period (annual rows treated as month=0).
CREATE UNIQUE INDEX IF NOT EXISTS staff_appraisals_unique_period
  ON public.staff_appraisals (staff_profile_id, period_year, COALESCE(period_month, 0));

-- Friendly error message via BEFORE INSERT/UPDATE trigger.
CREATE OR REPLACE FUNCTION public.staff_appraisals_block_duplicate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
  period_label text;
BEGIN
  SELECT id INTO existing_id
  FROM public.staff_appraisals
  WHERE staff_profile_id = NEW.staff_profile_id
    AND period_year      = NEW.period_year
    AND COALESCE(period_month, 0) = COALESCE(NEW.period_month, 0)
    AND (TG_OP = 'INSERT' OR id <> NEW.id)
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    period_label := CASE
      WHEN NEW.period_month IS NULL THEN 'annual ' || NEW.period_year::text
      ELSE to_char(make_date(NEW.period_year, NEW.period_month, 1), 'Mon YYYY')
    END;
    RAISE EXCEPTION
      'An appraisal already exists for this officer for the % period.', period_label
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_appraisals_block_duplicate_trg ON public.staff_appraisals;
CREATE TRIGGER staff_appraisals_block_duplicate_trg
  BEFORE INSERT OR UPDATE OF staff_profile_id, period_year, period_month
  ON public.staff_appraisals
  FOR EACH ROW
  EXECUTE FUNCTION public.staff_appraisals_block_duplicate();
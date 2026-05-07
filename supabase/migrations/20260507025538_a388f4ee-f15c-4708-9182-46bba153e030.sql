
CREATE TABLE IF NOT EXISTS public.appraisal_reminders_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year INTEGER NOT NULL,
  period_month INTEGER,
  recipients_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.appraisal_reminders_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reminders log visible to command" ON public.appraisal_reminders_sent;
CREATE POLICY "Reminders log visible to command"
ON public.appraisal_reminders_sent FOR SELECT
TO authenticated
USING (public.can_manage_appraisals(auth.uid()));

DROP POLICY IF EXISTS "No client inserts on reminders log" ON public.appraisal_reminders_sent;
CREATE POLICY "No client inserts on reminders log"
ON public.appraisal_reminders_sent FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.send_appraisal_reminders(
  _period_year INTEGER,
  _period_month INTEGER DEFAULT NULL
) RETURNS TABLE (sent INTEGER, skipped INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_label TEXT;
  v_sent INTEGER := 0;
  v_skipped INTEGER := 0;
  v_rec RECORD;
BEGIN
  IF NOT public.can_manage_appraisals(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_period_label := CASE
    WHEN _period_month IS NULL THEN 'Annual ' || _period_year
    ELSE to_char(make_date(_period_year, _period_month, 1), 'Mon YYYY')
  END;

  FOR v_rec IN
    SELECT p.id AS profile_id, p.user_id
    FROM public.profiles p
    LEFT JOIN public.staff_appraisals a
      ON a.staff_profile_id = p.id
     AND a.period_year = _period_year
     AND COALESCE(a.period_month, 0) = COALESCE(_period_month, 0)
    WHERE p.status = 'active'
      AND p.user_id IS NOT NULL
      AND a.id IS NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = v_rec.user_id
        AND n.type = 'appraisal_reminder'
        AND n.is_read = false
        AND n.message LIKE '%' || v_period_label || '%'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      v_rec.user_id,
      'Appraisal reminder',
      'Your appraisal for ' || v_period_label || ' has not yet been recorded. Please contact your supervisor.'
    );
    v_sent := v_sent + 1;
  END LOOP;

  INSERT INTO public.appraisal_reminders_sent
    (period_year, period_month, recipients_count, skipped_count, actor_id)
  VALUES (_period_year, _period_month, v_sent, v_skipped, auth.uid());

  RETURN QUERY SELECT v_sent, v_skipped;
END;
$$;

REVOKE ALL ON FUNCTION public.send_appraisal_reminders(INTEGER, INTEGER) FROM public;
GRANT EXECUTE ON FUNCTION public.send_appraisal_reminders(INTEGER, INTEGER) TO authenticated;

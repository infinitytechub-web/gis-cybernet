-- Admin-only RPC: returns the job result and atomically redacts passwords from storage
CREATE OR REPLACE FUNCTION public.consume_processing_job_credentials(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_redacted jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT result INTO v_result FROM public.processing_jobs WHERE id = p_job_id;
  IF v_result IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build a redacted copy where created[*].password is replaced with '***'
  IF v_result ? 'created' AND jsonb_typeof(v_result->'created') = 'array' THEN
    v_redacted := jsonb_set(
      v_result,
      '{created}',
      (
        SELECT COALESCE(jsonb_agg(
          CASE
            WHEN elem ? 'password' THEN jsonb_set(elem, '{password}', '"***"'::jsonb, false)
            ELSE elem
          END
        ), '[]'::jsonb)
        FROM jsonb_array_elements(v_result->'created') AS elem
      )
    );

    UPDATE public.processing_jobs
    SET result = v_redacted
    WHERE id = p_job_id;
  END IF;

  RETURN v_result; -- return the original (with plaintext) ONCE to the admin caller
END;
$$;

REVOKE ALL ON FUNCTION public.consume_processing_job_credentials(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_processing_job_credentials(uuid) TO authenticated;

-- Safety-net redaction for any job result older than 24h that still contains passwords
CREATE OR REPLACE FUNCTION public.redact_old_job_passwords()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.processing_jobs pj
  SET result = jsonb_set(
    pj.result,
    '{created}',
    (
      SELECT COALESCE(jsonb_agg(
        CASE
          WHEN elem ? 'password' THEN jsonb_set(elem, '{password}', '"***"'::jsonb, false)
          ELSE elem
        END
      ), '[]'::jsonb)
      FROM jsonb_array_elements(pj.result->'created') AS elem
    )
  )
  WHERE pj.result ? 'created'
    AND jsonb_typeof(pj.result->'created') = 'array'
    AND pj.created_at < now() - interval '24 hours'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(pj.result->'created') e
      WHERE e ? 'password' AND e->>'password' <> '***'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.redact_old_job_passwords() FROM PUBLIC;

-- Schedule the redaction every hour
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('redact-old-job-passwords');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'redact-old-job-passwords',
      '17 * * * *',
      $cron$ SELECT public.redact_old_job_passwords(); $cron$
    );
  END IF;
END $$;

-- Immediately scrub any historical passwords currently stored
SELECT public.redact_old_job_passwords();
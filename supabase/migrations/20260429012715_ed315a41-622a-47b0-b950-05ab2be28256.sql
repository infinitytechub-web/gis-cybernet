
-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.sensitive_table_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('read','list','export','search','view_detail')),
  accessed_by uuid,
  accessed_by_name text,
  record_count integer,
  filters jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sensitive_access_table ON public.sensitive_table_access_log(table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensitive_access_user  ON public.sensitive_table_access_log(accessed_by, created_at DESC);

ALTER TABLE public.sensitive_table_access_log ENABLE ROW LEVEL SECURITY;

-- Admins/OIC/2IC can view; nobody can update or delete (immutable trail).
DROP POLICY IF EXISTS "Command tier can view sensitive access log" ON public.sensitive_table_access_log;
CREATE POLICY "Command tier can view sensitive access log"
ON public.sensitive_table_access_log
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(),'admin'::app_role)
  OR has_role(auth.uid(),'oic'::app_role)
  OR has_role(auth.uid(),'2ic'::app_role)
);

-- Block client-side writes; only SECURITY DEFINER functions may insert.
DROP POLICY IF EXISTS "No client inserts to access log" ON public.sensitive_table_access_log;
CREATE POLICY "No client inserts to access log"
ON public.sensitive_table_access_log
FOR INSERT
TO authenticated
WITH CHECK (false);

-- 2. Generic logger function (used by RPCs and triggers).
CREATE OR REPLACE FUNCTION public.log_sensitive_access(
  _table_name text,
  _action text,
  _record_count integer DEFAULT NULL,
  _filters jsonb DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN; -- skip anon / system calls
  END IF;

  SELECT NULLIF(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    INTO _name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.sensitive_table_access_log
    (table_name, action, accessed_by, accessed_by_name, record_count, filters, reason)
  VALUES
    (_table_name, _action, auth.uid(), _name, _record_count, _filters, _reason);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_sensitive_access failed: %', SQLERRM;
END;
$$;

-- 3. Wrapped read RPC for attendance_report_recipients (logs every list).
CREATE OR REPLACE FUNCTION public.read_attendance_report_recipients(_reason text DEFAULT NULL)
RETURNS SETOF public.attendance_report_recipients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _rows public.attendance_report_recipients[];
  _count integer;
BEGIN
  IF NOT (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'oic'::app_role)
    OR has_role(auth.uid(),'2ic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorised to view attendance report recipients';
  END IF;

  SELECT array_agg(t ORDER BY t.period, t.email) INTO _rows
  FROM public.attendance_report_recipients t;

  _count := COALESCE(array_length(_rows,1), 0);
  PERFORM public.log_sensitive_access(
    'attendance_report_recipients', 'list', _count, NULL, _reason
  );

  IF _count > 0 THEN
    RETURN QUERY SELECT * FROM unnest(_rows);
  END IF;
  RETURN;
END;
$$;

-- 4. Convenience: small set of RPCs for other sensitive lookups so the
--    UI can switch to logged reads incrementally. We expose only one for
--    failed_login_attempts (admin-only) which is the most sensitive.
CREATE OR REPLACE FUNCTION public.read_failed_login_attempts(_limit integer DEFAULT 200, _reason text DEFAULT NULL)
RETURNS SETOF public.failed_login_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count integer;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins may view failed login attempts';
  END IF;

  PERFORM public.log_sensitive_access(
    'failed_login_attempts', 'list', LEAST(_limit, 1000), jsonb_build_object('limit', _limit), _reason
  );

  RETURN QUERY
    SELECT * FROM public.failed_login_attempts
    ORDER BY attempted_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 1000));
END;
$$;

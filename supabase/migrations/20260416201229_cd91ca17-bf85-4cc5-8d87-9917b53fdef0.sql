-- Failed login attempts tracking table
CREATE TABLE public.failed_login_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id text NOT NULL,
  attempted_at timestamp with time zone NOT NULL DEFAULT now(),
  ip_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_failed_login_staff_id ON public.failed_login_attempts(staff_id, attempted_at DESC);

ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage
CREATE POLICY "Admins can manage failed login attempts"
ON public.failed_login_attempts FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Record a failed login attempt (callable by anon since user is not authenticated yet)
CREATE OR REPLACE FUNCTION public.record_failed_login(_staff_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recent_count integer;
  _is_locked boolean;
BEGIN
  -- Insert the failed attempt
  INSERT INTO public.failed_login_attempts (staff_id) VALUES (_staff_id);

  -- Count failed attempts in the last 60 seconds
  SELECT COUNT(*) INTO _recent_count
  FROM public.failed_login_attempts
  WHERE staff_id = _staff_id
    AND attempted_at > (now() - interval '60 seconds');

  _is_locked := _recent_count >= 5;

  RETURN jsonb_build_object(
    'attempts', _recent_count,
    'locked', _is_locked,
    'remaining', GREATEST(0, 5 - _recent_count)
  );
END;
$$;

-- Check if a staff id is currently locked
CREATE OR REPLACE FUNCTION public.is_staff_locked(_staff_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- 5+ failed attempts in last 60 seconds
    (SELECT COUNT(*) FROM public.failed_login_attempts
     WHERE staff_id = _staff_id
       AND attempted_at > (now() - interval '60 seconds')) >= 5
  ) OR (
    -- Manually locked via profiles.account_locked
    EXISTS (SELECT 1 FROM public.profiles WHERE staff_id = _staff_id AND account_locked = true)
  );
$$;

-- Clear a successful login's attempts (called after successful auth)
CREATE OR REPLACE FUNCTION public.clear_failed_login_attempts(_staff_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.failed_login_attempts WHERE staff_id = _staff_id;
$$;

-- Admin: reset failed attempts for a staff id
CREATE OR REPLACE FUNCTION public.admin_reset_failed_attempts(_staff_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reset failed login attempts';
  END IF;
  DELETE FROM public.failed_login_attempts WHERE staff_id = _staff_id;
END;
$$;

-- Grant execute on the public-facing functions
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_locked(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_failed_login_attempts(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_failed_attempts(text) TO authenticated;
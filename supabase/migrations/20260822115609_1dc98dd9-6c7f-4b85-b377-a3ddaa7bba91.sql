-- 1. Policy columns on the singleton settings row
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS lockout_threshold integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS lockout_window_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS lockout_auto_unlock_minutes integer,
  ADD COLUMN IF NOT EXISTS password_require_upper boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_require_lower boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_require_number boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_require_symbol boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_min_strength integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS session_absolute_hours integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_concurrent_sessions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mfa_grace_days integer NOT NULL DEFAULT 0;

-- Range guards (immutable, safe as CHECK constraints)
DO $$
BEGIN
  ALTER TABLE public.app_settings
    ADD CONSTRAINT app_settings_policy_ranges CHECK (
      lockout_threshold BETWEEN 1 AND 20
      AND lockout_window_minutes BETWEEN 1 AND 1440
      AND (lockout_auto_unlock_minutes IS NULL OR lockout_auto_unlock_minutes BETWEEN 1 AND 10080)
      AND password_min_strength BETWEEN 1 AND 5
      AND min_password_length BETWEEN 6 AND 64
      AND session_absolute_hours BETWEEN 0 AND 168
      AND max_concurrent_sessions BETWEEN 0 AND 20
      AND mfa_grace_days BETWEEN 0 AND 90
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Internal policy reader
CREATE OR REPLACE FUNCTION public.access_policy()
RETURNS public.app_settings
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.app_settings ORDER BY created_at LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.access_policy() FROM PUBLIC, anon, authenticated;

-- 3. Lockout state now driven by the policy row
CREATE OR REPLACE FUNCTION public.is_staff_locked(_staff_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p public.app_settings;
  v_recent integer;
  v_flagged boolean;
BEGIN
  p := public.access_policy();

  SELECT COUNT(*) INTO v_recent
  FROM public.failed_login_attempts
  WHERE staff_id = _staff_id
    AND attempted_at > (now() - make_interval(mins => COALESCE(p.lockout_window_minutes, 15)));

  SELECT COALESCE(account_locked, false) INTO v_flagged
  FROM public.profiles WHERE staff_id = _staff_id;

  -- When an automatic unlock delay is configured, a persisted lock expires
  -- once no failed attempt has been seen for that long.
  IF COALESCE(v_flagged, false) AND p.lockout_auto_unlock_minutes IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.failed_login_attempts
      WHERE staff_id = _staff_id
        AND attempted_at > (now() - make_interval(mins => p.lockout_auto_unlock_minutes))
    ) THEN
      v_flagged := false;
    END IF;
  END IF;

  RETURN (v_recent >= COALESCE(p.lockout_threshold, 3)) OR COALESCE(v_flagged, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_failed_login(_staff_id text, _ip_address text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p public.app_settings;
  v_recent integer;
  v_locked boolean;
  v_threshold integer;
BEGIN
  p := public.access_policy();
  v_threshold := COALESCE(p.lockout_threshold, 3);

  INSERT INTO public.failed_login_attempts (staff_id, ip_address)
  VALUES (_staff_id, _ip_address);

  SELECT COUNT(*) INTO v_recent
  FROM public.failed_login_attempts
  WHERE staff_id = _staff_id
    AND attempted_at > (now() - make_interval(mins => COALESCE(p.lockout_window_minutes, 15)));

  v_locked := v_recent >= v_threshold;

  IF v_locked THEN
    BEGIN
      UPDATE public.profiles
         SET account_locked = true,
             login_enabled  = false
       WHERE staff_id = _staff_id
         AND account_locked IS DISTINCT FROM true;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not persist account_locked for %: %', _staff_id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'attempts',  v_recent,
    'locked',    v_locked,
    'remaining', GREATEST(0, v_threshold - v_recent),
    'threshold', v_threshold,
    'window_minutes', COALESCE(p.lockout_window_minutes, 15),
    'auto_unlock_minutes', p.lockout_auto_unlock_minutes
  );
END;
$$;

-- Legacy single-argument variant delegates to the policy-aware version
CREATE OR REPLACE FUNCTION public.record_failed_login(_staff_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.record_failed_login(_staff_id, NULL::text);
$$;

-- 4. Server-side password policy validation
CREATE OR REPLACE FUNCTION public.validate_password_policy(_password text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p public.app_settings;
  v_errors text[] := ARRAY[]::text[];
  v_score integer := 0;
  v_pw text := COALESCE(_password, '');
BEGIN
  p := public.access_policy();

  IF length(v_pw) < COALESCE(p.min_password_length, 8) THEN
    v_errors := v_errors || format('Must be at least %s characters long', COALESCE(p.min_password_length, 8));
  END IF;
  IF p.password_require_upper AND v_pw !~ '[A-Z]' THEN
    v_errors := v_errors || 'Must include an uppercase letter';
  END IF;
  IF p.password_require_lower AND v_pw !~ '[a-z]' THEN
    v_errors := v_errors || 'Must include a lowercase letter';
  END IF;
  IF p.password_require_number AND v_pw !~ '[0-9]' THEN
    v_errors := v_errors || 'Must include a number';
  END IF;
  IF p.password_require_symbol AND v_pw !~ '[^A-Za-z0-9]' THEN
    v_errors := v_errors || 'Must include a symbol';
  END IF;

  -- Mirrors the client strength meter (0-5)
  IF length(v_pw) >= 8 THEN v_score := v_score + 1; END IF;
  IF length(v_pw) >= 12 THEN v_score := v_score + 1; END IF;
  IF v_pw ~ '[a-z]' AND v_pw ~ '[A-Z]' THEN v_score := v_score + 1; END IF;
  IF v_pw ~ '[0-9]' THEN v_score := v_score + 1; END IF;
  IF v_pw ~ '[^A-Za-z0-9]' THEN v_score := v_score + 1; END IF;

  IF v_score < COALESCE(p.password_min_strength, 4) THEN
    v_errors := v_errors || format('Password strength is too low (needs %s of 5)', COALESCE(p.password_min_strength, 4));
  END IF;

  RETURN jsonb_build_object(
    'ok', cardinality(v_errors) = 0,
    'score', v_score,
    'errors', to_jsonb(v_errors)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_password_policy(text) TO authenticated;

-- 5. Concurrent-device cap enforced when a session registers
CREATE OR REPLACE FUNCTION public.register_session(_session_key text, _fingerprint text DEFAULT NULL::text, _user_agent text DEFAULT NULL::text, _ip text DEFAULT NULL::text, _page text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_new boolean := false;
  v_cap integer;
  v_trimmed integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _session_key IS NULL OR length(trim(_session_key)) = 0 THEN
    RAISE EXCEPTION 'Session key required';
  END IF;

  SELECT id INTO v_id FROM public.user_sessions
  WHERE session_key = _session_key AND user_id = v_uid;

  IF v_id IS NULL THEN
    INSERT INTO public.user_sessions (
      user_id, session_key, device_fingerprint, user_agent, ip_address, current_page
    ) VALUES (v_uid, _session_key, _fingerprint, _user_agent, _ip, _page)
    RETURNING id INTO v_id;
    v_new := true;
  ELSE
    UPDATE public.user_sessions
    SET last_seen_at = now(),
        current_page = COALESCE(_page, current_page),
        ip_address = COALESCE(_ip, ip_address),
        user_agent = COALESCE(_user_agent, user_agent),
        device_fingerprint = COALESCE(_fingerprint, device_fingerprint),
        revoked_at = revoked_at
    WHERE id = v_id;
  END IF;

  IF v_new THEN
    INSERT INTO public.session_action_audit (
      action, actor_id, target_user_id, session_id, reason, ip_address, user_agent, device_fingerprint
    ) VALUES ('session_start', v_uid, v_uid, v_id, NULL, _ip, _user_agent, _fingerprint);
  END IF;

  -- Enforce the configured simultaneous-device cap (0 = unlimited) by
  -- revoking the oldest active sessions beyond the cap.
  SELECT COALESCE(max_concurrent_sessions, 0) INTO v_cap FROM public.access_policy();

  IF v_cap > 0 THEN
    WITH ranked AS (
      SELECT id, row_number() OVER (ORDER BY last_seen_at DESC, started_at DESC) AS rn
      FROM public.user_sessions
      WHERE user_id = v_uid AND revoked_at IS NULL
    ), doomed AS (
      UPDATE public.user_sessions s
         SET revoked_at = now(),
             revoke_reason = 'Simultaneous device limit reached'
        FROM ranked r
       WHERE s.id = r.id AND r.rn > v_cap
      RETURNING s.id
    )
    SELECT count(*) INTO v_trimmed FROM doomed;

    IF v_trimmed > 0 THEN
      INSERT INTO public.session_action_audit (
        action, actor_id, target_user_id, session_id, sessions_affected, reason
      ) VALUES ('session_limit_enforced', v_uid, v_uid, v_id, v_trimmed,
                format('Simultaneous device limit of %s reached', v_cap));
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

-- 6. Absolute session lifetime enforced on heartbeat
CREATE OR REPLACE FUNCTION public.session_heartbeat(_session_key text, _page text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_revoked timestamptz;
  v_started timestamptz;
  v_id uuid;
  v_hours integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.user_sessions
  SET last_seen_at = now(),
      current_page = COALESCE(_page, current_page)
  WHERE session_key = _session_key AND user_id = v_uid AND revoked_at IS NULL;

  SELECT id, revoked_at, started_at INTO v_id, v_revoked, v_started
  FROM public.user_sessions
  WHERE session_key = _session_key AND user_id = v_uid;

  IF v_revoked IS NOT NULL THEN
    RETURN true;
  END IF;

  SELECT COALESCE(session_absolute_hours, 0) INTO v_hours FROM public.access_policy();

  IF v_id IS NOT NULL AND v_hours > 0
     AND v_started < (now() - make_interval(hours => v_hours)) THEN
    UPDATE public.user_sessions
       SET revoked_at = now(),
           revoke_reason = 'Maximum session length reached'
     WHERE id = v_id;

    INSERT INTO public.session_action_audit (
      action, actor_id, target_user_id, session_id, sessions_affected, reason
    ) VALUES ('session_expired', v_uid, v_uid, v_id, 1,
              format('Maximum session length of %s hour(s) reached', v_hours));

    RETURN true;
  END IF;

  RETURN false;
END;
$$;
-- 1) Lockout event ledger -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_lockout_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id text NOT NULL,
  profile_id uuid,
  full_name text,
  attempts integer NOT NULL DEFAULT 0,
  threshold integer NOT NULL DEFAULT 0,
  window_minutes integer NOT NULL DEFAULT 0,
  ip_address text,
  locked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_lockout_events_locked_at_idx
  ON public.account_lockout_events (locked_at DESC);

GRANT SELECT ON public.account_lockout_events TO authenticated;
GRANT ALL ON public.account_lockout_events TO service_role;

ALTER TABLE public.account_lockout_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Command tier can view lockout events" ON public.account_lockout_events;
CREATE POLICY "Command tier can view lockout events"
ON public.account_lockout_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.can_manage_sessions(auth.uid()));

CREATE OR REPLACE FUNCTION public.block_lockout_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'account_lockout_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS block_lockout_event_mutation ON public.account_lockout_events;
CREATE TRIGGER block_lockout_event_mutation
BEFORE UPDATE OR DELETE ON public.account_lockout_events
FOR EACH ROW EXECUTE FUNCTION public.block_lockout_event_mutation();

-- 2) record_failed_login writes a lockout event when it flips the lock ----
CREATE OR REPLACE FUNCTION public.record_failed_login(_staff_id text, _ip_address text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.app_settings;
  v_recent integer;
  v_locked boolean;
  v_threshold integer;
  v_was_locked boolean;
  v_profile public.profiles;
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
    SELECT * INTO v_profile FROM public.profiles WHERE staff_id = _staff_id;
    v_was_locked := COALESCE(v_profile.account_locked, false);

    BEGIN
      UPDATE public.profiles
         SET account_locked = true,
             login_enabled  = false
       WHERE staff_id = _staff_id
         AND account_locked IS DISTINCT FROM true;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not persist account_locked for %: %', _staff_id, SQLERRM;
    END;

    IF NOT v_was_locked THEN
      BEGIN
        INSERT INTO public.account_lockout_events (
          staff_id, profile_id, full_name, attempts, threshold, window_minutes, ip_address
        ) VALUES (
          _staff_id,
          v_profile.id,
          NULLIF(trim(COALESCE(v_profile.first_name, '') || ' ' || COALESCE(v_profile.last_name, '')), ''),
          v_recent,
          v_threshold,
          COALESCE(p.lockout_window_minutes, 15),
          _ip_address
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not record lockout event for %: %', _staff_id, SQLERRM;
      END;
    END IF;
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
$function$;

-- 3) Dashboard reporting function ----------------------------------------
CREATE OR REPLACE FUNCTION public.security_policy_dashboard(_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.app_settings;
  v_since timestamptz;
  v_hours integer := GREATEST(1, LEAST(COALESCE(_hours, 24), 8760));
  v_result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.can_manage_sessions(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  p := public.access_policy();
  v_since := now() - make_interval(hours => v_hours);

  SELECT jsonb_build_object(
    'generated_at', now(),
    'hours', v_hours,
    'threshold', COALESCE(p.lockout_threshold, 3),
    'window_minutes', COALESCE(p.lockout_window_minutes, 15),
    'auto_unlock_minutes', p.lockout_auto_unlock_minutes,
    'max_concurrent_sessions', COALESCE(p.max_concurrent_sessions, 0),
    'locked_staff', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'full_name')
      FROM (
        SELECT jsonb_build_object(
          'profile_id', pr.id,
          'staff_id', pr.staff_id,
          'full_name', trim(COALESCE(pr.first_name,'') || ' ' || COALESCE(pr.last_name,'')),
          'account_locked', COALESCE(pr.account_locked,false),
          'login_enabled', COALESCE(pr.login_enabled,true),
          'recent_attempts', (
            SELECT count(*) FROM public.failed_login_attempts f
            WHERE f.staff_id = pr.staff_id
              AND f.attempted_at > now() - make_interval(mins => COALESCE(p.lockout_window_minutes, 15))
          )
        ) AS x
        FROM public.profiles pr
        WHERE COALESCE(pr.account_locked,false) = true OR COALESCE(pr.login_enabled,true) = false
      ) s
    ), '[]'::jsonb),
    'at_risk', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'attempts')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'staff_id', f.staff_id,
          'full_name', NULLIF(trim(COALESCE(pr.first_name,'') || ' ' || COALESCE(pr.last_name,'')), ''),
          'attempts', count(*)::int,
          'remaining', GREATEST(0, COALESCE(p.lockout_threshold,3) - count(*))::int,
          'last_attempt', max(f.attempted_at),
          'last_ip', (array_agg(f.ip_address ORDER BY f.attempted_at DESC))[1]
        ) AS x
        FROM public.failed_login_attempts f
        LEFT JOIN public.profiles pr ON pr.staff_id = f.staff_id
        WHERE f.attempted_at > now() - make_interval(mins => COALESCE(p.lockout_window_minutes, 15))
        GROUP BY f.staff_id, pr.first_name, pr.last_name
      ) s
    ), '[]'::jsonb),
    'recent_lockouts', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'locked_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', e.id,
          'staff_id', e.staff_id,
          'full_name', e.full_name,
          'attempts', e.attempts,
          'threshold', e.threshold,
          'ip_address', e.ip_address,
          'locked_at', e.locked_at
        ) AS x
        FROM public.account_lockout_events e
        WHERE e.locked_at > v_since
        ORDER BY e.locked_at DESC
        LIMIT 100
      ) s
    ), '[]'::jsonb),
    'recent_unlocks', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', a.id,
          'staff_id', a.target_staff_id,
          'full_name', a.target_full_name,
          'unlocked_by', a.unlocked_by_name,
          'reason', a.reason,
          'created_at', a.created_at
        ) AS x
        FROM public.account_unlock_audit a
        WHERE a.created_at > v_since
        ORDER BY a.created_at DESC
        LIMIT 100
      ) s
    ), '[]'::jsonb),
    'session_revocations', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', sa.id,
          'action', sa.action,
          'staff_id', pr.staff_id,
          'full_name', NULLIF(trim(COALESCE(pr.first_name,'') || ' ' || COALESCE(pr.last_name,'')), ''),
          'sessions_affected', COALESCE(sa.sessions_affected, 1),
          'reason', sa.reason,
          'created_at', sa.created_at
        ) AS x
        FROM public.session_action_audit sa
        LEFT JOIN public.profiles pr ON pr.user_id = sa.target_user_id
        WHERE sa.created_at > v_since
          AND sa.action IN ('session_limit_enforced', 'logout_session', 'logout_all')
        ORDER BY sa.created_at DESC
        LIMIT 100
      ) s
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
      'locked', (SELECT count(*) FROM public.profiles pr WHERE COALESCE(pr.account_locked,false) OR COALESCE(pr.login_enabled,true) = false),
      'lockouts', (SELECT count(*) FROM public.account_lockout_events e WHERE e.locked_at > v_since),
      'unlocks', (SELECT count(*) FROM public.account_unlock_audit a WHERE a.created_at > v_since),
      'limit_revocations', (SELECT COALESCE(sum(COALESCE(sessions_affected,1)),0) FROM public.session_action_audit sa WHERE sa.created_at > v_since AND sa.action = 'session_limit_enforced')
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.security_policy_dashboard(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_policy_dashboard(integer) TO authenticated;

-- 4) Tighter MFA policy --------------------------------------------------
UPDATE public.app_settings
   SET mfa_required_roles = ARRAY[
         'admin','oic','2ic','staff_officer','supervisor','command_officer',
         'shift_leader','front_desk','storekeeper','procurement_officer','medical_officer'
       ],
       mfa_grace_days = 7;
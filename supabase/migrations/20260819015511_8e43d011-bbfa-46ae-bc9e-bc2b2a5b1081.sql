-- ============================================================
-- Session management (Admin Console)
-- ============================================================

CREATE TABLE public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  session_key text NOT NULL UNIQUE,
  device_fingerprint text,
  user_agent text,
  ip_address text,
  current_page text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_sessions_user ON public.user_sessions(user_id, last_seen_at DESC);
CREATE INDEX idx_user_sessions_active ON public.user_sessions(last_seen_at DESC) WHERE revoked_at IS NULL;

GRANT SELECT ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sessions"
ON public.user_sessions FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Command tier views all sessions"
ON public.user_sessions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_command_tier(auth.uid()));

CREATE TRIGGER trg_user_sessions_updated_at
BEFORE UPDATE ON public.user_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- audit trail ----------
CREATE TABLE public.session_action_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action text NOT NULL,
  actor_id uuid,
  target_user_id uuid,
  session_id uuid,
  sessions_affected integer NOT NULL DEFAULT 1,
  reason text,
  ip_address text,
  user_agent text,
  device_fingerprint text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_action_audit_created ON public.session_action_audit(created_at DESC);
CREATE INDEX idx_session_action_audit_target ON public.session_action_audit(target_user_id, created_at DESC);

GRANT SELECT ON public.session_action_audit TO authenticated;
GRANT ALL ON public.session_action_audit TO service_role;
ALTER TABLE public.session_action_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier reads session audit"
ON public.session_action_audit FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_command_tier(auth.uid()));

CREATE OR REPLACE FUNCTION public.block_session_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'session_action_audit is append-only';
END;
$$;

CREATE TRIGGER trg_session_audit_immutable
BEFORE UPDATE OR DELETE ON public.session_action_audit
FOR EACH ROW EXECUTE FUNCTION public.block_session_audit_mutation();

-- ---------- authorization helper ----------
CREATE OR REPLACE FUNCTION public.can_manage_sessions(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role) OR public.is_command_tier(_user_id);
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_sessions(uuid) FROM anon;

-- ---------- register / heartbeat ----------
CREATE OR REPLACE FUNCTION public.register_session(
  _session_key text,
  _fingerprint text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _page text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_new boolean := false;
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
        device_fingerprint = COALESCE(_fingerprint, device_fingerprint)
    WHERE id = v_id;
  END IF;

  IF v_new THEN
    INSERT INTO public.session_action_audit (
      action, actor_id, target_user_id, session_id, reason, ip_address, user_agent, device_fingerprint
    ) VALUES ('session_start', v_uid, v_uid, v_id, NULL, _ip, _user_agent, _fingerprint);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_session(text, text, text, text, text) FROM anon;

-- Returns TRUE when the caller's session has been revoked (client must sign out).
CREATE OR REPLACE FUNCTION public.session_heartbeat(
  _session_key text,
  _page text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_revoked timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.user_sessions
  SET last_seen_at = now(),
      current_page = COALESCE(_page, current_page)
  WHERE session_key = _session_key AND user_id = v_uid AND revoked_at IS NULL;

  SELECT revoked_at INTO v_revoked FROM public.user_sessions
  WHERE session_key = _session_key AND user_id = v_uid;

  RETURN v_revoked IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.session_heartbeat(text, text) FROM anon;

-- ---------- revoke single ----------
CREATE OR REPLACE FUNCTION public.revoke_session(_session_id uuid, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.user_sessions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.user_sessions WHERE id = _session_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF v_row.user_id <> v_uid AND NOT public.can_manage_sessions(v_uid) THEN
    RAISE EXCEPTION 'Not authorized to end this session';
  END IF;

  IF v_row.revoked_at IS NOT NULL THEN
    RETURN false;
  END IF;

  UPDATE public.user_sessions
  SET revoked_at = now(), revoked_by = v_uid, revoke_reason = _reason
  WHERE id = _session_id;

  INSERT INTO public.session_action_audit (
    action, actor_id, target_user_id, session_id, sessions_affected, reason,
    ip_address, user_agent, device_fingerprint
  ) VALUES (
    'logout_session', v_uid, v_row.user_id, v_row.id, 1, _reason,
    v_row.ip_address, v_row.user_agent, v_row.device_fingerprint
  );

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_session(uuid, text) FROM anon;

-- ---------- revoke all for a user ----------
CREATE OR REPLACE FUNCTION public.revoke_all_user_sessions(
  _user_id uuid,
  _reason text DEFAULT NULL,
  _keep_session_key text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Target user required';
  END IF;
  IF _user_id <> v_uid AND NOT public.can_manage_sessions(v_uid) THEN
    RAISE EXCEPTION 'Not authorized to end sessions for this user';
  END IF;

  UPDATE public.user_sessions
  SET revoked_at = now(), revoked_by = v_uid, revoke_reason = _reason
  WHERE user_id = _user_id
    AND revoked_at IS NULL
    AND (_keep_session_key IS NULL OR session_key <> _keep_session_key);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.session_action_audit (
    action, actor_id, target_user_id, session_id, sessions_affected, reason, details
  ) VALUES (
    'logout_all', v_uid, _user_id, NULL, v_count, _reason,
    jsonb_build_object('kept_current_session', _keep_session_key IS NOT NULL)
  );

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_all_user_sessions(uuid, text, text) FROM anon;

-- ---------- housekeeping ----------
CREATE OR REPLACE FUNCTION public.prune_stale_sessions(_older_than_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public.can_manage_sessions(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.user_sessions
  WHERE last_seen_at < now() - make_interval(days => GREATEST(_older_than_days, 1));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prune_stale_sessions(integer) FROM anon;
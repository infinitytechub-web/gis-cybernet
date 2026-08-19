-- ============================================================
-- Biometric sign-in (WebAuthn / FIDO2 passkeys)
-- No raw biometric data is ever stored: only device-held public keys.
-- ============================================================

-- 1. Credentials -------------------------------------------------
CREATE TABLE public.webauthn_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  sign_count bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  aaguid text,
  device_label text NOT NULL DEFAULT 'Unknown device',
  backed_up boolean NOT NULL DEFAULT false,
  user_verified boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webauthn_credentials_user ON public.webauthn_credentials (user_id) WHERE revoked_at IS NULL;

GRANT SELECT, UPDATE ON public.webauthn_credentials TO authenticated;
GRANT ALL ON public.webauthn_credentials TO service_role;
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own credentials"
  ON public.webauthn_credentials FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users revoke their own credentials"
  ON public.webauthn_credentials FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_webauthn_credentials_updated_at
  BEFORE UPDATE ON public.webauthn_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Challenges (server-only, short lived) -----------------------
CREATE TABLE public.webauthn_challenges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('register', 'login', 'stepup')),
  user_id uuid,
  staff_id text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webauthn_challenges_challenge ON public.webauthn_challenges (challenge);
CREATE INDEX idx_webauthn_challenges_expiry ON public.webauthn_challenges (expires_at);

GRANT ALL ON public.webauthn_challenges TO service_role;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (edge functions) may touch challenges.

-- 3. Step-up tokens (server-only, single use) --------------------
CREATE TABLE public.webauthn_stepup_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  method text NOT NULL DEFAULT 'biometric',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.webauthn_stepup_tokens TO service_role;
ALTER TABLE public.webauthn_stepup_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role may issue or consume step-up tokens.

-- 4. Audit log (append only) ------------------------------------
CREATE TABLE public.webauthn_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event text NOT NULL CHECK (event IN (
    'enroll', 'authenticate_success', 'authenticate_failure',
    'revoke', 'settings_change', 'stepup_success', 'stepup_failure'
  )),
  user_id uuid,
  staff_id text,
  credential_id text,
  device_label text,
  detail text,
  ip_address text,
  device_fingerprint text,
  user_agent text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webauthn_audit_created ON public.webauthn_audit (created_at DESC);
CREATE INDEX idx_webauthn_audit_user ON public.webauthn_audit (user_id, created_at DESC);

GRANT SELECT ON public.webauthn_audit TO authenticated;
GRANT ALL ON public.webauthn_audit TO service_role;
ALTER TABLE public.webauthn_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier reads biometric audit"
  ON public.webauthn_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_command_tier(auth.uid()));

-- The audit trail is immutable, exactly like security_audit_log.
CREATE OR REPLACE FUNCTION public.block_webauthn_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'The biometric audit trail is append-only and cannot be modified or deleted.';
END;
$$;

CREATE TRIGGER webauthn_audit_immutable
  BEFORE UPDATE OR DELETE ON public.webauthn_audit
  FOR EACH ROW EXECUTE FUNCTION public.block_webauthn_audit_mutation();

-- 5. Per-user preference ---------------------------------------
CREATE TABLE public.webauthn_user_settings (
  user_id uuid NOT NULL PRIMARY KEY,
  biometric_login_enabled boolean NOT NULL DEFAULT true,
  consented_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.webauthn_user_settings TO authenticated;
GRANT ALL ON public.webauthn_user_settings TO service_role;
ALTER TABLE public.webauthn_user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own biometric preference"
  ON public.webauthn_user_settings FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_webauthn_user_settings_updated_at
  BEFORE UPDATE ON public.webauthn_user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Global kill switch ----------------------------------------
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS biometric_login_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS biometric_stepup_required boolean NOT NULL DEFAULT true;

-- 7. Helper RPCs -----------------------------------------------

-- Log a biometric event (used by the client for local outcomes; edge
-- functions write directly with the service role).
CREATE OR REPLACE FUNCTION public.webauthn_log_event(
  _event text,
  _detail text DEFAULT NULL,
  _credential_id text DEFAULT NULL,
  _device_label text DEFAULT NULL,
  _staff_id text DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _device_fingerprint text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.webauthn_audit (
    event, user_id, staff_id, credential_id, device_label, detail,
    ip_address, device_fingerprint, user_agent, actor_id
  ) VALUES (
    _event, auth.uid(), _staff_id, _credential_id, _device_label, _detail,
    _ip_address, _device_fingerprint, _user_agent, auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.webauthn_log_event(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_log_event(text, text, text, text, text, text, text, text) TO authenticated, service_role;

-- List the caller's own enrolled devices.
CREATE OR REPLACE FUNCTION public.webauthn_list_my_credentials()
RETURNS TABLE (
  id uuid,
  device_label text,
  backed_up boolean,
  last_used_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.device_label, c.backed_up, c.last_used_at, c.created_at
  FROM public.webauthn_credentials c
  WHERE c.user_id = auth.uid() AND c.revoked_at IS NULL
  ORDER BY c.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.webauthn_list_my_credentials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_list_my_credentials() TO authenticated, service_role;

-- Admin view of every enrolled device.
CREATE OR REPLACE FUNCTION public.webauthn_admin_list_credentials()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  full_name text,
  staff_id text,
  device_label text,
  backed_up boolean,
  last_used_at timestamptz,
  created_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators may list biometric credentials.';
  END IF;

  RETURN QUERY
  SELECT c.id, c.user_id, p.full_name, p.staff_id, c.device_label, c.backed_up,
         c.last_used_at, c.created_at, c.revoked_at
  FROM public.webauthn_credentials c
  LEFT JOIN public.profiles p ON p.user_id = c.user_id
  ORDER BY c.revoked_at NULLS FIRST, c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.webauthn_admin_list_credentials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_admin_list_credentials() TO authenticated, service_role;

-- Revoke a credential: owner or administrator, always audited.
CREATE OR REPLACE FUNCTION public.webauthn_revoke_credential(_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cred public.webauthn_credentials;
BEGIN
  SELECT * INTO _cred FROM public.webauthn_credentials WHERE id = _id;
  IF _cred.id IS NULL THEN
    RAISE EXCEPTION 'Credential not found.';
  END IF;

  IF _cred.user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'You may only revoke your own biometric credentials.';
  END IF;

  UPDATE public.webauthn_credentials
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE id = _id AND revoked_at IS NULL;

  INSERT INTO public.webauthn_audit (event, user_id, credential_id, device_label, detail, actor_id)
  VALUES ('revoke', _cred.user_id, _cred.credential_id, _cred.device_label,
          COALESCE(_reason, 'Credential revoked'), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.webauthn_revoke_credential(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_revoke_credential(uuid, text) TO authenticated, service_role;

-- Turn biometric sign-in on or off for the caller's own account.
CREATE OR REPLACE FUNCTION public.webauthn_set_enabled(_enabled boolean, _consent boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  INSERT INTO public.webauthn_user_settings (user_id, biometric_login_enabled, consented_at)
  VALUES (auth.uid(), _enabled, CASE WHEN _consent THEN now() ELSE NULL END)
  ON CONFLICT (user_id) DO UPDATE
    SET biometric_login_enabled = EXCLUDED.biometric_login_enabled,
        consented_at = COALESCE(public.webauthn_user_settings.consented_at, EXCLUDED.consented_at),
        updated_at = now();

  INSERT INTO public.webauthn_audit (event, user_id, detail, actor_id)
  VALUES ('settings_change', auth.uid(),
          CASE WHEN _enabled THEN 'Biometric sign-in enabled' ELSE 'Biometric sign-in disabled' END,
          auth.uid());

  RETURN _enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.webauthn_set_enabled(boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_set_enabled(boolean, boolean) TO authenticated, service_role;

-- Caller's own biometric state (preference + device count + global switch).
CREATE OR REPLACE FUNCTION public.webauthn_my_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'enabled', COALESCE((SELECT s.biometric_login_enabled FROM public.webauthn_user_settings s WHERE s.user_id = auth.uid()), false),
    'consented_at', (SELECT s.consented_at FROM public.webauthn_user_settings s WHERE s.user_id = auth.uid()),
    'device_count', (SELECT count(*) FROM public.webauthn_credentials c WHERE c.user_id = auth.uid() AND c.revoked_at IS NULL),
    'globally_enabled', COALESCE((SELECT a.biometric_login_enabled FROM public.app_settings a LIMIT 1), true),
    'stepup_required', COALESCE((SELECT a.biometric_stepup_required FROM public.app_settings a LIMIT 1), true)
  );
$$;

REVOKE ALL ON FUNCTION public.webauthn_my_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_my_status() TO authenticated, service_role;

-- Consume a step-up token: single use, bound to caller + action.
CREATE OR REPLACE FUNCTION public.webauthn_consume_stepup(_token_hash text, _action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.webauthn_stepup_tokens;
BEGIN
  SELECT * INTO _row
  FROM public.webauthn_stepup_tokens
  WHERE token_hash = _token_hash
    AND user_id = auth.uid()
    AND action = _action
    AND consumed_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF _row.id IS NULL THEN
    INSERT INTO public.webauthn_audit (event, user_id, detail, actor_id)
    VALUES ('stepup_failure', auth.uid(), 'Invalid or expired step-up confirmation for ' || _action, auth.uid());
    RETURN false;
  END IF;

  UPDATE public.webauthn_stepup_tokens SET consumed_at = now() WHERE id = _row.id;

  INSERT INTO public.webauthn_audit (event, user_id, detail, actor_id)
  VALUES ('stepup_success', auth.uid(), 'Step-up confirmed (' || _row.method || ') for ' || _action, auth.uid());

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.webauthn_consume_stepup(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_consume_stepup(text, text) TO authenticated, service_role;

-- Housekeeping: drop stale challenges and tokens.
CREATE OR REPLACE FUNCTION public.webauthn_prune_expired()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
BEGIN
  DELETE FROM public.webauthn_challenges WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS _n = ROW_COUNT;
  DELETE FROM public.webauthn_stepup_tokens WHERE expires_at < now() - interval '1 hour';
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.webauthn_prune_expired() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_prune_expired() TO service_role;
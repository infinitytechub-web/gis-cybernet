-- 1. Per-destination signing secret (write-only)
ALTER TABLE public.security_monitor_webhooks
  ADD COLUMN IF NOT EXISTS signing_secret text,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5;

-- 2. Delivery queue / dead-letter table
CREATE TABLE public.security_webhook_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id uuid NOT NULL REFERENCES public.security_monitor_webhooks(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  alert_count integer NOT NULL DEFAULT 0,
  top_severity text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  last_status text,
  last_error text,
  delivered_at timestamptz,
  dead_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.security_webhook_deliveries TO service_role;
ALTER TABLE public.security_webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to webhook deliveries"
  ON public.security_webhook_deliveries FOR SELECT
  USING (false);

CREATE INDEX idx_security_webhook_deliveries_due
  ON public.security_webhook_deliveries (status, next_attempt_at);

CREATE TRIGGER update_security_webhook_deliveries_updated_at
  BEFORE UPDATE ON public.security_webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Masked listing now reports whether a signing secret is configured
DROP FUNCTION IF EXISTS public.security_monitor_webhooks_list();

CREATE OR REPLACE FUNCTION public.security_monitor_webhooks_list()
RETURNS TABLE (
  id uuid, label text, kind text, url_preview text, min_severity text,
  throttle_minutes integer, enabled boolean, last_sent_at timestamptz,
  last_status text, last_error text, created_at timestamptz,
  has_signing_secret boolean, max_attempts integer,
  pending_deliveries integer, dead_deliveries integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT w.id, w.label, w.kind,
         CASE WHEN length(w.url) <= 24 THEN '••••'
              ELSE left(w.url, 18) || '••••' || right(w.url, 4) END,
         w.min_severity, w.throttle_minutes, w.enabled, w.last_sent_at,
         w.last_status, w.last_error, w.created_at,
         (w.signing_secret IS NOT NULL AND length(w.signing_secret) > 0),
         w.max_attempts,
         (SELECT count(*)::int FROM public.security_webhook_deliveries d
           WHERE d.webhook_id = w.id AND d.status IN ('pending', 'in_flight')),
         (SELECT count(*)::int FROM public.security_webhook_deliveries d
           WHERE d.webhook_id = w.id AND d.status = 'dead')
  FROM public.security_monitor_webhooks w
  ORDER BY w.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.security_monitor_webhooks_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_monitor_webhooks_list() TO authenticated, service_role;

-- 4. Save now accepts an optional signing secret and retry limit
DROP FUNCTION IF EXISTS public.security_monitor_webhook_save(uuid, text, text, text, text, integer, boolean);

CREATE OR REPLACE FUNCTION public.security_monitor_webhook_save(
  _id uuid,
  _label text,
  _kind text,
  _url text,
  _min_severity text,
  _throttle_minutes integer,
  _enabled boolean,
  _signing_secret text DEFAULT NULL,
  _clear_signing_secret boolean DEFAULT false,
  _max_attempts integer DEFAULT 5
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _kind NOT IN ('slack', 'generic') THEN
    RAISE EXCEPTION 'Unsupported webhook kind';
  END IF;
  IF _min_severity NOT IN ('medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Unsupported severity';
  END IF;
  IF _url IS NOT NULL AND _url !~* '^https://' THEN
    RAISE EXCEPTION 'Webhook URL must use https';
  END IF;
  IF _signing_secret IS NOT NULL AND length(trim(_signing_secret)) > 0 AND length(trim(_signing_secret)) < 16 THEN
    RAISE EXCEPTION 'Signing secret must be at least 16 characters';
  END IF;

  IF _id IS NULL THEN
    IF _url IS NULL OR length(trim(_url)) = 0 THEN
      RAISE EXCEPTION 'Webhook URL is required';
    END IF;
    INSERT INTO public.security_monitor_webhooks
      (label, kind, url, min_severity, throttle_minutes, enabled, created_by, signing_secret, max_attempts)
    VALUES (_label, _kind, trim(_url), _min_severity, greatest(coalesce(_throttle_minutes, 15), 0),
            coalesce(_enabled, true), auth.uid(),
            NULLIF(trim(coalesce(_signing_secret, '')), ''),
            least(greatest(coalesce(_max_attempts, 5), 1), 10))
    RETURNING id INTO new_id;
  ELSE
    UPDATE public.security_monitor_webhooks
       SET label = _label,
           kind = _kind,
           url = CASE WHEN _url IS NULL OR length(trim(_url)) = 0 THEN url ELSE trim(_url) END,
           min_severity = _min_severity,
           throttle_minutes = greatest(coalesce(_throttle_minutes, 15), 0),
           enabled = coalesce(_enabled, true),
           max_attempts = least(greatest(coalesce(_max_attempts, 5), 1), 10),
           signing_secret = CASE
             WHEN coalesce(_clear_signing_secret, false) THEN NULL
             WHEN _signing_secret IS NULL OR length(trim(_signing_secret)) = 0 THEN signing_secret
             ELSE trim(_signing_secret) END
     WHERE id = _id
     RETURNING id INTO new_id;
    IF new_id IS NULL THEN
      RAISE EXCEPTION 'Webhook not found';
    END IF;
  END IF;

  INSERT INTO public.security_audit_log (category, action, severity, actor_id, subject, details)
  VALUES ('configuration', 'security_monitor_webhook_saved', 'medium', auth.uid(), _label,
          jsonb_build_object('kind', _kind, 'min_severity', _min_severity,
                             'enabled', coalesce(_enabled, true),
                             'signing_secret_changed', (_signing_secret IS NOT NULL AND length(trim(_signing_secret)) > 0) OR coalesce(_clear_signing_secret, false)));

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.security_monitor_webhook_save(uuid, text, text, text, text, integer, boolean, text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_monitor_webhook_save(uuid, text, text, text, text, integer, boolean, text, boolean, integer) TO authenticated, service_role;

-- 5. Queue plumbing for the background delivery job (service role only)
CREATE OR REPLACE FUNCTION public.security_webhook_claim_deliveries(_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid, webhook_id uuid, url text, kind text, signing_secret text,
  payload jsonb, attempts integer, max_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT d.id
    FROM public.security_webhook_deliveries d
    WHERE (d.status = 'pending' AND d.next_attempt_at <= now())
       OR (d.status = 'in_flight' AND d.lease_until < now())
    ORDER BY d.next_attempt_at
    LIMIT least(greatest(coalesce(_limit, 20), 1), 50)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.security_webhook_deliveries d
       SET status = 'in_flight',
           lease_until = now() + interval '2 minutes',
           attempts = d.attempts + 1
     WHERE d.id IN (SELECT due.id FROM due)
    RETURNING d.id, d.webhook_id, d.payload, d.attempts
  )
  SELECT c.id, c.webhook_id, w.url, w.kind, w.signing_secret, c.payload, c.attempts, w.max_attempts
  FROM claimed c
  JOIN public.security_monitor_webhooks w ON w.id = c.webhook_id;
END;
$$;

REVOKE ALL ON FUNCTION public.security_webhook_claim_deliveries(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_webhook_claim_deliveries(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.security_webhook_settle_delivery(
  _id uuid,
  _ok boolean,
  _status text,
  _error text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.security_webhook_deliveries;
  cap integer;
  delay_seconds integer;
  outcome text;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO d FROM public.security_webhook_deliveries WHERE id = _id;
  IF d.id IS NULL THEN
    RETURN 'missing';
  END IF;

  SELECT w.max_attempts INTO cap FROM public.security_monitor_webhooks w WHERE w.id = d.webhook_id;
  cap := coalesce(cap, 5);

  IF _ok THEN
    UPDATE public.security_webhook_deliveries
       SET status = 'delivered', delivered_at = now(), lease_until = NULL,
           last_status = _status, last_error = NULL
     WHERE id = _id;
    UPDATE public.security_monitor_webhooks
       SET last_sent_at = now(), last_status = coalesce(_status, 'ok'), last_error = NULL
     WHERE id = d.webhook_id;
    RETURN 'delivered';
  END IF;

  IF d.attempts >= cap THEN
    UPDATE public.security_webhook_deliveries
       SET status = 'dead', dead_at = now(), lease_until = NULL,
           last_status = _status, last_error = left(coalesce(_error, ''), 500)
     WHERE id = _id;
    outcome := 'dead';

    INSERT INTO public.security_audit_log (category, action, severity, subject, details)
    VALUES ('security', 'security_webhook_delivery_dead_lettered', 'high', d.webhook_id::text,
            jsonb_build_object('delivery_id', _id, 'attempts', d.attempts, 'last_status', _status));
  ELSE
    -- exponential backoff: 30s, 60s, 120s, 240s ... capped at 30 minutes, with jitter
    delay_seconds := least(30 * power(2, greatest(d.attempts - 1, 0))::integer, 1800);
    delay_seconds := delay_seconds + floor(random() * greatest(delay_seconds / 4, 1))::integer;
    UPDATE public.security_webhook_deliveries
       SET status = 'pending', lease_until = NULL,
           next_attempt_at = now() + make_interval(secs => delay_seconds),
           last_status = _status, last_error = left(coalesce(_error, ''), 500)
     WHERE id = _id;
    outcome := 'retry';
  END IF;

  UPDATE public.security_monitor_webhooks
     SET last_status = coalesce(_status, 'error'), last_error = left(coalesce(_error, ''), 300)
   WHERE id = d.webhook_id;

  RETURN outcome;
END;
$$;

REVOKE ALL ON FUNCTION public.security_webhook_settle_delivery(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_webhook_settle_delivery(uuid, boolean, text, text) TO service_role;

-- 6. Admin visibility + manual requeue / discard
CREATE OR REPLACE FUNCTION public.security_webhook_deliveries_list(
  _status text DEFAULT NULL,
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid, webhook_id uuid, webhook_label text, status text, attempts integer,
  max_attempts integer, alert_count integer, top_severity text,
  next_attempt_at timestamptz, last_status text, last_error text,
  delivered_at timestamptz, dead_at timestamptz, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT d.id, d.webhook_id, w.label, d.status, d.attempts, w.max_attempts,
         d.alert_count, d.top_severity, d.next_attempt_at, d.last_status,
         left(coalesce(d.last_error, ''), 300), d.delivered_at, d.dead_at, d.created_at
  FROM public.security_webhook_deliveries d
  JOIN public.security_monitor_webhooks w ON w.id = d.webhook_id
  WHERE _status IS NULL OR _status = 'all' OR d.status = _status
  ORDER BY d.created_at DESC
  LIMIT least(greatest(coalesce(_limit, 100), 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION public.security_webhook_deliveries_list(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_webhook_deliveries_list(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.security_webhook_delivery_action(_id uuid, _action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _action = 'requeue' THEN
    UPDATE public.security_webhook_deliveries
       SET status = 'pending', attempts = 0, next_attempt_at = now(),
           lease_until = NULL, dead_at = NULL, last_error = NULL
     WHERE id = _id AND status IN ('dead', 'pending', 'in_flight');
  ELSIF _action = 'discard' THEN
    DELETE FROM public.security_webhook_deliveries WHERE id = _id AND status <> 'in_flight';
  ELSE
    RAISE EXCEPTION 'Unsupported action';
  END IF;

  INSERT INTO public.security_audit_log (category, action, severity, actor_id, subject, details)
  VALUES ('configuration', 'security_webhook_delivery_' || _action, 'medium', auth.uid(), _id::text, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.security_webhook_delivery_action(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_webhook_delivery_action(uuid, text) TO authenticated, service_role;
-- 1. Webhook destinations (URL never exposed to clients)
CREATE TABLE public.security_monitor_webhooks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'slack',
  url text NOT NULL,
  min_severity text NOT NULL DEFAULT 'high',
  throttle_minutes integer NOT NULL DEFAULT 15,
  enabled boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  last_status text,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.security_monitor_webhooks TO service_role;
ALTER TABLE public.security_monitor_webhooks ENABLE ROW LEVEL SECURITY;

-- No direct client access at all: reads/writes go through the RPCs below.
CREATE POLICY "No direct access to security monitor webhooks"
  ON public.security_monitor_webhooks FOR SELECT
  USING (false);

CREATE TRIGGER update_security_monitor_webhooks_updated_at
  BEFORE UPDATE ON public.security_monitor_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Masked listing (admin tier only)
CREATE OR REPLACE FUNCTION public.security_monitor_webhooks_list()
RETURNS TABLE (
  id uuid, label text, kind text, url_preview text, min_severity text,
  throttle_minutes integer, enabled boolean, last_sent_at timestamptz,
  last_status text, last_error text, created_at timestamptz
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
         w.last_status, w.last_error, w.created_at
  FROM public.security_monitor_webhooks w
  ORDER BY w.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.security_monitor_webhooks_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_monitor_webhooks_list() TO authenticated, service_role;

-- 3. Create / update (admin only). Passing NULL url on update keeps the stored URL.
CREATE OR REPLACE FUNCTION public.security_monitor_webhook_save(
  _id uuid,
  _label text,
  _kind text,
  _url text,
  _min_severity text,
  _throttle_minutes integer,
  _enabled boolean
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

  IF _id IS NULL THEN
    IF _url IS NULL OR length(trim(_url)) = 0 THEN
      RAISE EXCEPTION 'Webhook URL is required';
    END IF;
    INSERT INTO public.security_monitor_webhooks
      (label, kind, url, min_severity, throttle_minutes, enabled, created_by)
    VALUES (_label, _kind, trim(_url), _min_severity, greatest(coalesce(_throttle_minutes, 15), 0), coalesce(_enabled, true), auth.uid())
    RETURNING id INTO new_id;
  ELSE
    UPDATE public.security_monitor_webhooks
       SET label = _label,
           kind = _kind,
           url = CASE WHEN _url IS NULL OR length(trim(_url)) = 0 THEN url ELSE trim(_url) END,
           min_severity = _min_severity,
           throttle_minutes = greatest(coalesce(_throttle_minutes, 15), 0),
           enabled = coalesce(_enabled, true)
     WHERE id = _id
     RETURNING id INTO new_id;
    IF new_id IS NULL THEN
      RAISE EXCEPTION 'Webhook not found';
    END IF;
  END IF;

  INSERT INTO public.security_audit_log (category, action, severity, actor_id, subject, details)
  VALUES ('configuration', 'security_monitor_webhook_saved', 'medium', auth.uid(), _label,
          jsonb_build_object('kind', _kind, 'min_severity', _min_severity, 'enabled', coalesce(_enabled, true)));

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.security_monitor_webhook_save(uuid, text, text, text, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_monitor_webhook_save(uuid, text, text, text, text, integer, boolean) TO authenticated, service_role;

-- 4. Delete (admin only)
CREATE OR REPLACE FUNCTION public.security_monitor_webhook_delete(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lbl text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.security_monitor_webhooks WHERE id = _id RETURNING label INTO lbl;
  IF lbl IS NOT NULL THEN
    INSERT INTO public.security_audit_log (category, action, severity, actor_id, subject, details)
    VALUES ('configuration', 'security_monitor_webhook_deleted', 'medium', auth.uid(), lbl, '{}'::jsonb);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.security_monitor_webhook_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_monitor_webhook_delete(uuid) TO authenticated, service_role;

-- 5. Real-time streaming of alerts
ALTER TABLE public.security_monitor_alerts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.security_monitor_alerts;
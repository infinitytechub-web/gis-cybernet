-- 1. Settings (singleton)
CREATE TABLE public.security_monitor_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  email_alerts boolean NOT NULL DEFAULT true,
  role_change_window_minutes integer NOT NULL DEFAULT 60,
  role_change_threshold integer NOT NULL DEFAULT 3,
  authz_failure_window_minutes integer NOT NULL DEFAULT 15,
  authz_failure_threshold integer NOT NULL DEFAULT 5,
  upload_access_window_minutes integer NOT NULL DEFAULT 30,
  upload_access_threshold integer NOT NULL DEFAULT 15,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.security_monitor_settings TO authenticated;
GRANT ALL ON public.security_monitor_settings TO service_role;
ALTER TABLE public.security_monitor_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin tier reads monitor settings"
  ON public.security_monitor_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic'));

CREATE POLICY "Admins manage monitor settings"
  ON public.security_monitor_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_security_monitor_settings_updated_at
  BEFORE UPDATE ON public.security_monitor_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.security_monitor_settings (enabled) VALUES (true);

-- 2. Detections
CREATE TABLE public.security_monitor_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_key text NOT NULL,
  severity text NOT NULL DEFAULT 'high',
  subject_key text NOT NULL DEFAULT 'unknown',
  subject_user_id uuid,
  subject_label text,
  event_count integer NOT NULL DEFAULT 0,
  threshold integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  acknowledge_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX security_monitor_alerts_dedupe
  ON public.security_monitor_alerts (rule_key, subject_key, window_start);
CREATE INDEX security_monitor_alerts_created_idx
  ON public.security_monitor_alerts (created_at DESC);

GRANT SELECT ON public.security_monitor_alerts TO authenticated;
GRANT ALL ON public.security_monitor_alerts TO service_role;
ALTER TABLE public.security_monitor_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin tier reads monitor alerts"
  ON public.security_monitor_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic'));

-- 3. Scan routine
CREATE OR REPLACE FUNCTION public.security_monitor_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.security_monitor_settings;
  now_ts timestamptz := now();
  inserted integer := 0;
  n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO s FROM public.security_monitor_settings ORDER BY created_at LIMIT 1;
  IF s.id IS NULL OR NOT s.enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'monitoring disabled');
  END IF;

  -- Suspicious role changes: many role grants/revokes by one actor
  WITH w AS (SELECT now_ts - make_interval(mins => s.role_change_window_minutes) AS ws),
  agg AS (
    SELECT a.changed_by AS actor,
           coalesce(max(a.changed_by_name), 'Unknown') AS label,
           count(*)::int AS c,
           jsonb_agg(jsonb_build_object(
             'target', coalesce(a.target_name, a.target_staff_id),
             'action', a.action, 'from_role', a.from_role, 'to_role', a.to_role,
             'at', a.created_at) ORDER BY a.created_at DESC) AS items
    FROM public.command_role_audit a, w
    WHERE a.created_at >= w.ws
    GROUP BY a.changed_by
  )
  INSERT INTO public.security_monitor_alerts
    (rule_key, severity, subject_key, subject_user_id, subject_label, event_count, threshold, window_start, window_end, details)
  SELECT 'role_change_burst',
         CASE WHEN agg.c >= s.role_change_threshold * 2 THEN 'critical' ELSE 'high' END,
         coalesce(agg.actor::text, 'unknown'), agg.actor, agg.label, agg.c, s.role_change_threshold,
         (SELECT ws FROM w), now_ts,
         jsonb_build_object('events', agg.items)
  FROM agg
  WHERE agg.c >= s.role_change_threshold
  ON CONFLICT (rule_key, subject_key, window_start) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;

  -- Authorization failures: denied / unauthorized security audit entries
  WITH w AS (SELECT now_ts - make_interval(mins => s.authz_failure_window_minutes) AS ws),
  agg AS (
    SELECT l.actor_id AS actor,
           coalesce(max(l.actor_label), 'Unknown') AS label,
           count(*)::int AS c,
           jsonb_agg(jsonb_build_object('action', l.action, 'category', l.category,
             'subject', l.subject, 'ip', l.ip_address, 'at', l.created_at) ORDER BY l.created_at DESC) AS items
    FROM public.security_audit_log l, w
    WHERE l.created_at >= w.ws
      AND (l.action ~* '(denied|unauthorized|forbidden|not[_ ]?authorized|permission)'
           OR l.category ~* '(authorization|access_denied)')
    GROUP BY l.actor_id
  )
  INSERT INTO public.security_monitor_alerts
    (rule_key, severity, subject_key, subject_user_id, subject_label, event_count, threshold, window_start, window_end, details)
  SELECT 'authorization_failure_burst',
         CASE WHEN agg.c >= s.authz_failure_threshold * 2 THEN 'critical' ELSE 'high' END,
         coalesce(agg.actor::text, 'anonymous'), agg.actor, agg.label, agg.c, s.authz_failure_threshold,
         (SELECT ws FROM w), now_ts,
         jsonb_build_object('events', agg.items)
  FROM agg
  WHERE agg.c >= s.authz_failure_threshold
  ON CONFLICT (rule_key, subject_key, window_start) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;

  -- Unusual upload/file access patterns: high volume of downloads/previews per actor
  WITH w AS (SELECT now_ts - make_interval(mins => s.upload_access_window_minutes) AS ws),
  ev AS (
    SELECT f.actor_user_id AS actor, coalesce(f.staff_id, 'Unknown') AS label,
           f.action::text AS action, f.created_at, 'announcement_files'::text AS source
    FROM public.announcement_file_audit f, w
    WHERE f.created_at >= w.ws AND f.action::text IN ('download', 'preview')
    UNION ALL
    SELECT c.performed_by, 'Unknown', 'compliance_upload_' || coalesce(c.outcome, 'unknown'), c.created_at, 'compliance_uploads'
    FROM public.compliance_upload_audit c, w
    WHERE c.created_at >= w.ws
  ),
  agg AS (
    SELECT ev.actor, coalesce(max(ev.label), 'Unknown') AS label, count(*)::int AS c,
           jsonb_agg(jsonb_build_object('action', ev.action, 'source', ev.source, 'at', ev.created_at)
                     ORDER BY ev.created_at DESC) AS items
    FROM ev GROUP BY ev.actor
  )
  INSERT INTO public.security_monitor_alerts
    (rule_key, severity, subject_key, subject_user_id, subject_label, event_count, threshold, window_start, window_end, details)
  SELECT 'upload_access_anomaly',
         CASE WHEN agg.c >= s.upload_access_threshold * 2 THEN 'high' ELSE 'medium' END,
         coalesce(agg.actor::text, 'unknown'), agg.actor, agg.label, agg.c, s.upload_access_threshold,
         (SELECT ws FROM w), now_ts,
         jsonb_build_object('events', agg.items)
  FROM agg
  WHERE agg.c >= s.upload_access_threshold
  ON CONFLICT (rule_key, subject_key, window_start) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;

  UPDATE public.security_monitor_settings SET last_run_at = now_ts WHERE id = s.id;

  RETURN jsonb_build_object('ran_at', now_ts, 'alerts_created', inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.security_monitor_scan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_monitor_scan() TO authenticated, service_role;

-- 4. Acknowledgement
CREATE OR REPLACE FUNCTION public.security_monitor_acknowledge(_alert_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.security_monitor_alerts
     SET acknowledged_at = now(), acknowledged_by = auth.uid(), acknowledge_note = _note
   WHERE id = _alert_id;
END;
$$;

REVOKE ALL ON FUNCTION public.security_monitor_acknowledge(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_monitor_acknowledge(uuid, text) TO authenticated, service_role;
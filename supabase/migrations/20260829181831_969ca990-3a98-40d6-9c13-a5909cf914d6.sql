-- ============ Settings (single row) ============
CREATE TABLE public.biometric_reminder_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  grace_lead_days integer NOT NULL DEFAULT 10,
  grace_interval_days integer NOT NULL DEFAULT 3,
  overdue_interval_days integer NOT NULL DEFAULT 1,
  send_hour_utc integer NOT NULL DEFAULT 8,
  notify_in_app boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT true,
  grace_subject text NOT NULL DEFAULT 'Action required: enrol your biometric device',
  grace_body text NOT NULL DEFAULT 'Hello {{name}}, biometric (passkey) enrolment is required for your role. You have {{days_left}} day(s) left — the deadline is {{deadline}}. Please open Biometric Enrolment on your own device to complete it.',
  overdue_subject text NOT NULL DEFAULT 'Overdue: biometric enrolment deadline has passed',
  overdue_body text NOT NULL DEFAULT 'Hello {{name}}, your biometric (passkey) enrolment deadline passed on {{deadline}}. Access to the system is now restricted until you enrol a device. Please open Biometric Enrolment on your own device to complete it.',
  batch_size integer NOT NULL DEFAULT 100,
  paused_reason text,
  last_run_at timestamptz,
  last_run_summary jsonb,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT biometric_reminder_settings_hours CHECK (send_hour_utc BETWEEN 0 AND 23),
  CONSTRAINT biometric_reminder_settings_intervals CHECK (
    grace_lead_days BETWEEN 0 AND 365
    AND grace_interval_days BETWEEN 1 AND 60
    AND overdue_interval_days BETWEEN 1 AND 60
    AND batch_size BETWEEN 1 AND 500
  )
);

GRANT SELECT, INSERT, UPDATE ON public.biometric_reminder_settings TO authenticated;
GRANT ALL ON public.biometric_reminder_settings TO service_role;
ALTER TABLE public.biometric_reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage biometric reminder settings"
  ON public.biometric_reminder_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.biometric_reminder_settings (id) VALUES (gen_random_uuid());

-- ============ Reminder history ============
CREATE TABLE public.biometric_reminder_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('grace', 'overdue')),
  channel text NOT NULL CHECK (channel IN ('in_app', 'email')),
  subject text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  detail text,
  days_left integer,
  deadline timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bio_reminder_log_user ON public.biometric_reminder_log (user_id, kind, created_at DESC);
CREATE INDEX idx_bio_reminder_log_created ON public.biometric_reminder_log (created_at DESC);

GRANT SELECT ON public.biometric_reminder_log TO authenticated;
GRANT ALL ON public.biometric_reminder_log TO service_role;
ALTER TABLE public.biometric_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read biometric reminder log"
  ON public.biometric_reminder_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'oic')
         OR public.has_role(auth.uid(), '2ic')
         OR user_id = auth.uid());

-- ============ Admin settings update (audited) ============
CREATE OR REPLACE FUNCTION public.biometric_reminder_update_settings(_patch jsonb)
RETURNS public.biometric_reminder_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.biometric_reminder_settings;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators may change biometric reminder settings.';
  END IF;

  UPDATE public.biometric_reminder_settings s
     SET enabled = COALESCE((_patch->>'enabled')::boolean, s.enabled),
         grace_lead_days = COALESCE((_patch->>'grace_lead_days')::int, s.grace_lead_days),
         grace_interval_days = COALESCE((_patch->>'grace_interval_days')::int, s.grace_interval_days),
         overdue_interval_days = COALESCE((_patch->>'overdue_interval_days')::int, s.overdue_interval_days),
         send_hour_utc = COALESCE((_patch->>'send_hour_utc')::int, s.send_hour_utc),
         notify_in_app = COALESCE((_patch->>'notify_in_app')::boolean, s.notify_in_app),
         notify_email = COALESCE((_patch->>'notify_email')::boolean, s.notify_email),
         grace_subject = COALESCE(NULLIF(_patch->>'grace_subject', ''), s.grace_subject),
         grace_body = COALESCE(NULLIF(_patch->>'grace_body', ''), s.grace_body),
         overdue_subject = COALESCE(NULLIF(_patch->>'overdue_subject', ''), s.overdue_subject),
         overdue_body = COALESCE(NULLIF(_patch->>'overdue_body', ''), s.overdue_body),
         batch_size = COALESCE((_patch->>'batch_size')::int, s.batch_size),
         paused_reason = CASE WHEN _patch ? 'paused_reason'
                              THEN NULLIF(_patch->>'paused_reason', '')
                              ELSE s.paused_reason END,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE s.id = (SELECT id FROM public.biometric_reminder_settings ORDER BY created_at_safe() LIMIT 1)
   RETURNING * INTO _row;

  INSERT INTO public.webauthn_audit (event, user_id, detail, actor_id)
  VALUES ('policy_change', auth.uid(),
          format('Biometric reminder settings updated: %s', _patch::text),
          auth.uid());

  RETURN _row;
END;
$$;

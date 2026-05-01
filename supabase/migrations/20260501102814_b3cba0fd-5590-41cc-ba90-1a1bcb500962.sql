-- ═══════════════════════════════════════════════════════════════════════
-- 1. SECURITY AUDIT LOG — hash-chained, append-only, with daily anchors
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('firewall','account','export','mfa','quarantine','dlp')),
  action text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','high','critical')),
  actor_id uuid,
  actor_label text,
  subject text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  prev_hash text,
  row_hash text NOT NULL,
  seq bigserial,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_audit_created  ON public.security_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_audit_category ON public.security_audit_log (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_audit_actor    ON public.security_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_sec_audit_seq      ON public.security_audit_log (seq);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read security audit" ON public.security_audit_log;
CREATE POLICY "Admins read security audit" ON public.security_audit_log
  FOR SELECT USING (public.has_role(auth.uid(),'admin'::app_role));

-- No INSERT/UPDATE/DELETE policies → only SECURITY DEFINER RPC may write.

CREATE OR REPLACE FUNCTION public.security_audit_set_hash()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_prev text;
BEGIN
  SELECT row_hash INTO v_prev FROM public.security_audit_log
  ORDER BY seq DESC NULLS LAST LIMIT 1;
  NEW.prev_hash := v_prev;
  NEW.row_hash := encode(digest(
    coalesce(v_prev,'') || '|' ||
    NEW.id::text || '|' ||
    NEW.category || '|' ||
    NEW.action || '|' ||
    NEW.severity || '|' ||
    coalesce(NEW.actor_id::text,'') || '|' ||
    coalesce(NEW.subject,'') || '|' ||
    coalesce(NEW.details::text,'{}') || '|' ||
    NEW.created_at::text,
    'sha256'), 'hex');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_security_audit_hash ON public.security_audit_log;
CREATE TRIGGER trg_security_audit_hash
  BEFORE INSERT ON public.security_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.security_audit_set_hash();

CREATE OR REPLACE FUNCTION public.block_security_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_log is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_security_audit_no_update ON public.security_audit_log;
CREATE TRIGGER trg_security_audit_no_update
  BEFORE UPDATE OR DELETE ON public.security_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.block_security_audit_mutation();

-- Public RPC for app code to write entries
CREATE OR REPLACE FUNCTION public.log_security_event(
  _category text, _action text, _severity text DEFAULT 'info',
  _subject text DEFAULT NULL, _details jsonb DEFAULT '{}'::jsonb,
  _ip text DEFAULT NULL, _ua text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_id uuid;
  v_label text;
BEGIN
  SELECT first_name||' '||last_name INTO v_label FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.security_audit_log
    (category, action, severity, actor_id, actor_label, subject, details, ip_address, user_agent, row_hash)
  VALUES
    (_category, _action, _severity, auth.uid(), v_label, _subject,
     coalesce(_details,'{}'::jsonb), _ip, _ua, 'pending')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.log_security_event(text,text,text,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_security_event(text,text,text,text,jsonb,text,text) TO authenticated;

-- Daily anchor rows
CREATE TABLE IF NOT EXISTS public.security_audit_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anchor_date date NOT NULL UNIQUE,
  head_seq bigint NOT NULL,
  head_hash text NOT NULL,
  row_count bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_audit_anchors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read anchors" ON public.security_audit_anchors;
CREATE POLICY "Admins read anchors" ON public.security_audit_anchors
  FOR SELECT USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE OR REPLACE FUNCTION public.security_audit_create_anchor()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_seq bigint; v_hash text; v_count bigint; v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  SELECT seq, row_hash INTO v_seq, v_hash FROM public.security_audit_log
   ORDER BY seq DESC LIMIT 1;
  IF v_seq IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_count FROM public.security_audit_log;
  INSERT INTO public.security_audit_anchors (anchor_date, head_seq, head_hash, row_count)
  VALUES (current_date, v_seq, v_hash, v_count)
  ON CONFLICT (anchor_date) DO UPDATE
    SET head_seq=EXCLUDED.head_seq, head_hash=EXCLUDED.head_hash, row_count=EXCLUDED.row_count
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.security_audit_create_anchor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.security_audit_create_anchor() TO authenticated;

-- Verify chain integrity
CREATE OR REPLACE FUNCTION public.verify_security_audit_chain()
RETURNS TABLE(broken_seq bigint, broken_id uuid, expected_prev text, actual_prev text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  r record;
  v_prev text := NULL;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  FOR r IN SELECT seq, id, prev_hash, row_hash FROM public.security_audit_log ORDER BY seq LOOP
    IF v_prev IS DISTINCT FROM r.prev_hash THEN
      broken_seq := r.seq; broken_id := r.id;
      expected_prev := v_prev; actual_prev := r.prev_hash;
      RETURN NEXT; RETURN;
    END IF;
    v_prev := r.row_hash;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.verify_security_audit_chain() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_security_audit_chain() TO authenticated;

-- Retention
CREATE TABLE IF NOT EXISTS public.audit_retention_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_audit_days integer NOT NULL DEFAULT 365 CHECK (security_audit_days >= 30),
  firewall_event_days integer NOT NULL DEFAULT 180 CHECK (firewall_event_days >= 30),
  account_unlock_days integer NOT NULL DEFAULT 730 CHECK (account_unlock_days >= 90),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.audit_retention_settings DEFAULT VALUES
  ON CONFLICT DO NOTHING;

ALTER TABLE public.audit_retention_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read retention" ON public.audit_retention_settings;
CREATE POLICY "Admins read retention" ON public.audit_retention_settings
  FOR SELECT USING (public.has_role(auth.uid(),'admin'::app_role));
DROP POLICY IF EXISTS "Admins update retention" ON public.audit_retention_settings;
CREATE POLICY "Admins update retention" ON public.audit_retention_settings
  FOR UPDATE USING (public.has_role(auth.uid(),'admin'::app_role));

-- Export RPC
CREATE OR REPLACE FUNCTION public.export_security_audit(_from timestamptz, _to timestamptz)
RETURNS TABLE(seq bigint, id uuid, created_at timestamptz, category text, action text, severity text,
              actor_label text, subject text, details jsonb, ip_address text, row_hash text, prev_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  PERFORM public.log_security_event('export','security_audit_exported','high', NULL,
    jsonb_build_object('from',_from,'to',_to));
  RETURN QUERY
    SELECT s.seq, s.id, s.created_at, s.category, s.action, s.severity,
           s.actor_label, s.subject, s.details, s.ip_address, s.row_hash, s.prev_hash
    FROM public.security_audit_log s
    WHERE s.created_at BETWEEN _from AND _to
    ORDER BY s.seq;
END $$;
REVOKE ALL ON FUNCTION public.export_security_audit(timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_security_audit(timestamptz,timestamptz) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. STAFF QUARANTINE INBOX — own-row visibility + review requests
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Staff read own quarantine" ON public.firewall_quarantine;
CREATE POLICY "Staff read own quarantine" ON public.firewall_quarantine
  FOR SELECT USING (reported_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.firewall_quarantine_review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quarantine_id uuid NOT NULL REFERENCES public.firewall_quarantine(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  requested_label text,
  evidence_note text NOT NULL CHECK (length(btrim(evidence_note)) >= 10),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed_release','reviewed_block','withdrawn')),
  reviewed_by uuid, reviewed_label text, review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_qrr_quarantine ON public.firewall_quarantine_review_requests(quarantine_id);
CREATE INDEX IF NOT EXISTS idx_qrr_requested  ON public.firewall_quarantine_review_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_qrr_status     ON public.firewall_quarantine_review_requests(status);

ALTER TABLE public.firewall_quarantine_review_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read own reviews" ON public.firewall_quarantine_review_requests;
CREATE POLICY "Staff read own reviews" ON public.firewall_quarantine_review_requests
  FOR SELECT USING (requested_by = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
DROP POLICY IF EXISTS "Staff create reviews" ON public.firewall_quarantine_review_requests;
CREATE POLICY "Staff create reviews" ON public.firewall_quarantine_review_requests
  FOR INSERT WITH CHECK (requested_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.firewall_quarantine q WHERE q.id=quarantine_id AND q.reported_by=auth.uid()));
DROP POLICY IF EXISTS "Admins update reviews" ON public.firewall_quarantine_review_requests;
CREATE POLICY "Admins update reviews" ON public.firewall_quarantine_review_requests
  FOR UPDATE USING (public.has_role(auth.uid(),'admin'::app_role));

-- ═══════════════════════════════════════════════════════════════════════
-- 3. ALERT SETTINGS + TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.firewall_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_on_block boolean NOT NULL DEFAULT true,
  alert_on_quarantine boolean NOT NULL DEFAULT true,
  repeat_offender_threshold integer NOT NULL DEFAULT 3 CHECK (repeat_offender_threshold > 0),
  repeat_offender_window_minutes integer NOT NULL DEFAULT 10 CHECK (repeat_offender_window_minutes > 0),
  email_alerts boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.firewall_alert_settings DEFAULT VALUES ON CONFLICT DO NOTHING;
ALTER TABLE public.firewall_alert_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read alerts" ON public.firewall_alert_settings;
CREATE POLICY "Admins read alerts" ON public.firewall_alert_settings
  FOR SELECT USING (public.has_role(auth.uid(),'admin'::app_role));
DROP POLICY IF EXISTS "Admins update alerts" ON public.firewall_alert_settings;
CREATE POLICY "Admins update alerts" ON public.firewall_alert_settings
  FOR UPDATE USING (public.has_role(auth.uid(),'admin'::app_role));

-- Trigger: notify admins on high-severity firewall events
CREATE OR REPLACE FUNCTION public.notify_admins_firewall_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_settings record;
  v_recent integer;
  v_severity text;
BEGIN
  SELECT * INTO v_settings FROM public.firewall_alert_settings LIMIT 1;
  IF v_settings IS NULL THEN RETURN NEW; END IF;

  v_severity := CASE NEW.action::text
    WHEN 'block' THEN 'critical'
    WHEN 'quarantine' THEN 'high'
    WHEN 'warn' THEN 'warn'
    ELSE 'info' END;

  -- Mirror to security_audit_log
  INSERT INTO public.security_audit_log
    (category, action, severity, actor_id, actor_label, subject, details, ip_address, row_hash)
  VALUES
    ('firewall', 'firewall_event_'||NEW.action::text, v_severity,
     NEW.user_id, NEW.user_label, NEW.subject,
     jsonb_build_object('layer',NEW.layer,'event_id',NEW.id,'rule_id',NEW.matched_rule_id,'threat_id',NEW.matched_threat_id) || coalesce(NEW.details,'{}'::jsonb),
     NEW.ip_address, 'pending');

  -- High-severity admin notification
  IF (NEW.action::text = 'block' AND v_settings.alert_on_block)
     OR (NEW.action::text = 'quarantine' AND v_settings.alert_on_quarantine) THEN
    PERFORM public.notify_admins(
      'High-severity firewall event',
      coalesce(NEW.user_label,'Unknown user')||' • '||NEW.layer::text||' '||NEW.action::text||': '||coalesce(NEW.subject,'(no subject)'),
      'firewall_alert',
      NEW.id
    );
  END IF;

  -- Repeat-offender check (same user, last N minutes)
  IF NEW.user_id IS NOT NULL AND NEW.action::text IN ('block','quarantine') THEN
    SELECT count(*) INTO v_recent FROM public.firewall_events
     WHERE user_id = NEW.user_id
       AND action::text IN ('block','quarantine')
       AND created_at > now() - (v_settings.repeat_offender_window_minutes || ' minutes')::interval;
    IF v_recent >= v_settings.repeat_offender_threshold THEN
      PERFORM public.notify_admins(
        'Repeat firewall offender',
        coalesce(NEW.user_label,'User')||' triggered '||v_recent||' high-severity firewall events in the last '||v_settings.repeat_offender_window_minutes||' min',
        'firewall_repeat_offender',
        NEW.user_id
      );
      INSERT INTO public.security_audit_log
        (category, action, severity, actor_id, actor_label, subject, details, row_hash)
      VALUES
        ('firewall','repeat_offender','critical', NEW.user_id, NEW.user_label,
         'Repeat firewall offender',
         jsonb_build_object('count',v_recent,'window_min',v_settings.repeat_offender_window_minutes),
         'pending');
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_admins_firewall_event ON public.firewall_events;
CREATE TRIGGER trg_notify_admins_firewall_event
  AFTER INSERT ON public.firewall_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_firewall_event();

-- ═══════════════════════════════════════════════════════════════════════
-- 4. HRM EXPORT DLP
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hrm_export_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watermark_pdf boolean NOT NULL DEFAULT true,
  watermark_csv boolean NOT NULL DEFAULT false,
  block_non_command boolean NOT NULL DEFAULT true,
  classification_label text NOT NULL DEFAULT 'CONFIDENTIAL — GIS Internal',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.hrm_export_settings DEFAULT VALUES ON CONFLICT DO NOTHING;
ALTER TABLE public.hrm_export_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth read export settings" ON public.hrm_export_settings;
CREATE POLICY "Auth read export settings" ON public.hrm_export_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Admins update export settings" ON public.hrm_export_settings;
CREATE POLICY "Admins update export settings" ON public.hrm_export_settings
  FOR UPDATE USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.hrm_export_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exported_by uuid NOT NULL,
  exported_label text,
  export_kind text NOT NULL,
  format text NOT NULL CHECK (format IN ('pdf','csv','xlsx','json')),
  subject text,
  row_count integer NOT NULL DEFAULT 0,
  watermarked boolean NOT NULL DEFAULT false,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hrm_export_audit_user ON public.hrm_export_audit(exported_by);
CREATE INDEX IF NOT EXISTS idx_hrm_export_audit_time ON public.hrm_export_audit(created_at DESC);
ALTER TABLE public.hrm_export_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read export audit" ON public.hrm_export_audit;
CREATE POLICY "Admins read export audit" ON public.hrm_export_audit
  FOR SELECT USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE OR REPLACE FUNCTION public.can_export_hrm(_kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin','oic','2ic','staff_officer','head_of_administration','chief_staff_officer','supervisor')
  );
$$;
REVOKE ALL ON FUNCTION public.can_export_hrm(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_export_hrm(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_hrm_export(
  _kind text, _format text, _subject text, _row_count integer,
  _watermarked boolean, _details jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id uuid; v_label text;
BEGIN
  IF NOT public.can_export_hrm(_kind) THEN
    RAISE EXCEPTION 'Not authorized to export %', _kind USING ERRCODE = '42501';
  END IF;
  SELECT first_name||' '||last_name INTO v_label FROM public.profiles WHERE user_id=auth.uid();
  INSERT INTO public.hrm_export_audit
    (exported_by, exported_label, export_kind, format, subject, row_count, watermarked, details)
  VALUES (auth.uid(), v_label, _kind, _format, _subject, coalesce(_row_count,0), _watermarked, coalesce(_details,'{}'::jsonb))
  RETURNING id INTO v_id;
  PERFORM public.log_security_event('export','hrm_export','high',_subject,
    jsonb_build_object('kind',_kind,'format',_format,'rows',_row_count,'watermarked',_watermarked) || coalesce(_details,'{}'::jsonb));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.log_hrm_export(text,text,text,integer,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_hrm_export(text,text,text,integer,boolean,jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. MFA: BACKUP CODES + RECOVERY + ENFORCEMENT SETTINGS
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS mfa_required_roles text[] NOT NULL DEFAULT ARRAY['admin','oic','2ic']::text[];

CREATE TABLE IF NOT EXISTS public.mfa_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, code_hash)
);
CREATE INDEX IF NOT EXISTS idx_mfa_backup_user ON public.mfa_backup_codes(user_id) WHERE used_at IS NULL;
ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;
-- Owner can see only metadata (hashes are useless to client) — needed to count remaining
DROP POLICY IF EXISTS "Owner read backup codes" ON public.mfa_backup_codes;
CREATE POLICY "Owner read backup codes" ON public.mfa_backup_codes
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

CREATE OR REPLACE FUNCTION public.mfa_generate_backup_codes()
RETURNS TABLE(code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, extensions AS $$
DECLARE
  i integer; v_code text; v_hash text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  -- Invalidate existing
  DELETE FROM public.mfa_backup_codes WHERE user_id = auth.uid();
  FOR i IN 1..10 LOOP
    -- 10-char base32-ish: 5 hex bytes encoded → 10 hex chars
    v_code := lower(encode(extensions.gen_random_bytes(5),'hex'));
    -- Format as XXXXX-XXXXX
    v_code := substring(v_code from 1 for 5)||'-'||substring(v_code from 6 for 5);
    v_hash := encode(digest(v_code,'sha256'),'hex');
    INSERT INTO public.mfa_backup_codes (user_id, code_hash) VALUES (auth.uid(), v_hash);
    code := v_code;
    RETURN NEXT;
  END LOOP;
  PERFORM public.log_security_event('mfa','backup_codes_generated','warn', NULL,
    jsonb_build_object('count',10));
END $$;
REVOKE ALL ON FUNCTION public.mfa_generate_backup_codes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_generate_backup_codes() TO authenticated;

CREATE OR REPLACE FUNCTION public.mfa_consume_backup_code(_code text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_hash text; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  v_hash := encode(digest(lower(btrim(_code)),'sha256'),'hex');
  SELECT id INTO v_id FROM public.mfa_backup_codes
   WHERE user_id=auth.uid() AND code_hash=v_hash AND used_at IS NULL;
  IF v_id IS NULL THEN
    PERFORM public.log_security_event('mfa','backup_code_failed','high', NULL, '{}'::jsonb);
    RETURN false;
  END IF;
  UPDATE public.mfa_backup_codes SET used_at=now() WHERE id=v_id;
  PERFORM public.log_security_event('mfa','backup_code_used','warn', NULL, '{}'::jsonb);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.mfa_consume_backup_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_consume_backup_code(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.mfa_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  staff_id text,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 10),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired')),
  reviewed_by uuid, reviewed_label text, review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON public.mfa_recovery_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_status ON public.mfa_recovery_requests(status);
ALTER TABLE public.mfa_recovery_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner or admin read recovery" ON public.mfa_recovery_requests;
CREATE POLICY "Owner or admin read recovery" ON public.mfa_recovery_requests
  FOR SELECT USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
DROP POLICY IF EXISTS "Owner create recovery" ON public.mfa_recovery_requests;
CREATE POLICY "Owner create recovery" ON public.mfa_recovery_requests
  FOR INSERT WITH CHECK (user_id=auth.uid());
DROP POLICY IF EXISTS "Admins update recovery" ON public.mfa_recovery_requests;
CREATE POLICY "Admins update recovery" ON public.mfa_recovery_requests
  FOR UPDATE USING (public.has_role(auth.uid(),'admin'::app_role));

-- ═══════════════════════════════════════════════════════════════════════
-- 6. SECURE FILE UPLOADS BUCKET + AUDIT
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('secure-uploads','secure-uploads', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Owners read secure-uploads" ON storage.objects;
CREATE POLICY "Owners read secure-uploads" ON storage.objects
  FOR SELECT USING (
    bucket_id='secure-uploads' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(),'admin'::app_role)
      OR public.is_command_tier(auth.uid())
    )
  );
DROP POLICY IF EXISTS "Owners upload secure-uploads" ON storage.objects;
CREATE POLICY "Owners upload secure-uploads" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id='secure-uploads' AND auth.uid()::text = (storage.foldername(name))[1]
  );
DROP POLICY IF EXISTS "Owners delete own secure-uploads" ON storage.objects;
CREATE POLICY "Owners delete own secure-uploads" ON storage.objects
  FOR DELETE USING (
    bucket_id='secure-uploads' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(),'admin'::app_role)
    )
  );

CREATE TABLE IF NOT EXISTS public.secure_file_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid NOT NULL,
  uploaded_label text,
  bucket text NOT NULL DEFAULT 'secure-uploads',
  storage_path text NOT NULL,
  filename text NOT NULL,
  size_bytes bigint NOT NULL,
  mime_type text,
  sniffed_mime text,
  sha256 text,
  scan_action text NOT NULL CHECK (scan_action IN ('allow','warn','quarantine','block')),
  scan_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_secure_uploads_user ON public.secure_file_uploads(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_secure_uploads_time ON public.secure_file_uploads(created_at DESC);
ALTER TABLE public.secure_file_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner or admin read uploads" ON public.secure_file_uploads;
CREATE POLICY "Owner or admin read uploads" ON public.secure_file_uploads
  FOR SELECT USING (uploaded_by=auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
DROP POLICY IF EXISTS "Owner insert uploads" ON public.secure_file_uploads;
CREATE POLICY "Owner insert uploads" ON public.secure_file_uploads
  FOR INSERT WITH CHECK (uploaded_by=auth.uid());

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Account event mirror (failed logins → security_audit_log)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mirror_failed_login_to_security_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.security_audit_log
    (category, action, severity, subject, details, ip_address, row_hash)
  VALUES
    ('account','failed_login','warn', NEW.staff_id,
     jsonb_build_object('attempted_at', NEW.attempted_at), NEW.ip_address, 'pending');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mirror_failed_login ON public.failed_login_attempts;
CREATE TRIGGER trg_mirror_failed_login
  AFTER INSERT ON public.failed_login_attempts
  FOR EACH ROW EXECUTE FUNCTION public.mirror_failed_login_to_security_audit();

CREATE OR REPLACE FUNCTION public.mirror_account_unlock_to_security_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.security_audit_log
    (category, action, severity, actor_id, actor_label, subject, details, row_hash)
  VALUES
    ('account','account_unlocked','high', NEW.unlocked_by, NEW.unlocked_by_name,
     NEW.target_full_name, jsonb_build_object('reason',NEW.reason,'target_staff_id',NEW.target_staff_id),
     'pending');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mirror_account_unlock ON public.account_unlock_audit;
CREATE TRIGGER trg_mirror_account_unlock
  AFTER INSERT ON public.account_unlock_audit
  FOR EACH ROW EXECUTE FUNCTION public.mirror_account_unlock_to_security_audit();
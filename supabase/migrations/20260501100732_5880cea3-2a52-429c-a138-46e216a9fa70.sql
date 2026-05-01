-- =========================================================
-- INTRUSION PREVENTION FIREWALL
-- =========================================================

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE public.firewall_rule_kind AS ENUM (
    'file_extension','file_mime','file_hash',
    'url_domain','url_keyword','url_full',
    'ip_address','ip_cidr','asn',
    'waf_pattern'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.firewall_action AS ENUM ('allow','warn','quarantine','block');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.firewall_event_layer AS ENUM ('file','url','auth','waf');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.firewall_quarantine_status AS ENUM ('pending','released','blocked','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Settings (singleton)
CREATE TABLE IF NOT EXISTS public.firewall_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled boolean NOT NULL DEFAULT true,
  default_action public.firewall_action NOT NULL DEFAULT 'quarantine',
  feed_refresh_enabled boolean NOT NULL DEFAULT true,
  max_upload_mb integer NOT NULL DEFAULT 25 CHECK (max_upload_mb BETWEEN 1 AND 200),
  link_warn_external boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS firewall_settings_singleton ON public.firewall_settings ((true));

INSERT INTO public.firewall_settings (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- 3. Rules
CREATE TABLE IF NOT EXISTS public.firewall_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.firewall_rule_kind NOT NULL,
  pattern text NOT NULL,
  action public.firewall_action NOT NULL DEFAULT 'block',
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, pattern)
);
CREATE INDEX IF NOT EXISTS idx_firewall_rules_kind_enabled
  ON public.firewall_rules (kind, is_enabled);

-- 4. Threat feeds
CREATE TABLE IF NOT EXISTS public.firewall_threat_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  source_url text NOT NULL,
  cadence text NOT NULL DEFAULT 'daily',
  is_enabled boolean NOT NULL DEFAULT true,
  last_refreshed_at timestamptz,
  last_status text,
  last_entry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.firewall_threat_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES public.firewall_threat_feeds(id) ON DELETE CASCADE,
  kind public.firewall_rule_kind NOT NULL,
  value text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feed_id, kind, value)
);
CREATE INDEX IF NOT EXISTS idx_firewall_threat_entries_lookup
  ON public.firewall_threat_entries (kind, value);

-- 5. Events (audit)
CREATE TABLE IF NOT EXISTS public.firewall_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer public.firewall_event_layer NOT NULL,
  action public.firewall_action NOT NULL,
  matched_rule_id uuid REFERENCES public.firewall_rules(id) ON DELETE SET NULL,
  matched_threat_id uuid REFERENCES public.firewall_threat_entries(id) ON DELETE SET NULL,
  subject text NOT NULL, -- filename, URL, IP, route, etc.
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_label text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_firewall_events_created
  ON public.firewall_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_firewall_events_layer
  ON public.firewall_events (layer, created_at DESC);

-- 6. Quarantine queue
CREATE TABLE IF NOT EXISTS public.firewall_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer public.firewall_event_layer NOT NULL,
  subject text NOT NULL,
  reason text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.firewall_quarantine_status NOT NULL DEFAULT 'pending',
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_label text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_label text,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_firewall_quarantine_status
  ON public.firewall_quarantine (status, created_at DESC);

-- 7. Update timestamp trigger
DO $$ BEGIN
  CREATE TRIGGER trg_firewall_settings_updated
    BEFORE UPDATE ON public.firewall_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_firewall_rules_updated
    BEFORE UPDATE ON public.firewall_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_firewall_feeds_updated
    BEFORE UPDATE ON public.firewall_threat_feeds
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8. RLS
ALTER TABLE public.firewall_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firewall_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firewall_threat_feeds    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firewall_threat_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firewall_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firewall_quarantine      ENABLE ROW LEVEL SECURITY;

-- Authenticated users can READ settings + enabled rules + threat entries
-- (clients need them to evaluate locally before upload). They CANNOT modify.
DROP POLICY IF EXISTS "auth read firewall settings" ON public.firewall_settings;
CREATE POLICY "auth read firewall settings" ON public.firewall_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin manage firewall settings" ON public.firewall_settings;
CREATE POLICY "admin manage firewall settings" ON public.firewall_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "auth read firewall rules" ON public.firewall_rules;
CREATE POLICY "auth read firewall rules" ON public.firewall_rules
  FOR SELECT TO authenticated USING (is_enabled = true);
DROP POLICY IF EXISTS "admin manage firewall rules" ON public.firewall_rules;
CREATE POLICY "admin manage firewall rules" ON public.firewall_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "admin read firewall feeds" ON public.firewall_threat_feeds;
CREATE POLICY "admin read firewall feeds" ON public.firewall_threat_feeds
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));
DROP POLICY IF EXISTS "admin manage firewall feeds" ON public.firewall_threat_feeds;
CREATE POLICY "admin manage firewall feeds" ON public.firewall_threat_feeds
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "auth read firewall threats" ON public.firewall_threat_entries;
CREATE POLICY "auth read firewall threats" ON public.firewall_threat_entries
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin read firewall events" ON public.firewall_events;
CREATE POLICY "admin read firewall events" ON public.firewall_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));
-- Inserts only via SECURITY DEFINER fn → no INSERT policy.

DROP POLICY IF EXISTS "admin read firewall quarantine" ON public.firewall_quarantine;
CREATE POLICY "admin read firewall quarantine" ON public.firewall_quarantine
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));
-- Writes only via SECURITY DEFINER fns.

-- 9. Seed default rules (only on fresh install)
INSERT INTO public.firewall_rules (kind, pattern, action, description, is_enabled) VALUES
  ('file_extension','exe','block','Executable — Windows binary',true),
  ('file_extension','msi','block','Executable installer',true),
  ('file_extension','bat','block','Batch script',true),
  ('file_extension','cmd','block','Windows command script',true),
  ('file_extension','ps1','block','PowerShell script',true),
  ('file_extension','vbs','block','VBScript',true),
  ('file_extension','js','quarantine','JavaScript file (uploaded as attachment)',true),
  ('file_extension','jar','block','Java archive',true),
  ('file_extension','scr','block','Screensaver executable',true),
  ('file_extension','dll','block','Dynamic-link library',true),
  ('file_extension','sh','quarantine','Shell script',true),
  ('file_extension','apk','block','Android package',true),
  ('file_extension','iso','block','Disk image',true),
  ('file_mime','application/x-msdownload','block','Windows executable MIME',true),
  ('file_mime','application/x-msdos-program','block','DOS executable MIME',true),
  ('url_keyword','login.','quarantine','Possible phishing keyword: login subdomain',true),
  ('url_keyword','wp-login','quarantine','Common phishing path',true),
  ('url_keyword','bit.ly','warn','URL shortener (manual review recommended)',true),
  ('url_keyword','tinyurl','warn','URL shortener (manual review recommended)',true),
  ('url_keyword','ipfs.io','warn','Anonymous hosting (manual review recommended)',true),
  ('waf_pattern','<script','quarantine','HTML/JS injection attempt',true),
  ('waf_pattern','union select','block','SQL injection attempt',true),
  ('waf_pattern','../','quarantine','Path traversal attempt',true),
  ('waf_pattern','javascript:','quarantine','JavaScript URI scheme',true)
ON CONFLICT (kind, pattern) DO NOTHING;

-- 10. Seed feed sources (URLhaus + Phishing.Database — both no-key, free)
INSERT INTO public.firewall_threat_feeds (slug, display_name, source_url, cadence) VALUES
  ('urlhaus_recent', 'URLhaus — Recent malicious URLs',
   'https://urlhaus.abuse.ch/downloads/text_recent/', 'daily'),
  ('openphish', 'OpenPhish — Active phishing URLs',
   'https://openphish.com/feed.txt', 'daily')
ON CONFLICT (slug) DO NOTHING;

-- 11. Evaluate file RPC (extension + MIME + size)
CREATE OR REPLACE FUNCTION public.firewall_evaluate_file(
  _filename text,
  _mime text,
  _size_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ext text;
  v_settings record;
  v_rule record;
  v_action public.firewall_action := 'allow';
  v_reason text := '';
  v_rule_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_settings FROM public.firewall_settings LIMIT 1;
  IF NOT v_settings.is_enabled THEN
    RETURN jsonb_build_object('action','allow','reason','firewall disabled');
  END IF;

  IF _size_bytes > (v_settings.max_upload_mb::bigint * 1024 * 1024) THEN
    RETURN jsonb_build_object(
      'action','block',
      'reason', format('File exceeds %s MB limit', v_settings.max_upload_mb)
    );
  END IF;

  v_ext := lower(regexp_replace(coalesce(_filename,''), '^.*\.', ''));

  -- Match by extension
  SELECT id, action, description INTO v_rule
    FROM public.firewall_rules
   WHERE is_enabled
     AND kind = 'file_extension'
     AND lower(pattern) = v_ext
   ORDER BY CASE action WHEN 'block' THEN 0 WHEN 'quarantine' THEN 1 WHEN 'warn' THEN 2 ELSE 3 END
   LIMIT 1;
  IF FOUND THEN
    v_action := v_rule.action; v_reason := v_rule.description; v_rule_id := v_rule.id;
  END IF;

  -- Match by MIME (only escalate)
  IF v_action <> 'block' THEN
    SELECT id, action, description INTO v_rule
      FROM public.firewall_rules
     WHERE is_enabled
       AND kind = 'file_mime'
       AND lower(pattern) = lower(coalesce(_mime,''))
     ORDER BY CASE action WHEN 'block' THEN 0 WHEN 'quarantine' THEN 1 WHEN 'warn' THEN 2 ELSE 3 END
     LIMIT 1;
    IF FOUND AND v_rule.action::text > v_action::text THEN
      v_action := v_rule.action; v_reason := v_rule.description; v_rule_id := v_rule.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'action', v_action,
    'reason', coalesce(nullif(v_reason,''),'No matching rule'),
    'matched_rule_id', v_rule_id,
    'extension', v_ext
  );
END;
$$;

-- 12. Evaluate URL RPC
CREATE OR REPLACE FUNCTION public.firewall_evaluate_url(_url text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
  v_lower text := lower(coalesce(_url,''));
  v_host text;
  v_action public.firewall_action := 'allow';
  v_reason text := '';
  v_rule record;
  v_threat record;
  v_rule_id uuid;
  v_threat_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_settings FROM public.firewall_settings LIMIT 1;
  IF NOT v_settings.is_enabled THEN
    RETURN jsonb_build_object('action','allow','reason','firewall disabled');
  END IF;

  -- crude host extract
  v_host := lower(regexp_replace(v_lower, '^[a-z]+://([^/?#]+).*$', '\1'));
  IF v_host = v_lower THEN v_host := v_lower; END IF;

  -- Threat feed exact URL match
  SELECT id INTO v_threat_id FROM public.firewall_threat_entries
   WHERE kind='url_full' AND lower(value) = v_lower LIMIT 1;
  IF v_threat_id IS NOT NULL THEN
    RETURN jsonb_build_object('action','block','reason','URL is on a known threat feed','matched_threat_id', v_threat_id);
  END IF;
  -- Threat feed domain match
  SELECT id INTO v_threat_id FROM public.firewall_threat_entries
   WHERE kind='url_domain' AND v_host LIKE '%' || lower(value) || '%' LIMIT 1;
  IF v_threat_id IS NOT NULL THEN
    v_action := 'block'; v_reason := 'Domain matches threat feed';
  END IF;

  -- Local rules: domain
  IF v_action <> 'block' THEN
    SELECT id, action, description INTO v_rule
      FROM public.firewall_rules
     WHERE is_enabled AND kind='url_domain'
       AND v_host LIKE '%' || lower(pattern) || '%'
     ORDER BY CASE action WHEN 'block' THEN 0 WHEN 'quarantine' THEN 1 WHEN 'warn' THEN 2 ELSE 3 END
     LIMIT 1;
    IF FOUND THEN
      v_action := v_rule.action; v_reason := v_rule.description; v_rule_id := v_rule.id;
    END IF;
  END IF;
  -- Local rules: keyword
  IF v_action NOT IN ('block') THEN
    SELECT id, action, description INTO v_rule
      FROM public.firewall_rules
     WHERE is_enabled AND kind='url_keyword'
       AND v_lower LIKE '%' || lower(pattern) || '%'
     ORDER BY CASE action WHEN 'block' THEN 0 WHEN 'quarantine' THEN 1 WHEN 'warn' THEN 2 ELSE 3 END
     LIMIT 1;
    IF FOUND AND v_rule.action::text > v_action::text THEN
      v_action := v_rule.action; v_reason := v_rule.description; v_rule_id := v_rule.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'action', v_action,
    'reason', coalesce(nullif(v_reason,''),'No matching rule'),
    'matched_rule_id', v_rule_id,
    'matched_threat_id', v_threat_id,
    'host', v_host
  );
END;
$$;

-- 13. Record event (always callable by authenticated users)
CREATE OR REPLACE FUNCTION public.firewall_record_event(
  _layer public.firewall_event_layer,
  _action public.firewall_action,
  _subject text,
  _details jsonb DEFAULT '{}'::jsonb,
  _matched_rule_id uuid DEFAULT NULL,
  _matched_threat_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_label text;
  v_quarantine_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501';
  END IF;

  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO v_label FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.firewall_events
    (layer, action, subject, details, matched_rule_id, matched_threat_id, user_id, user_label)
  VALUES
    (_layer, _action, _subject, coalesce(_details,'{}'::jsonb),
     _matched_rule_id, _matched_threat_id, auth.uid(), nullif(v_label,''))
  RETURNING id INTO v_id;

  -- Auto-create quarantine entry when action = quarantine
  IF _action = 'quarantine' THEN
    INSERT INTO public.firewall_quarantine
      (layer, subject, reason, payload, reported_by, reported_label)
    VALUES
      (_layer, _subject,
       coalesce(_details->>'reason','Flagged for review'),
       coalesce(_details,'{}'::jsonb),
       auth.uid(), nullif(v_label,''))
    RETURNING id INTO v_quarantine_id;
  END IF;

  RETURN v_id;
END;
$$;

-- 14. Quarantine review RPCs (admin only)
CREATE OR REPLACE FUNCTION public.firewall_release_quarantine(_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_label text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can review quarantine' USING ERRCODE='42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required' USING ERRCODE='22023';
  END IF;
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO v_label FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  UPDATE public.firewall_quarantine
     SET status='released', reviewed_by=auth.uid(),
         reviewed_label=nullif(v_label,''),
         review_reason=btrim(_reason),
         reviewed_at=now()
   WHERE id=_id AND status='pending';

  INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
  VALUES ('firewall_quarantine_released','firewall_quarantine',_id,auth.uid(),
          jsonb_build_object('reason',btrim(_reason)));
END;
$$;

CREATE OR REPLACE FUNCTION public.firewall_block_quarantine(_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_label text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can review quarantine' USING ERRCODE='42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required' USING ERRCODE='22023';
  END IF;
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO v_label FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  UPDATE public.firewall_quarantine
     SET status='blocked', reviewed_by=auth.uid(),
         reviewed_label=nullif(v_label,''),
         review_reason=btrim(_reason),
         reviewed_at=now()
   WHERE id=_id AND status='pending';

  INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
  VALUES ('firewall_quarantine_blocked','firewall_quarantine',_id,auth.uid(),
          jsonb_build_object('reason',btrim(_reason)));
END;
$$;

REVOKE ALL ON FUNCTION public.firewall_evaluate_file(text,text,bigint) FROM public, anon;
REVOKE ALL ON FUNCTION public.firewall_evaluate_url(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.firewall_record_event(public.firewall_event_layer,public.firewall_action,text,jsonb,uuid,uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.firewall_release_quarantine(uuid,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.firewall_block_quarantine(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.firewall_evaluate_file(text,text,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.firewall_evaluate_url(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.firewall_record_event(public.firewall_event_layer,public.firewall_action,text,jsonb,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.firewall_release_quarantine(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.firewall_block_quarantine(uuid,text) TO authenticated;
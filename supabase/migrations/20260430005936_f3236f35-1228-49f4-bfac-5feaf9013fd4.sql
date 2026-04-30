-- ═══════════════════════════════════════════════════════════════════════════════
-- INTERLINK: Scheduled auto-dispatches, attachment rule presets,
-- approval workflow + immutable approval audit log.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Attachment rule presets ────────────────────────────────────────────────
CREATE TABLE public.interlink_attachment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  -- Which approved-report categories to include (e.g. ['daily','weekly','staff'])
  include_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- Categories to explicitly exclude (overrides include)
  exclude_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- File-type whitelist (extensions, lowercase, no dot). Empty = all allowed.
  allowed_file_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  max_files integer NOT NULL DEFAULT 10 CHECK (max_files BETWEEN 1 AND 50),
  max_total_mb integer NOT NULL DEFAULT 25 CHECK (max_total_mb BETWEEN 1 AND 100),
  -- Cover page
  cover_page_enabled boolean NOT NULL DEFAULT false,
  cover_page_title text,
  cover_page_body text,
  -- File naming template, supports tokens: {kind} {date} {scope} {seq} {orig}
  filename_template text NOT NULL DEFAULT '{orig}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX interlink_attachment_rules_name_idx ON public.interlink_attachment_rules (lower(name));

ALTER TABLE public.interlink_attachment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command reads attachment rules"
  ON public.interlink_attachment_rules FOR SELECT TO authenticated
  USING (public.is_command_tier(auth.uid()));

CREATE POLICY "Command manages attachment rules"
  ON public.interlink_attachment_rules FOR ALL TO authenticated
  USING (public.is_command_tier(auth.uid()))
  WITH CHECK (public.is_command_tier(auth.uid()) AND created_by = auth.uid());

CREATE TRIGGER trg_interlink_rules_updated
  BEFORE UPDATE ON public.interlink_attachment_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 2. Scheduled auto-dispatches ──────────────────────────────────────────────
CREATE TABLE public.interlink_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  -- Cadence
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  -- HH:MM (24h, server TZ Africa/Accra)
  run_time text NOT NULL DEFAULT '08:00' CHECK (run_time ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'),
  -- 0=Sunday..6=Saturday for weekly
  day_of_week smallint CHECK (day_of_week BETWEEN 0 AND 6),
  -- 1..28 for monthly (cap at 28 to avoid month-end edge cases)
  day_of_month smallint CHECK (day_of_month BETWEEN 1 AND 28),
  -- Dispatch composition
  scope text NOT NULL CHECK (scope IN ('intranet','internet','extranet','mixed')),
  report_kind text NOT NULL CHECK (report_kind IN ('staff','daily','weekly','monthly','annual','all','custom')),
  subject_template text NOT NULL,
  message_template text,
  attachment_rule_id uuid REFERENCES public.interlink_attachment_rules(id) ON DELETE SET NULL,
  -- Recipients (mirrors compose model)
  recipient_dept_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  recipient_list_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  recipient_contact_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  recipient_adhoc_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- Approval chain (configurable per schedule)
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requires_per_run_approval boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX interlink_schedules_next_run_idx ON public.interlink_schedules (next_run_at) WHERE is_active = true;
CREATE INDEX interlink_schedules_active_idx ON public.interlink_schedules (is_active);

ALTER TABLE public.interlink_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command reads schedules"
  ON public.interlink_schedules FOR SELECT TO authenticated
  USING (public.is_command_tier(auth.uid()));

CREATE POLICY "Command manages schedules"
  ON public.interlink_schedules FOR ALL TO authenticated
  USING (public.is_command_tier(auth.uid()))
  WITH CHECK (public.is_command_tier(auth.uid()) AND created_by = auth.uid());

CREATE TRIGGER trg_interlink_schedules_updated
  BEFORE UPDATE ON public.interlink_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 3. Approval workflow columns on dispatches ───────────────────────────────
ALTER TABLE public.interlink_dispatches
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.interlink_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attachment_rule_id uuid REFERENCES public.interlink_attachment_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','scheduled')),
  ADD COLUMN IF NOT EXISTS workflow_state text NOT NULL DEFAULT 'sent' CHECK (workflow_state IN ('draft','review','approved','rejected','sent','failed')),
  ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

-- Drop old status check (allow new states alongside legacy 'sent','partial','failed','pending')
ALTER TABLE public.interlink_dispatches
  DROP CONSTRAINT IF EXISTS interlink_dispatches_status_check;
ALTER TABLE public.interlink_dispatches
  ADD CONSTRAINT interlink_dispatches_status_check
  CHECK (status IN ('pending','sent','partial','failed','draft','awaiting_review','awaiting_approval','rejected'));

CREATE INDEX IF NOT EXISTS interlink_dispatches_workflow_idx ON public.interlink_dispatches (workflow_state);
CREATE INDEX IF NOT EXISTS interlink_dispatches_schedule_idx ON public.interlink_dispatches (schedule_id);

-- ─── 4. Immutable approval action audit log ───────────────────────────────────
CREATE TABLE public.interlink_approval_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.interlink_dispatches(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN (
    'submitted_for_review','reviewed','approved','rejected','sent','auto_drafted','recalled'
  )),
  performed_by uuid NOT NULL,
  performer_role text,
  from_state text,
  to_state text,
  comment text,
  prev_hash text,
  entry_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX interlink_approval_actions_dispatch_idx ON public.interlink_approval_actions (dispatch_id, created_at);
CREATE INDEX interlink_approval_actions_created_idx ON public.interlink_approval_actions (created_at DESC);

ALTER TABLE public.interlink_approval_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command reads approval actions"
  ON public.interlink_approval_actions FOR SELECT TO authenticated
  USING (public.is_command_tier(auth.uid()));

CREATE POLICY "Authenticated inserts approval actions for self"
  ON public.interlink_approval_actions FOR INSERT TO authenticated
  WITH CHECK (performed_by = auth.uid() AND public.is_command_tier(auth.uid()));

-- Block updates and deletes — fully immutable (tamper-evident hash chain)
CREATE POLICY "No updates to approval actions"
  ON public.interlink_approval_actions FOR UPDATE TO authenticated
  USING (false);
CREATE POLICY "No deletes of approval actions"
  ON public.interlink_approval_actions FOR DELETE TO authenticated
  USING (false);

-- Hash-chain trigger (mirrors threshold audit pattern)
CREATE OR REPLACE FUNCTION public.set_interlink_approval_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _prev text;
  _payload text;
BEGIN
  SELECT entry_hash INTO _prev
    FROM public.interlink_approval_actions
    WHERE entry_hash IS NOT NULL
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

  NEW.prev_hash := _prev;
  _payload := COALESCE(_prev,'') || '|' ||
              COALESCE(NEW.id::text,'') || '|' ||
              COALESCE(NEW.dispatch_id::text,'') || '|' ||
              COALESCE(NEW.action,'') || '|' ||
              COALESCE(NEW.performed_by::text,'') || '|' ||
              COALESCE(NEW.performer_role,'') || '|' ||
              COALESCE(NEW.from_state,'') || '|' ||
              COALESCE(NEW.to_state,'') || '|' ||
              COALESCE(NEW.comment,'') || '|' ||
              COALESCE(NEW.created_at::text,'');
  NEW.entry_hash := encode(digest(_payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_interlink_approval_hash
  BEFORE INSERT ON public.interlink_approval_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_interlink_approval_hash();

-- Verification helper
CREATE OR REPLACE FUNCTION public.verify_interlink_approval_chain()
RETURNS TABLE(total bigint, verified bigint, first_break_id uuid, first_break_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _row RECORD;
  _prev text := NULL;
  _expected text;
  _verified bigint := 0;
  _total bigint := 0;
  _break_id uuid := NULL;
  _break_at timestamptz := NULL;
BEGIN
  FOR _row IN
    SELECT * FROM public.interlink_approval_actions ORDER BY created_at ASC, id ASC
  LOOP
    _total := _total + 1;
    _expected := encode(digest(
      COALESCE(_prev,'') || '|' ||
      COALESCE(_row.id::text,'') || '|' ||
      COALESCE(_row.dispatch_id::text,'') || '|' ||
      COALESCE(_row.action,'') || '|' ||
      COALESCE(_row.performed_by::text,'') || '|' ||
      COALESCE(_row.performer_role,'') || '|' ||
      COALESCE(_row.from_state,'') || '|' ||
      COALESCE(_row.to_state,'') || '|' ||
      COALESCE(_row.comment,'') || '|' ||
      COALESCE(_row.created_at::text,'')
    , 'sha256'), 'hex');
    IF _row.entry_hash = _expected AND COALESCE(_row.prev_hash,'') = COALESCE(_prev,'') THEN
      _verified := _verified + 1;
    ELSIF _break_id IS NULL THEN
      _break_id := _row.id;
      _break_at := _row.created_at;
    END IF;
    _prev := _row.entry_hash;
  END LOOP;
  total := _total; verified := _verified;
  first_break_id := _break_id; first_break_at := _break_at;
  RETURN NEXT;
END;
$$;

-- ─── 5. Realtime ──────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.interlink_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.interlink_approval_actions;

-- ─── 6. Helper RPC: compute next_run_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_interlink_next_run(
  _frequency text,
  _run_time text,
  _day_of_week smallint,
  _day_of_month smallint,
  _from timestamptz DEFAULT now()
) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  _hh int := split_part(_run_time, ':', 1)::int;
  _mm int := split_part(_run_time, ':', 2)::int;
  _base date := (_from AT TIME ZONE 'Africa/Accra')::date;
  _candidate timestamptz;
  _i int;
BEGIN
  IF _frequency = 'daily' THEN
    _candidate := (_base + make_interval(hours => _hh, mins => _mm)) AT TIME ZONE 'Africa/Accra';
    IF _candidate <= _from THEN
      _candidate := ((_base + 1) + make_interval(hours => _hh, mins => _mm)) AT TIME ZONE 'Africa/Accra';
    END IF;
    RETURN _candidate;
  ELSIF _frequency = 'weekly' THEN
    FOR _i IN 0..7 LOOP
      IF EXTRACT(DOW FROM (_base + _i))::int = COALESCE(_day_of_week, 1) THEN
        _candidate := ((_base + _i) + make_interval(hours => _hh, mins => _mm)) AT TIME ZONE 'Africa/Accra';
        IF _candidate > _from THEN RETURN _candidate; END IF;
      END IF;
    END LOOP;
    RETURN ((_base + 7) + make_interval(hours => _hh, mins => _mm)) AT TIME ZONE 'Africa/Accra';
  ELSIF _frequency = 'monthly' THEN
    _candidate := (date_trunc('month', _base)::date + (COALESCE(_day_of_month, 1) - 1) + make_interval(hours => _hh, mins => _mm)) AT TIME ZONE 'Africa/Accra';
    IF _candidate <= _from THEN
      _candidate := ((date_trunc('month', _base)::date + interval '1 month')::date + (COALESCE(_day_of_month, 1) - 1) + make_interval(hours => _hh, mins => _mm)) AT TIME ZONE 'Africa/Accra';
    END IF;
    RETURN _candidate;
  END IF;
  RETURN NULL;
END;
$$;

-- Auto-set next_run_at on insert/update
CREATE OR REPLACE FUNCTION public.set_interlink_schedule_next_run()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.next_run_at := public.compute_interlink_next_run(
    NEW.frequency, NEW.run_time, NEW.day_of_week, NEW.day_of_month, now()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_interlink_schedule_next_run
  BEFORE INSERT OR UPDATE OF frequency, run_time, day_of_week, day_of_month, is_active
  ON public.interlink_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_interlink_schedule_next_run();
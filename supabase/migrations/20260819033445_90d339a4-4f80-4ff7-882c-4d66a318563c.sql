-- ============================================================
-- COMMAND CONSOLE INBOX — officer-raised alerts with audit trail
-- ============================================================
CREATE TYPE public.command_alert_status AS ENUM ('new', 'assigned', 'in_progress', 'escalated', 'closed');
CREATE TYPE public.command_alert_severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');

CREATE TABLE public.command_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  title text NOT NULL,
  detail text,
  category text NOT NULL DEFAULT 'general',
  severity public.command_alert_severity NOT NULL DEFAULT 'medium',
  status public.command_alert_status NOT NULL DEFAULT 'new',
  location text,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  assigned_to uuid,
  assigned_at timestamptz,
  assigned_by uuid,
  due_at timestamptz,
  closed_at timestamptz,
  closed_by uuid,
  closing_notes text,
  source_ref text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.command_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.command_alerts(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status public.command_alert_status,
  to_status public.command_alert_status,
  assigned_to uuid,
  note text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.command_alerts TO authenticated;
GRANT ALL ON public.command_alerts TO service_role;
GRANT SELECT ON public.command_alert_events TO authenticated;
GRANT ALL ON public.command_alert_events TO service_role;

CREATE INDEX idx_command_alerts_status ON public.command_alerts (status, created_at DESC);
CREATE INDEX idx_command_alerts_unit ON public.command_alerts (org_unit_id);
CREATE INDEX idx_command_alerts_assignee ON public.command_alerts (assigned_to);
CREATE INDEX idx_command_alert_events_alert ON public.command_alert_events (alert_id, created_at DESC);

ALTER TABLE public.command_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.command_alert_events ENABLE ROW LEVEL SECURITY;

-- Visibility: command tier within reach, the raiser, or the assignee.
CREATE OR REPLACE FUNCTION public.can_view_command_alert(_user_id uuid, _alert_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.command_alerts a
    WHERE a.id = _alert_id
      AND (
        a.assigned_to = _user_id
        OR a.created_by = _user_id
        OR (public.is_command_tier(_user_id)
            AND (a.org_unit_id IS NULL OR public.can_view_org_unit(_user_id, a.org_unit_id)))
      )
  )
$$;

CREATE POLICY "Command tier and involved staff can read command alerts"
  ON public.command_alerts FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR (public.is_command_tier(auth.uid())
        AND (org_unit_id IS NULL OR public.can_view_org_unit(auth.uid(), org_unit_id)))
  );

CREATE POLICY "Command tier can raise command alerts"
  ON public.command_alerts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_command_tier(auth.uid())
    AND created_by = auth.uid()
    AND (org_unit_id IS NULL OR public.can_view_org_unit(auth.uid(), org_unit_id))
  );

CREATE POLICY "Command tier can manage command alerts"
  ON public.command_alerts FOR UPDATE TO authenticated
  USING (
    public.is_command_tier(auth.uid())
    AND (org_unit_id IS NULL OR public.can_view_org_unit(auth.uid(), org_unit_id))
  )
  WITH CHECK (
    public.is_command_tier(auth.uid())
    AND (org_unit_id IS NULL OR public.can_view_org_unit(auth.uid(), org_unit_id))
  );

CREATE POLICY "Involved staff can read the command alert trail"
  ON public.command_alert_events FOR SELECT TO authenticated
  USING (public.can_view_command_alert(auth.uid(), alert_id));

-- Trail rows are written by security-definer RPCs only, and never changed.
CREATE OR REPLACE FUNCTION public.block_command_alert_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Command alert trail entries are immutable';
END;
$$;

CREATE TRIGGER command_alert_events_immutable
  BEFORE UPDATE OR DELETE ON public.command_alert_events
  FOR EACH ROW EXECUTE FUNCTION public.block_command_alert_event_mutation();

CREATE TRIGGER command_alerts_touch
  BEFORE UPDATE ON public.command_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Reference numbers: CMD-YYYY-000123 ────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.command_alert_reference_seq;
GRANT USAGE ON SEQUENCE public.command_alert_reference_seq TO authenticated, service_role;

-- ── Raise ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.command_alert_create(
  _title text,
  _detail text DEFAULT NULL,
  _severity public.command_alert_severity DEFAULT 'medium',
  _category text DEFAULT 'general',
  _org_unit_id uuid DEFAULT NULL,
  _location text DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _due_at timestamptz DEFAULT NULL,
  _source_ref text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  actor uuid := auth.uid();
BEGIN
  IF NOT public.is_command_tier(actor) THEN
    RAISE EXCEPTION 'You are not authorised to raise command alerts';
  END IF;
  IF coalesce(btrim(_title), '') = '' THEN
    RAISE EXCEPTION 'An alert title is required';
  END IF;
  IF _org_unit_id IS NOT NULL AND NOT public.can_view_org_unit(actor, _org_unit_id) THEN
    RAISE EXCEPTION 'That command is outside your reach';
  END IF;

  INSERT INTO public.command_alerts (
    reference, title, detail, category, severity, status, location, org_unit_id,
    assigned_to, assigned_at, assigned_by, due_at, source_ref, created_by
  ) VALUES (
    'CMD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.command_alert_reference_seq')::text, 5, '0'),
    btrim(_title), nullif(btrim(coalesce(_detail, '')), ''), coalesce(nullif(btrim(_category), ''), 'general'),
    _severity,
    CASE WHEN _assigned_to IS NULL THEN 'new'::public.command_alert_status ELSE 'assigned'::public.command_alert_status END,
    nullif(btrim(coalesce(_location, '')), ''), _org_unit_id,
    _assigned_to,
    CASE WHEN _assigned_to IS NULL THEN NULL ELSE now() END,
    CASE WHEN _assigned_to IS NULL THEN NULL ELSE actor END,
    _due_at, nullif(btrim(coalesce(_source_ref, '')), ''), actor
  )
  RETURNING id INTO new_id;

  INSERT INTO public.command_alert_events (alert_id, action, to_status, assigned_to, note, actor_id)
  VALUES (new_id, 'created',
          CASE WHEN _assigned_to IS NULL THEN 'new'::public.command_alert_status ELSE 'assigned'::public.command_alert_status END,
          _assigned_to, nullif(btrim(coalesce(_detail, '')), ''), actor);

  RETURN new_id;
END;
$$;

-- ── Assign / reassign ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.command_alert_assign(
  _alert_id uuid,
  _assigned_to uuid,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  rec public.command_alerts;
BEGIN
  SELECT * INTO rec FROM public.command_alerts WHERE id = _alert_id;
  IF rec.id IS NULL THEN
    RAISE EXCEPTION 'Alert not found';
  END IF;
  IF NOT public.is_command_tier(actor)
     OR (rec.org_unit_id IS NOT NULL AND NOT public.can_view_org_unit(actor, rec.org_unit_id)) THEN
    RAISE EXCEPTION 'You are not authorised to assign this alert';
  END IF;
  IF rec.status = 'closed' THEN
    RAISE EXCEPTION 'This alert is closed — reopen it before reassigning';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _assigned_to) THEN
    RAISE EXCEPTION 'Select a registered staff member to assign';
  END IF;

  UPDATE public.command_alerts
  SET assigned_to = _assigned_to,
      assigned_at = now(),
      assigned_by = actor,
      status = CASE WHEN status = 'new' THEN 'assigned'::public.command_alert_status ELSE status END
  WHERE id = _alert_id;

  INSERT INTO public.command_alert_events (alert_id, action, from_status, to_status, assigned_to, note, actor_id)
  VALUES (_alert_id, 'assigned', rec.status,
          CASE WHEN rec.status = 'new' THEN 'assigned'::public.command_alert_status ELSE rec.status END,
          _assigned_to, nullif(btrim(coalesce(_note, '')), ''), actor);
END;
$$;

-- ── Status change / close / reopen / progress note ─────────────
CREATE OR REPLACE FUNCTION public.command_alert_set_status(
  _alert_id uuid,
  _status public.command_alert_status,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  rec public.command_alerts;
  is_cmd boolean;
BEGIN
  SELECT * INTO rec FROM public.command_alerts WHERE id = _alert_id;
  IF rec.id IS NULL THEN
    RAISE EXCEPTION 'Alert not found';
  END IF;

  is_cmd := public.is_command_tier(actor)
            AND (rec.org_unit_id IS NULL OR public.can_view_org_unit(actor, rec.org_unit_id));

  -- Assignees may move their own alert to in_progress or escalated; only
  -- command tier may close or reopen.
  IF NOT is_cmd THEN
    IF rec.assigned_to IS DISTINCT FROM actor OR _status NOT IN ('in_progress', 'escalated') THEN
      RAISE EXCEPTION 'You are not authorised to change this alert';
    END IF;
  END IF;

  IF _status = 'closed' AND coalesce(btrim(coalesce(_note, '')), '') = '' THEN
    RAISE EXCEPTION 'A closing note is required';
  END IF;

  UPDATE public.command_alerts
  SET status = _status,
      closed_at = CASE WHEN _status = 'closed' THEN now() ELSE NULL END,
      closed_by = CASE WHEN _status = 'closed' THEN actor ELSE NULL END,
      closing_notes = CASE WHEN _status = 'closed' THEN btrim(_note) ELSE closing_notes END
  WHERE id = _alert_id;

  INSERT INTO public.command_alert_events (alert_id, action, from_status, to_status, note, actor_id)
  VALUES (_alert_id,
          CASE WHEN _status = 'closed' THEN 'closed'
               WHEN rec.status = 'closed' THEN 'reopened'
               ELSE 'status_changed' END,
          rec.status, _status, nullif(btrim(coalesce(_note, '')), ''), actor);
END;
$$;

CREATE OR REPLACE FUNCTION public.command_alert_add_note(_alert_id uuid, _note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF coalesce(btrim(coalesce(_note, '')), '') = '' THEN
    RAISE EXCEPTION 'A note is required';
  END IF;
  IF NOT public.can_view_command_alert(actor, _alert_id) THEN
    RAISE EXCEPTION 'You are not authorised to update this alert';
  END IF;

  INSERT INTO public.command_alert_events (alert_id, action, note, actor_id)
  VALUES (_alert_id, 'note', btrim(_note), actor);
END;
$$;

REVOKE ALL ON FUNCTION public.command_alert_create(text, text, public.command_alert_severity, text, uuid, text, uuid, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.command_alert_assign(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.command_alert_set_status(uuid, public.command_alert_status, text) FROM anon;
REVOKE ALL ON FUNCTION public.command_alert_add_note(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.can_view_command_alert(uuid, uuid) FROM anon;
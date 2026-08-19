CREATE TABLE IF NOT EXISTS public.fuel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE,
  vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  branch text,
  fuel_type text NOT NULL DEFAULT 'petrol',
  litres_requested numeric NOT NULL CHECK (litres_requested > 0),
  litres_issued numeric,
  odometer_km numeric,
  estimated_cost_ghs numeric,
  purpose text NOT NULL,
  urgency text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'submitted',
  requested_by uuid,
  requested_by_name text,
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  issued_by uuid,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fuel_requests_status ON public.fuel_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_requests_vehicle ON public.fuel_requests (vehicle_id);

GRANT SELECT, INSERT, UPDATE ON public.fuel_requests TO authenticated;
GRANT ALL ON public.fuel_requests TO service_role;

ALTER TABLE public.fuel_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fuel requests readable by owner or command tier"
  ON public.fuel_requests FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.is_command_tier(auth.uid())
    OR public.can_manage_procurement(auth.uid())
    OR public.can_manage_fleet(auth.uid())
  );

CREATE POLICY "Staff can raise fuel requests"
  ON public.fuel_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Owner can edit own submitted request"
  ON public.fuel_requests FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() AND status = 'submitted')
  WITH CHECK (requested_by = auth.uid() AND status = 'submitted');

CREATE TABLE IF NOT EXISTS public.fuel_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.fuel_requests(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text,
  to_status text,
  note text,
  actor_id uuid,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fuel_request_events_request ON public.fuel_request_events (request_id, created_at DESC);

GRANT SELECT ON public.fuel_request_events TO authenticated;
GRANT ALL ON public.fuel_request_events TO service_role;

ALTER TABLE public.fuel_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fuel request audit readable with the request"
  ON public.fuel_request_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fuel_requests r
     WHERE r.id = request_id
       AND (r.requested_by = auth.uid()
            OR public.is_command_tier(auth.uid())
            OR public.can_manage_procurement(auth.uid())
            OR public.can_manage_fleet(auth.uid()))
  ));

CREATE OR REPLACE FUNCTION public.block_fuel_request_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Fuel request audit entries are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_fuel_request_events_immutable ON public.fuel_request_events;
CREATE TRIGGER trg_fuel_request_events_immutable
  BEFORE UPDATE OR DELETE ON public.fuel_request_events
  FOR EACH ROW EXECUTE FUNCTION public.block_fuel_request_event_mutation();

CREATE TRIGGER trg_fuel_requests_updated_at
  BEFORE UPDATE ON public.fuel_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.can_approve_fuel_request(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_command_tier(_user_id)
      OR public.can_manage_procurement(_user_id)
      OR public.can_manage_fleet(_user_id);
$$;

REVOKE ALL ON FUNCTION public.can_approve_fuel_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_approve_fuel_request(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fuel_request_create(
  _vehicle_id uuid,
  _litres numeric,
  _purpose text,
  _fuel_type text DEFAULT 'petrol',
  _urgency text DEFAULT 'normal',
  _odometer_km numeric DEFAULT NULL,
  _estimated_cost_ghs numeric DEFAULT NULL,
  _org_unit_id uuid DEFAULT NULL,
  _branch text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_no text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF coalesce(_litres, 0) <= 0 THEN RAISE EXCEPTION 'Litres must be greater than zero'; END IF;
  IF coalesce(btrim(_purpose), '') = '' THEN RAISE EXCEPTION 'Purpose is required'; END IF;

  SELECT coalesce(full_name, email) INTO v_name FROM public.profiles WHERE id = v_uid;
  v_no := 'FR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  INSERT INTO public.fuel_requests
    (request_number, vehicle_id, org_unit_id, branch, fuel_type, litres_requested,
     odometer_km, estimated_cost_ghs, purpose, urgency, status, requested_by, requested_by_name)
  VALUES
    (v_no, _vehicle_id, _org_unit_id, _branch, coalesce(_fuel_type, 'petrol'), _litres,
     _odometer_km, _estimated_cost_ghs, btrim(_purpose), coalesce(_urgency, 'normal'),
     'submitted', v_uid, v_name)
  RETURNING id INTO v_id;

  INSERT INTO public.fuel_request_events (request_id, action, from_status, to_status, note, actor_id, actor_name)
  VALUES (v_id, 'submitted', NULL, 'submitted', btrim(_purpose), v_uid, v_name);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fuel_request_create(uuid, numeric, text, text, text, numeric, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fuel_request_create(uuid, numeric, text, text, text, numeric, numeric, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fuel_request_set_status(
  _request_id uuid,
  _action text,
  _note text DEFAULT NULL,
  _litres_issued numeric DEFAULT NULL,
  _odometer_km numeric DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_req public.fuel_requests;
  v_to text;
  v_litres numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM public.fuel_requests WHERE id = _request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Fuel request not found'; END IF;

  SELECT coalesce(full_name, email) INTO v_name FROM public.profiles WHERE id = v_uid;

  IF _action = 'cancel' THEN
    IF NOT (v_req.requested_by = v_uid OR public.can_approve_fuel_request(v_uid)) THEN
      RAISE EXCEPTION 'Not permitted to cancel this request';
    END IF;
    IF v_req.status NOT IN ('submitted', 'approved') THEN
      RAISE EXCEPTION 'Only open requests can be cancelled';
    END IF;
    v_to := 'cancelled';
  ELSE
    IF NOT public.can_approve_fuel_request(v_uid) THEN
      RAISE EXCEPTION 'Command, fleet or procurement authority required';
    END IF;

    IF _action = 'approve' THEN
      IF v_req.status <> 'submitted' THEN RAISE EXCEPTION 'Only submitted requests can be approved'; END IF;
      v_to := 'approved';
    ELSIF _action = 'reject' THEN
      IF v_req.status <> 'submitted' THEN RAISE EXCEPTION 'Only submitted requests can be rejected'; END IF;
      v_to := 'rejected';
    ELSIF _action = 'issue' THEN
      IF v_req.status <> 'approved' THEN RAISE EXCEPTION 'Only approved requests can be issued'; END IF;
      v_to := 'issued';
    ELSE
      RAISE EXCEPTION 'Unknown action %', _action;
    END IF;
  END IF;

  v_litres := coalesce(_litres_issued, v_req.litres_requested);

  UPDATE public.fuel_requests
     SET status = v_to,
         reviewed_by = CASE WHEN v_to IN ('approved', 'rejected') THEN v_uid ELSE reviewed_by END,
         reviewed_by_name = CASE WHEN v_to IN ('approved', 'rejected') THEN v_name ELSE reviewed_by_name END,
         reviewed_at = CASE WHEN v_to IN ('approved', 'rejected') THEN now() ELSE reviewed_at END,
         review_note = coalesce(_note, review_note),
         litres_issued = CASE WHEN v_to = 'issued' THEN v_litres ELSE litres_issued END,
         odometer_km = coalesce(_odometer_km, odometer_km),
         issued_by = CASE WHEN v_to = 'issued' THEN v_uid ELSE issued_by END,
         issued_at = CASE WHEN v_to = 'issued' THEN now() ELSE issued_at END,
         updated_at = now()
   WHERE id = _request_id;

  INSERT INTO public.fuel_request_events (request_id, action, from_status, to_status, note, actor_id, actor_name)
  VALUES (_request_id, _action, v_req.status, v_to, _note, v_uid, v_name);

  IF v_to = 'issued' AND v_req.vehicle_id IS NOT NULL THEN
    INSERT INTO public.fleet_fuel_readings
      (vehicle_id, event_type, litres, delta_litres, odometer_km, cost_ghs, notes, recorded_by)
    VALUES
      (v_req.vehicle_id, 'refuel', v_litres, v_litres,
       coalesce(_odometer_km, v_req.odometer_km),
       v_req.estimated_cost_ghs,
       format('Fuel request %s issued', v_req.request_number), v_uid);
  END IF;

  RETURN v_to;
END;
$$;

REVOKE ALL ON FUNCTION public.fuel_request_set_status(uuid, text, text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fuel_request_set_status(uuid, text, text, numeric, numeric) TO authenticated, service_role;
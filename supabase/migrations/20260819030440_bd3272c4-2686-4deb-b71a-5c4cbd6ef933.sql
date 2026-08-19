-- Allow app-side position submission (offline sync flush) for fleet managers and assigned drivers
DROP POLICY IF EXISTS "Fleet users record positions" ON public.fleet_positions;
CREATE POLICY "Fleet users record positions"
ON public.fleet_positions
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_manage_fleet(auth.uid())
  OR vehicle_id IN (
    SELECT v.id FROM public.fleet_vehicles v
    JOIN public.profiles p ON p.id = v.assigned_driver_id
    WHERE p.user_id = auth.uid()
  )
);

GRANT INSERT ON public.fleet_positions TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_raise_panic(
  _vehicle_id uuid,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.fleet_vehicles;
  me uuid := auth.uid();
  allowed boolean;
  alert_id uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = _vehicle_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Vehicle not found'; END IF;

  SELECT public.can_manage_fleet(me)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v.assigned_driver_id AND p.user_id = me)
    INTO allowed;
  IF NOT allowed THEN RAISE EXCEPTION 'You are not authorised to raise an emergency for this vehicle'; END IF;

  INSERT INTO public.fleet_alerts (vehicle_id, alert_type, severity, message, lat, lng, raised_by, metadata)
  VALUES (_vehicle_id, 'panic', 'critical',
    'PANIC / SOS raised for ' || v.registration_number || COALESCE(' — ' || _note, ''),
    COALESCE(_lat, v.last_lat), COALESCE(_lng, v.last_lng), me,
    jsonb_build_object('note', _note))
  RETURNING id INTO alert_id;

  -- Mirror the emergency into the session activity trail so command staff see it
  -- alongside session events in Session Management.
  INSERT INTO public.session_action_audit (action, actor_id, target_user_id, sessions_affected, reason, details)
  VALUES (
    'fleet_panic',
    me,
    me,
    0,
    COALESCE(_note, 'Panic / SOS raised from fleet console'),
    jsonb_build_object(
      'alert_id', alert_id,
      'vehicle_id', v.id,
      'registration_number', v.registration_number,
      'call_sign', v.call_sign,
      'lat', COALESCE(_lat, v.last_lat),
      'lng', COALESCE(_lng, v.last_lng)
    )
  );

  RETURN alert_id;
END;
$$;
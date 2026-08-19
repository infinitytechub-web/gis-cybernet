-- ============ 1. VEHICLE STATE: immobilizer + demo flag ============
ALTER TABLE public.fleet_vehicles
  ADD COLUMN IF NOT EXISTS immobilized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS immobilizer_state text NOT NULL DEFAULT 'unlocked',
  ADD COLUMN IF NOT EXISTS immobilizer_reason text,
  ADD COLUMN IF NOT EXISTS immobilized_at timestamptz,
  ADD COLUMN IF NOT EXISTS immobilized_by uuid,
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_step integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.fleet_guard_immobilizer_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.immobilizer_state NOT IN ('unlocked','lock_pending','locked','unlock_pending','failed') THEN
    RAISE EXCEPTION 'Invalid immobilizer state: %', NEW.immobilizer_state;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fleet_vehicles_immobilizer_state ON public.fleet_vehicles;
CREATE TRIGGER fleet_vehicles_immobilizer_state
BEFORE INSERT OR UPDATE ON public.fleet_vehicles
FOR EACH ROW EXECUTE FUNCTION public.fleet_guard_immobilizer_state();

-- ============ 2. IN-CAB MESSAGING ============
CREATE TABLE IF NOT EXISTS public.fleet_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('driver_to_command','command_to_driver')),
  body text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent','emergency')),
  sender_id uuid,
  sender_label text,
  lat double precision,
  lng double precision,
  read_at timestamptz,
  read_by uuid,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.fleet_messages TO authenticated;
GRANT ALL ON public.fleet_messages TO service_role;

ALTER TABLE public.fleet_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet staff and assigned drivers read vehicle messages"
ON public.fleet_messages FOR SELECT TO authenticated
USING (
  public.can_manage_fleet(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.fleet_vehicles v
    JOIN public.profiles p ON p.id = v.assigned_driver_id
    WHERE v.id = fleet_messages.vehicle_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Fleet staff and assigned drivers send vehicle messages"
ON public.fleet_messages FOR INSERT TO authenticated
WITH CHECK (
  length(btrim(body)) BETWEEN 1 AND 2000
  AND (
    (direction = 'command_to_driver' AND public.can_manage_fleet(auth.uid()))
    OR (
      direction = 'driver_to_command'
      AND EXISTS (
        SELECT 1 FROM public.fleet_vehicles v
        JOIN public.profiles p ON p.id = v.assigned_driver_id
        WHERE v.id = fleet_messages.vehicle_id AND p.user_id = auth.uid()
      )
    )
    OR (direction = 'driver_to_command' AND public.can_manage_fleet(auth.uid()))
  )
);

CREATE POLICY "Fleet staff and assigned drivers mark messages read"
ON public.fleet_messages FOR UPDATE TO authenticated
USING (
  public.can_manage_fleet(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.fleet_vehicles v
    JOIN public.profiles p ON p.id = v.assigned_driver_id
    WHERE v.id = fleet_messages.vehicle_id AND p.user_id = auth.uid()
  )
)
WITH CHECK (true);

-- message bodies are immutable once sent; only receipt fields may change
CREATE OR REPLACE FUNCTION public.fleet_messages_immutable_body()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.body := OLD.body;
  NEW.direction := OLD.direction;
  NEW.vehicle_id := OLD.vehicle_id;
  NEW.sender_id := OLD.sender_id;
  NEW.priority := OLD.priority;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fleet_messages_immutable ON public.fleet_messages;
CREATE TRIGGER fleet_messages_immutable
BEFORE UPDATE ON public.fleet_messages
FOR EACH ROW EXECUTE FUNCTION public.fleet_messages_immutable_body();

CREATE INDEX IF NOT EXISTS fleet_messages_vehicle_created_idx
  ON public.fleet_messages (vehicle_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_messages;

-- ============ 3. IMMOBILIZER AUDIT ============
CREATE TABLE IF NOT EXISTS public.fleet_immobilizer_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  command text NOT NULL CHECK (command IN ('lock','unlock')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed','cancelled')),
  reason text NOT NULL,
  issued_by uuid,
  issued_by_label text,
  lat double precision,
  lng double precision,
  speed_kph numeric(6,2),
  confirmed_at timestamptz,
  result_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fleet_immobilizer_commands TO authenticated;
GRANT ALL ON public.fleet_immobilizer_commands TO service_role;

ALTER TABLE public.fleet_immobilizer_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet staff read immobilizer audit"
ON public.fleet_immobilizer_commands FOR SELECT TO authenticated
USING (public.can_manage_fleet(auth.uid()));

CREATE OR REPLACE FUNCTION public.fleet_block_immobilizer_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Immobilizer audit records are immutable';
END;
$$;

DROP TRIGGER IF EXISTS fleet_immobilizer_immutable ON public.fleet_immobilizer_commands;
CREATE TRIGGER fleet_immobilizer_immutable
BEFORE UPDATE OR DELETE ON public.fleet_immobilizer_commands
FOR EACH ROW EXECUTE FUNCTION public.fleet_block_immobilizer_mutation();

CREATE INDEX IF NOT EXISTS fleet_immobilizer_vehicle_idx
  ON public.fleet_immobilizer_commands (vehicle_id, created_at DESC);

-- ============ 4. RPCs ============
CREATE OR REPLACE FUNCTION public.fleet_send_message(
  _vehicle_id uuid,
  _body text,
  _direction text DEFAULT 'command_to_driver',
  _priority text DEFAULT 'normal',
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_label text;
  v_is_driver boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _direction NOT IN ('driver_to_command','command_to_driver') THEN
    RAISE EXCEPTION 'Invalid message direction';
  END IF;
  IF length(btrim(coalesce(_body,''))) = 0 THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;
  IF length(_body) > 2000 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fleet_vehicles v
    JOIN public.profiles p ON p.id = v.assigned_driver_id
    WHERE v.id = _vehicle_id AND p.user_id = auth.uid()
  ) INTO v_is_driver;

  IF NOT (public.can_manage_fleet(auth.uid()) OR v_is_driver) THEN
    RAISE EXCEPTION 'Not authorised to message this vehicle';
  END IF;
  IF _direction = 'command_to_driver' AND NOT public.can_manage_fleet(auth.uid()) THEN
    RAISE EXCEPTION 'Only fleet command can send messages to a cab';
  END IF;

  SELECT btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    INTO v_label
  FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;

  INSERT INTO public.fleet_messages (
    vehicle_id, direction, body, priority, sender_id, sender_label, lat, lng
  ) VALUES (
    _vehicle_id, _direction, btrim(_body),
    CASE WHEN _priority IN ('normal','urgent','emergency') THEN _priority ELSE 'normal' END,
    auth.uid(), nullif(v_label,''), _lat, _lng
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_send_message(uuid, text, text, text, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_send_message(uuid, text, text, text, double precision, double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_mark_messages_read(_vehicle_id uuid, _direction text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_is_driver boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.fleet_vehicles v
    JOIN public.profiles p ON p.id = v.assigned_driver_id
    WHERE v.id = _vehicle_id AND p.user_id = auth.uid()
  ) INTO v_is_driver;

  IF NOT (public.can_manage_fleet(auth.uid()) OR v_is_driver) THEN
    RAISE EXCEPTION 'Not authorised for this vehicle';
  END IF;

  UPDATE public.fleet_messages m
     SET read_at = now(), read_by = auth.uid(), updated_at = now()
   WHERE m.vehicle_id = _vehicle_id
     AND m.read_at IS NULL
     AND (_direction IS NULL OR m.direction = _direction);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_mark_messages_read(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_mark_messages_read(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_set_immobilizer(
  _vehicle_id uuid,
  _lock boolean,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cmd_id uuid;
  v_vehicle public.fleet_vehicles;
  v_label text;
BEGIN
  IF NOT public.can_manage_fleet(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to immobilise vehicles';
  END IF;
  IF length(btrim(coalesce(_reason,''))) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required';
  END IF;

  SELECT * INTO v_vehicle FROM public.fleet_vehicles WHERE id = _vehicle_id;
  IF v_vehicle.id IS NULL THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;
  IF v_vehicle.immobilized = _lock THEN
    RAISE EXCEPTION 'Vehicle is already %', CASE WHEN _lock THEN 'immobilised' ELSE 'released' END;
  END IF;
  IF _lock AND coalesce(v_vehicle.last_speed_kph, 0) > 20 THEN
    RAISE EXCEPTION 'Vehicle is moving at % km/h — immobilisation is blocked above 20 km/h', round(v_vehicle.last_speed_kph);
  END IF;

  SELECT btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    INTO v_label FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;

  INSERT INTO public.fleet_immobilizer_commands (
    vehicle_id, command, status, reason, issued_by, issued_by_label,
    lat, lng, speed_kph, confirmed_at, result_note
  ) VALUES (
    _vehicle_id, CASE WHEN _lock THEN 'lock' ELSE 'unlock' END, 'confirmed', btrim(_reason),
    auth.uid(), nullif(v_label,''),
    v_vehicle.last_lat, v_vehicle.last_lng, v_vehicle.last_speed_kph, now(),
    'Command acknowledged by tracker'
  )
  RETURNING id INTO v_cmd_id;

  UPDATE public.fleet_vehicles
     SET immobilized = _lock,
         immobilizer_state = CASE WHEN _lock THEN 'locked' ELSE 'unlocked' END,
         immobilizer_reason = btrim(_reason),
         immobilized_at = CASE WHEN _lock THEN now() ELSE NULL END,
         immobilized_by = CASE WHEN _lock THEN auth.uid() ELSE NULL END,
         updated_at = now()
   WHERE id = _vehicle_id;

  -- notify the cab
  INSERT INTO public.fleet_messages (vehicle_id, direction, body, priority, sender_id, sender_label)
  VALUES (
    _vehicle_id, 'command_to_driver',
    CASE WHEN _lock
      THEN 'IMMOBILISER ENGAGED by command. Reason: ' || btrim(_reason) || '. Stop safely and await instructions.'
      ELSE 'IMMOBILISER RELEASED by command. Reason: ' || btrim(_reason) || '. Vehicle cleared for use.' END,
    CASE WHEN _lock THEN 'emergency' ELSE 'urgent' END,
    auth.uid(), nullif(v_label,'')
  );

  INSERT INTO public.session_action_audit (actor_id, action, reason, details)
  VALUES (
    auth.uid(),
    CASE WHEN _lock THEN 'fleet_immobilize' ELSE 'fleet_mobilize' END,
    btrim(_reason),
    jsonb_build_object(
      'command_id', v_cmd_id,
      'vehicle_id', _vehicle_id,
      'registration_number', v_vehicle.registration_number,
      'call_sign', v_vehicle.call_sign,
      'lat', v_vehicle.last_lat,
      'lng', v_vehicle.last_lng
    )
  );

  RETURN v_cmd_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_set_immobilizer(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_set_immobilizer(uuid, boolean, text) TO authenticated;

-- ============ 5. DEMO GPS FEED ============
CREATE OR REPLACE FUNCTION public.fleet_demo_tick(_vehicle_id uuid DEFAULT NULL, _event text DEFAULT 'drive')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.fleet_vehicles;
  v_step integer;
  v_lat double precision;
  v_lng double precision;
  v_speed numeric(6,2);
  v_fuel numeric(6,2);
  v_door boolean := false;
  v_boot boolean := false;
BEGIN
  IF NOT public.can_manage_fleet(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to drive the demo feed';
  END IF;

  SELECT * INTO v FROM public.fleet_vehicles
   WHERE is_demo AND (_vehicle_id IS NULL OR id = _vehicle_id)
   ORDER BY created_at LIMIT 1;

  IF v.id IS NULL THEN
    RAISE EXCEPTION 'No demo vehicle configured';
  END IF;

  v_step := coalesce(v.demo_step, 0) + 1;
  -- simple loop around the Amasaman corridor
  v_lat := 5.7050 + 0.0035 * sin(v_step::numeric / 4.0);
  v_lng := -0.3110 + 0.0045 * cos(v_step::numeric / 4.0);
  v_speed := 34 + (v_step % 5) * 6;
  v_fuel := greatest(6, coalesce(v.last_fuel_level_pct, 92) - 1.5);

  IF _event = 'speeding' THEN
    v_speed := coalesce(v.speed_limit_kph, 80) + 28;
  ELSIF _event = 'fuel_drop' THEN
    v_fuel := greatest(4, coalesce(v.last_fuel_level_pct, 92) - 24);
  ELSIF _event = 'stop' THEN
    v_speed := 0;
    v_lat := coalesce(v.last_lat, v_lat);
    v_lng := coalesce(v.last_lng, v_lng);
  ELSIF _event = 'door' THEN
    v_door := true;
  ELSIF _event = 'boot' THEN
    v_boot := true;
  END IF;

  INSERT INTO public.fleet_positions (
    vehicle_id, lat, lng, speed_kph, heading, ignition, fuel_level_pct,
    door_open, boot_open, recorded_at, source
  ) VALUES (
    v.id, v_lat, v_lng, v_speed, (v_step * 27) % 360, _event <> 'stop', v_fuel,
    v_door, v_boot, now(), 'demo'
  );

  UPDATE public.fleet_vehicles SET demo_step = v_step WHERE id = v.id;

  RETURN jsonb_build_object(
    'vehicle_id', v.id,
    'registration_number', v.registration_number,
    'step', v_step,
    'lat', v_lat,
    'lng', v_lng,
    'speed_kph', v_speed,
    'fuel_level_pct', v_fuel,
    'event', _event
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_demo_tick(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_demo_tick(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
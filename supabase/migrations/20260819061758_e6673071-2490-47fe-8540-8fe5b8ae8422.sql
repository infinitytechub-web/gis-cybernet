-- ═══════════ FLEET TRACKER KEY MANAGEMENT + FEED READINESS ═══════════

-- Mint a tracker ingest key. Returns the plaintext ONCE; only the SHA-256 hash
-- is persisted, matching the hashing the fleet-ingest endpoint performs.
CREATE OR REPLACE FUNCTION public.fleet_create_ingest_key(
  _label text,
  _vehicle_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, label text, api_key text, vehicle_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_key text;
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can create tracker keys';
  END IF;

  IF _label IS NULL OR btrim(_label) = '' THEN
    RAISE EXCEPTION 'A key label is required';
  END IF;

  IF _vehicle_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.fleet_vehicles v WHERE v.id = _vehicle_id) THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  v_key := 'gisfk_' || encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.fleet_ingest_keys (label, key_hash, vehicle_id, active, created_by)
  VALUES (
    btrim(_label),
    encode(extensions.digest(v_key, 'sha256'), 'hex'),
    _vehicle_id,
    true,
    auth.uid()
  )
  RETURNING public.fleet_ingest_keys.id INTO v_id;

  RETURN QUERY SELECT v_id, btrim(_label), v_key, _vehicle_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_create_ingest_key(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_create_ingest_key(text, uuid) TO authenticated;

-- Revoke (or reactivate) a tracker key.
CREATE OR REPLACE FUNCTION public.fleet_set_ingest_key_active(_id uuid, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change tracker keys';
  END IF;

  UPDATE public.fleet_ingest_keys
     SET active = COALESCE(_active, false)
   WHERE id = _id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tracker key not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_set_ingest_key_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_set_ingest_key_active(uuid, boolean) TO authenticated;

-- Tracker keys without ever exposing the hash.
CREATE OR REPLACE FUNCTION public.fleet_list_ingest_keys()
RETURNS TABLE (
  id uuid,
  label text,
  vehicle_id uuid,
  registration_number text,
  call_sign text,
  active boolean,
  last_used_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT k.id, k.label, k.vehicle_id, v.registration_number, v.call_sign,
         k.active, k.last_used_at, k.created_at
  FROM public.fleet_ingest_keys k
  LEFT JOIN public.fleet_vehicles v ON v.id = k.vehicle_id
  WHERE public.can_manage_fleet(auth.uid())
  ORDER BY k.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.fleet_list_ingest_keys() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_list_ingest_keys() TO authenticated;

-- Per-vehicle onboarding / feed readiness so the dashboard can explain zeros.
CREATE OR REPLACE FUNCTION public.fleet_feed_readiness()
RETURNS TABLE (
  vehicle_id uuid,
  registration_number text,
  call_sign text,
  status text,
  device_id text,
  org_unit_id uuid,
  org_unit_name text,
  driver_name text,
  has_key boolean,
  last_position_at timestamptz,
  positions_24h bigint,
  fuel_readings_24h bigint,
  geofence_events_7d bigint,
  feed_state text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT v.id,
         v.registration_number,
         v.call_sign,
         v.status::text,
         v.device_id,
         v.org_unit_id,
         u.name,
         NULLIF(btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
         EXISTS (SELECT 1 FROM public.fleet_ingest_keys k
                  WHERE k.active AND (k.vehicle_id = v.id OR k.vehicle_id IS NULL)),
         (SELECT max(fp.recorded_at) FROM public.fleet_positions fp WHERE fp.vehicle_id = v.id),
         (SELECT count(*) FROM public.fleet_positions fp
           WHERE fp.vehicle_id = v.id AND fp.recorded_at > now() - interval '24 hours'),
         (SELECT count(*) FROM public.fleet_fuel_readings fr
           WHERE fr.vehicle_id = v.id AND fr.recorded_at > now() - interval '24 hours'),
         (SELECT count(*) FROM public.fleet_geofence_events ge
           WHERE ge.vehicle_id = v.id AND ge.occurred_at > now() - interval '7 days'),
         CASE
           WHEN v.device_id IS NULL OR btrim(v.device_id) = '' THEN 'no_device'
           WHEN NOT EXISTS (SELECT 1 FROM public.fleet_ingest_keys k
                             WHERE k.active AND (k.vehicle_id = v.id OR k.vehicle_id IS NULL))
             THEN 'no_key'
           WHEN (SELECT max(fp.recorded_at) FROM public.fleet_positions fp
                  WHERE fp.vehicle_id = v.id) IS NULL THEN 'never_reported'
           WHEN (SELECT max(fp.recorded_at) FROM public.fleet_positions fp
                  WHERE fp.vehicle_id = v.id) > now() - interval '15 minutes' THEN 'live'
           WHEN (SELECT max(fp.recorded_at) FROM public.fleet_positions fp
                  WHERE fp.vehicle_id = v.id) > now() - interval '24 hours' THEN 'stale'
           ELSE 'silent'
         END
  FROM public.fleet_vehicles v
  LEFT JOIN public.org_units u ON u.id = v.org_unit_id
  LEFT JOIN public.profiles p ON p.id = v.assigned_driver_id
  WHERE public.can_manage_fleet(auth.uid())
  ORDER BY v.registration_number;
$$;

REVOKE ALL ON FUNCTION public.fleet_feed_readiness() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_feed_readiness() TO authenticated;
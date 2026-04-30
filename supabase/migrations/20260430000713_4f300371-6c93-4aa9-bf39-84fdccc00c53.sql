-- Helper: command-tier check (Admin, OIC, 2IC, Staff Officer) used by the GPS Hub.
CREATE OR REPLACE FUNCTION public.is_gps_hub_authorized(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'oic'::app_role)
    OR public.has_role(_user_id, '2ic'::app_role)
    OR public.has_role(_user_id, 'staff_officer'::app_role);
$$;

-- Centralised GPS data feed for the GPS Hub.
-- Only Admin / OIC / 2IC / Staff Officer may call it. Every successful call is
-- written to front_desk_audit_log so commanders have a verifiable trail of who
-- read GPS/location data, with which filters, and how many rows were returned.
CREATE OR REPLACE FUNCTION public.get_gps_points(
  _sources       text[]      DEFAULT NULL,   -- subset of: operations, enforcement_operations, cyber_incidents
  _from          timestamptz DEFAULT NULL,
  _to            timestamptz DEFAULT NULL,
  _limit         int         DEFAULT 500
)
RETURNS TABLE (
  source       text,
  id           uuid,
  location     text,
  label        text,
  reference    text,
  status       text,
  created_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rows_returned int := 0;
  effective_limit int := LEAST(GREATEST(COALESCE(_limit, 500), 1), 2000);
BEGIN
  IF uid IS NULL OR NOT public.is_gps_hub_authorized(uid) THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'GPS Hub is restricted to Admin, OIC, 2IC, and Staff Officer roles.';
  END IF;

  RETURN QUERY
  WITH unioned AS (
    SELECT 'operations'::text AS source, o.id, o.location, o.operation_type AS label,
           substring(o.id::text, 1, 8) AS reference, o.status::text AS status, o.created_at
      FROM public.operations o
     WHERE o.location IS NOT NULL
       AND (_sources IS NULL OR 'operations' = ANY(_sources))
       AND (_from IS NULL OR o.created_at >= _from)
       AND (_to   IS NULL OR o.created_at <= _to)
    UNION ALL
    SELECT 'enforcement_operations', e.id, e.location, e.operation_type,
           substring(e.id::text, 1, 8), e.status::text, e.created_at
      FROM public.enforcement_operations e
     WHERE e.location IS NOT NULL
       AND (_sources IS NULL OR 'enforcement_operations' = ANY(_sources))
       AND (_from IS NULL OR e.created_at >= _from)
       AND (_to   IS NULL OR e.created_at <= _to)
    UNION ALL
    SELECT 'cyber_incidents', c.id, c.location,
           c.incident_number || ' — ' || c.incident_type,
           c.incident_number, c.severity::text, c.created_at
      FROM public.cyber_incidents c
     WHERE c.location IS NOT NULL
       AND (_sources IS NULL OR 'cyber_incidents' = ANY(_sources))
       AND (_from IS NULL OR c.created_at >= _from)
       AND (_to   IS NULL OR c.created_at <= _to)
  )
  SELECT u.source, u.id, u.location, u.label, u.reference, u.status, u.created_at
    FROM unioned u
   ORDER BY u.created_at DESC
   LIMIT effective_limit;

  GET DIAGNOSTICS rows_returned = ROW_COUNT;

  -- Best-effort audit (must not break the read).
  BEGIN
    INSERT INTO public.front_desk_audit_log(action, entity_type, entity_id, performed_by, details)
    VALUES (
      'gps_hub_read',
      'gps_hub',
      uid,
      uid,
      jsonb_build_object(
        'sources',       _sources,
        'from',          _from,
        'to',            _to,
        'limit',         effective_limit,
        'rows_returned', rows_returned,
        'queried_at',    now()
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- swallow audit failures
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_gps_points(text[], timestamptz, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gps_points(text[], timestamptz, timestamptz, int) TO authenticated;
REVOKE ALL ON FUNCTION public.is_gps_hub_authorized(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_gps_hub_authorized(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_gps_points(text[], timestamptz, timestamptz, int) IS
  'Centralised GPS data feed for the GPS Hub. Restricted to Admin / OIC / 2IC / Staff Officer. Every call is recorded in front_desk_audit_log (action = gps_hub_read).';
COMMENT ON FUNCTION public.is_gps_hub_authorized(uuid) IS
  'Returns true when the user holds a command-tier role (admin, oic, 2ic, staff_officer) authorised to access GPS/location data.';
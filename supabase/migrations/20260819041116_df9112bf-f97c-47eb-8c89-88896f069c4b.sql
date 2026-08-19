-- Normalise any polygon point shape ([lat,lng] pair or {lat,lng} object) to a pair.
CREATE OR REPLACE FUNCTION public.fleet_polygon_points(_polygon jsonb)
RETURNS TABLE (lat double precision, lng double precision)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE((p -> 0)::text::double precision, (p ->> 'lat')::double precision) AS lat,
    COALESCE((p -> 1)::text::double precision, (p ->> 'lng')::double precision) AS lng
  FROM jsonb_array_elements(COALESCE(_polygon, '[]'::jsonb)) WITH ORDINALITY AS t(p, ord)
  WHERE jsonb_typeof(COALESCE(_polygon, '[]'::jsonb)) = 'array'
  ORDER BY t.ord;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_point_in_polygon(_lat double precision, _lng double precision, _polygon jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  pts double precision[][];
  n int;
  i int;
  j int;
  yi double precision; xi double precision; yj double precision; xj double precision;
  inside boolean := false;
BEGIN
  IF _polygon IS NULL OR jsonb_typeof(_polygon) <> 'array' THEN RETURN false; END IF;

  SELECT array_agg(ARRAY[lat, lng]) INTO pts FROM public.fleet_polygon_points(_polygon);
  IF pts IS NULL THEN RETURN false; END IF;
  n := array_length(pts, 1);
  IF n < 3 THEN RETURN false; END IF;

  j := n;
  FOR i IN 1..n LOOP
    yi := pts[i][1]; xi := pts[i][2];
    yj := pts[j][1]; xj := pts[j][2];
    IF yi IS NULL OR xi IS NULL OR yj IS NULL OR xj IS NULL THEN
      j := i; CONTINUE;
    END IF;
    IF ((yi > _lat) <> (yj > _lat))
       AND (_lng < (xj - xi) * (_lat - yi) / NULLIF(yj - yi, 0) + xi) THEN
      inside := NOT inside;
    END IF;
    j := i;
  END LOOP;
  RETURN inside;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_validate_geofence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  lat_pad double precision;
  lng_pad double precision;
BEGIN
  IF NEW.kind = 'circle' THEN
    IF NEW.center_lat IS NULL OR NEW.center_lng IS NULL OR COALESCE(NEW.radius_m, 0) <= 0 THEN
      RAISE EXCEPTION 'A circular zone needs a centre point and a radius greater than zero';
    END IF;
    lat_pad := (NEW.radius_m / 111320.0);
    lng_pad := (NEW.radius_m / GREATEST(111320.0 * cos(radians(NEW.center_lat)), 1));
    NEW.min_lat := NEW.center_lat - lat_pad;
    NEW.max_lat := NEW.center_lat + lat_pad;
    NEW.min_lng := NEW.center_lng - lng_pad;
    NEW.max_lng := NEW.center_lng + lng_pad;
  ELSE
    IF NEW.polygon IS NULL OR jsonb_typeof(NEW.polygon) <> 'array' OR jsonb_array_length(NEW.polygon) < 3 THEN
      RAISE EXCEPTION 'A polygon zone needs at least three points';
    END IF;
    SELECT min(lat), max(lat), min(lng), max(lng)
      INTO NEW.min_lat, NEW.max_lat, NEW.min_lng, NEW.max_lng
      FROM public.fleet_polygon_points(NEW.polygon);
    IF NEW.min_lat IS NULL OR NEW.min_lng IS NULL THEN
      RAISE EXCEPTION 'Zone boundary points must each carry a latitude and a longitude';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Refresh cached boxes for every existing zone.
UPDATE public.fleet_geofences SET updated_at = now();

REVOKE ALL ON FUNCTION public.fleet_polygon_points(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_polygon_points(jsonb) TO authenticated, service_role;
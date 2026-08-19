CREATE SEQUENCE IF NOT EXISTS public.cyber_incident_seq;

CREATE OR REPLACE FUNCTION public.next_cyber_incident_number()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'CYB-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.cyber_incident_seq')::text, 5, '0');
$$;

REVOKE ALL ON FUNCTION public.next_cyber_incident_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_cyber_incident_number() TO authenticated, service_role;
GRANT USAGE ON SEQUENCE public.cyber_incident_seq TO authenticated, service_role;

ALTER TABLE public.cyber_incidents
  ALTER COLUMN incident_number SET DEFAULT public.next_cyber_incident_number();
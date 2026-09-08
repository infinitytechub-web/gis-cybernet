CREATE OR REPLACE FUNCTION public.webauthn_admin_enrollment_report()
 RETURNS TABLE(user_id uuid, full_name text, staff_id text, department text, roles text[], required boolean, device_count integer, first_enrolled_at timestamp with time zone, last_used_at timestamp with time zone, compliance text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _required boolean;
  _grace integer;
  _enforced timestamptz;
  _roles public.app_role[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators may view biometric enrollment coverage.';
  END IF;

  SELECT COALESCE(a.biometric_enrollment_required, false),
         GREATEST(COALESCE(a.biometric_enrollment_grace_days, 15), 0),
         COALESCE(a.biometric_enrollment_enforced_at, now()),
         COALESCE(a.biometric_required_roles, '{}'::public.app_role[])
    INTO _required, _grace, _enforced, _roles
    FROM public.app_settings a LIMIT 1;

  RETURN QUERY
  SELECT p.user_id,
         NULLIF(btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') AS full_name,
         p.staff_id,
         d.name AS department,
         COALESCE(r.roles, ARRAY[]::text[]) AS roles,
         (_required AND COALESCE(r.role_match, false)) AS required,
         COALESCE(c.device_count, 0)::int AS device_count,
         c.first_enrolled_at,
         c.last_used_at,
         CASE
           WHEN COALESCE(c.device_count, 0) > 0 THEN 'enrolled'
           WHEN NOT (_required AND COALESCE(r.role_match, false)) THEN 'not_required'
           WHEN now() > _enforced + make_interval(days => _grace) THEN 'overdue'
           ELSE 'grace'
         END AS compliance
    FROM public.profiles p
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN (
      SELECT ur.user_id,
             array_agg(ur.role::text ORDER BY ur.role::text) AS roles,
             bool_or(ur.role = ANY (_roles)) AS role_match
        FROM public.user_roles ur
       GROUP BY ur.user_id
    ) r ON r.user_id = p.user_id
    LEFT JOIN (
      SELECT wc.user_id,
             count(*) AS device_count,
             min(wc.created_at) AS first_enrolled_at,
             max(wc.last_used_at) AS last_used_at
        FROM public.webauthn_credentials wc
       WHERE wc.revoked_at IS NULL
       GROUP BY wc.user_id
    ) c ON c.user_id = p.user_id
   WHERE p.user_id IS NOT NULL
   ORDER BY (COALESCE(c.device_count, 0) > 0),
            NULLIF(btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') NULLS LAST;
END;
$function$;

CREATE OR REPLACE FUNCTION public.webauthn_admin_list_credentials()
 RETURNS TABLE(id uuid, user_id uuid, full_name text, staff_id text, device_label text, backed_up boolean, last_used_at timestamp with time zone, created_at timestamp with time zone, revoked_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators may list biometric credentials.';
  END IF;

  RETURN QUERY
  SELECT c.id, c.user_id,
         NULLIF(btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') AS full_name,
         p.staff_id, c.device_label, c.backed_up,
         c.last_used_at, c.created_at, c.revoked_at
  FROM public.webauthn_credentials c
  LEFT JOIN public.profiles p ON p.user_id = c.user_id
  ORDER BY c.revoked_at NULLS FIRST, c.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.webauthn_audit_feed(_events text[] DEFAULT NULL::text[], _since timestamp with time zone DEFAULT NULL::timestamp with time zone, _limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, event text, user_id uuid, staff_name text, staff_identifier text, actor_id uuid, actor_name text, device_label text, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'oic')
          OR public.has_role(auth.uid(), '2ic')) THEN
    RAISE EXCEPTION 'Only administrators, OIC or 2IC may read the biometric audit log.';
  END IF;

  RETURN QUERY
  SELECT a.id,
         a.created_at,
         a.event,
         a.user_id,
         NULLIF(btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') AS staff_name,
         p.staff_id AS staff_identifier,
         a.actor_id,
         NULLIF(btrim(COALESCE(ap.first_name, '') || ' ' || COALESCE(ap.last_name, '')), '') AS actor_name,
         a.device_label,
         a.detail
    FROM public.webauthn_audit a
    LEFT JOIN public.profiles p ON p.user_id = a.user_id
    LEFT JOIN public.profiles ap ON ap.user_id = a.actor_id
   WHERE (_events IS NULL OR array_length(_events, 1) IS NULL OR a.event = ANY(_events))
     AND (_since IS NULL OR a.created_at >= _since)
   ORDER BY a.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 500), 1), 2000);
END;
$function$;
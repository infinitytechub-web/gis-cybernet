CREATE OR REPLACE FUNCTION public.mfa_trusted_devices_feed(_user_id uuid DEFAULT NULL::uuid, _include_revoked boolean DEFAULT false, _limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, user_id uuid, staff_name text, staff_identifier text, label text, user_agent text, trusted_hours integer, created_at timestamp with time zone, expires_at timestamp with time zone, last_used_at timestamp with time zone, revoked_at timestamp with time zone, revoked_by_name text, revoke_reason text, is_active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'oic')
    OR public.has_role(auth.uid(), '2ic')
  ) THEN
    RAISE EXCEPTION 'Not authorised to view trusted devices';
  END IF;

  RETURN QUERY
  SELECT d.id,
         d.user_id,
         CONCAT_WS(' ', p.first_name, p.last_name) AS staff_name,
         p.staff_id AS staff_identifier,
         d.label,
         d.user_agent,
         d.trusted_hours,
         d.created_at,
         d.expires_at,
         d.last_used_at,
         d.revoked_at,
         CONCAT_WS(' ', rb.first_name, rb.last_name) AS revoked_by_name,
         d.revoke_reason,
         (d.revoked_at IS NULL AND d.expires_at > now()) AS is_active
    FROM public.mfa_trusted_devices d
    LEFT JOIN public.profiles p ON p.user_id = d.user_id
    LEFT JOIN public.profiles rb ON rb.user_id = d.revoked_by
   WHERE (_user_id IS NULL OR d.user_id = _user_id)
     AND (_include_revoked OR d.revoked_at IS NULL)
   ORDER BY d.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 1000);
END;
$function$;
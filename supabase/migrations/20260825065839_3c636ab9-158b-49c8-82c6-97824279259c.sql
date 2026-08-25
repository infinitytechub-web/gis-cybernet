CREATE OR REPLACE FUNCTION public.security_event_feed(
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to timestamptz DEFAULT now(),
  _limit integer DEFAULT 1000
)
RETURNS TABLE (
  id uuid,
  occurred_at timestamptz,
  category text,
  action text,
  severity text,
  staff_id text,
  subject_name text,
  actor_name text,
  ip_address text,
  detail text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin')
       OR public.has_role(auth.uid(), 'oic')
       OR public.has_role(auth.uid(), '2ic')) THEN
    RAISE EXCEPTION 'Not authorised to view the security audit log';
  END IF;

  RETURN QUERY
  SELECT e.id,
         COALESCE(e.locked_at, e.created_at),
         'lockout'::text,
         'account_locked'::text,
         'critical'::text,
         e.staff_id,
         e.full_name,
         NULL::text,
         e.ip_address,
         format('%s failed attempts (threshold %s within %s min)',
                COALESCE(e.attempts, 0), COALESCE(e.threshold, 0), COALESCE(e.window_minutes, 0))
  FROM public.account_lockout_events e
  WHERE COALESCE(e.locked_at, e.created_at) BETWEEN _from AND _to

  UNION ALL
  SELECT u.id, u.created_at, 'lockout'::text, 'account_unlocked'::text, 'warning'::text,
         u.target_staff_id, u.target_full_name, u.unlocked_by_name, NULL::text,
         COALESCE(u.reason, 'Unlocked by administrator')
  FROM public.account_unlock_audit u
  WHERE u.created_at BETWEEN _from AND _to

  UNION ALL
  SELECT m.id, m.created_at, 'mfa'::text,
         ('mfa_' || COALESCE(m.outcome, 'challenge'))::text,
         CASE WHEN COALESCE(m.outcome, '') IN ('success', 'verified') THEN 'info' ELSE 'warning' END,
         m.staff_id,
         (SELECT btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) FROM public.profiles p WHERE p.id = m.user_id),
         NULL::text,
         m.ip_address,
         COALESCE(m.failure_reason, m.user_agent)
  FROM public.mfa_challenge_audit m
  WHERE m.created_at BETWEEN _from AND _to

  UNION ALL
  SELECT r.id, r.created_at, 'mfa'::text,
         ('mfa_recovery_' || COALESCE(r.status, 'requested'))::text,
         CASE WHEN COALESCE(r.status, '') = 'approved' THEN 'warning' ELSE 'info' END,
         r.staff_id,
         (SELECT btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) FROM public.profiles p WHERE p.id = r.user_id),
         r.reviewed_label,
         NULL::text,
         COALESCE(r.review_note, r.reason)
  FROM public.mfa_recovery_requests r
  WHERE r.created_at BETWEEN _from AND _to

  UNION ALL
  SELECT s.id, s.created_at, 'session'::text,
         COALESCE(s.action, 'session_action'),
         CASE WHEN COALESCE(s.sessions_affected, 0) > 1 THEN 'warning' ELSE 'info' END,
         (SELECT p.staff_id FROM public.profiles p WHERE p.id = s.target_user_id),
         (SELECT btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) FROM public.profiles p WHERE p.id = s.target_user_id),
         (SELECT btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) FROM public.profiles p WHERE p.id = s.actor_id),
         s.ip_address,
         COALESCE(s.reason, format('%s session(s) affected', COALESCE(s.sessions_affected, 0)))
  FROM public.session_action_audit s
  WHERE s.created_at BETWEEN _from AND _to

  UNION ALL
  SELECT a.id, a.created_at,
         CASE WHEN a.action ILIKE '%mfa%' OR a.action ILIKE '%backup_code%' OR a.action ILIKE '%webauthn%'
              THEN 'mfa' ELSE 'lockout' END,
         a.action,
         COALESCE(a.severity, 'info'),
         NULL::text,
         a.subject,
         a.actor_label,
         a.ip_address,
         NULLIF(a.details::text, '{}')
  FROM public.security_audit_log a
  WHERE a.created_at BETWEEN _from AND _to
    AND (a.action ILIKE '%mfa%' OR a.action ILIKE '%backup_code%' OR a.action ILIKE '%webauthn%'
         OR a.action ILIKE '%unlock%' OR a.action ILIKE '%lock%')

  ORDER BY 2 DESC
  LIMIT GREATEST(COALESCE(_limit, 1000), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.security_event_feed(timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.security_event_feed(timestamptz, timestamptz, integer) TO authenticated;
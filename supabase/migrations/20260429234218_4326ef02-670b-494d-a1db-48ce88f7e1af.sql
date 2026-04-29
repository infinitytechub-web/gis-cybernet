-- Paginated, filterable read API for the approval audit trail.
-- SECURITY DEFINER + explicit access check so we can apply server-side
-- LIMIT and complex filters without breaking RLS guarantees.
CREATE OR REPLACE FUNCTION public.search_approval_audit(
  _entity_type    TEXT,
  _entity_id      UUID,
  _actions        TEXT[] DEFAULT NULL,
  _actor_roles    TEXT[] DEFAULT NULL,
  _from           TIMESTAMPTZ DEFAULT NULL,
  _to             TIMESTAMPTZ DEFAULT NULL,
  _cursor_created TIMESTAMPTZ DEFAULT NULL,
  _cursor_id      UUID DEFAULT NULL,
  _limit          INT DEFAULT 50
)
RETURNS TABLE (
  id                 UUID,
  action             TEXT,
  actor_role         TEXT,
  previous_status    TEXT,
  new_status         TEXT,
  changed_fields     JSONB,
  notes              TEXT,
  created_at         TIMESTAMPTZ,
  actor_first_name   TEXT,
  actor_last_name    TEXT,
  actor_rank_abbrev  TEXT,
  request_profile_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  effective_limit INT := LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
  request_owner UUID;
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  IF _entity_type NOT IN ('leave_request','posting_transfer') THEN
    RAISE EXCEPTION 'Invalid entity_type';
  END IF;

  -- Resolve the affected request's owning profile to authorise the viewer.
  IF _entity_type = 'leave_request' THEN
    SELECT lr.profile_id INTO request_owner FROM public.leave_requests lr WHERE lr.id = _entity_id;
  ELSE
    SELECT pt.profile_id INTO request_owner FROM public.postings_transfers pt WHERE pt.id = _entity_id;
  END IF;

  IF request_owner IS NULL THEN
    -- Either no such record, or it doesn't belong to anyone we can scope to.
    RETURN;
  END IF;

  v_allowed := public.is_command_tier(uid)
            OR public.is_supervisor_for_profile(uid, request_owner);

  IF NOT v_allowed THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.action,
    a.actor_role,
    a.previous_status,
    a.new_status,
    a.changed_fields,
    a.notes,
    a.created_at,
    p.first_name AS actor_first_name,
    p.last_name  AS actor_last_name,
    r.abbreviation AS actor_rank_abbrev,
    a.request_profile_id
  FROM public.request_approval_audit a
  LEFT JOIN public.profiles p ON p.id = a.actor_profile_id
  LEFT JOIN public.ranks r    ON r.id = p.rank_id
  WHERE a.entity_type = _entity_type
    AND a.entity_id   = _entity_id
    AND (_actions     IS NULL OR a.action     = ANY(_actions))
    AND (_actor_roles IS NULL OR a.actor_role = ANY(_actor_roles))
    AND (_from IS NULL OR a.created_at >= _from)
    AND (_to   IS NULL OR a.created_at <= _to)
    AND (
      _cursor_created IS NULL
      OR a.created_at <  _cursor_created
      OR (a.created_at = _cursor_created AND a.id < _cursor_id)
    )
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT effective_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_approval_audit(TEXT, UUID, TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, UUID, INT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.search_approval_audit(TEXT, UUID, TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, UUID, INT) TO authenticated;
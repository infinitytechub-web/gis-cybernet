CREATE OR REPLACE FUNCTION public.search_authorising_officers(
  _search TEXT DEFAULT NULL,
  _limit  INT  DEFAULT 50
)
RETURNS TABLE (
  id              UUID,
  first_name      TEXT,
  last_name       TEXT,
  rank_abbrev     TEXT,
  department_name TEXT,
  role            TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  is_command BOOLEAN;
  effective_limit INT := LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
  search_term TEXT := NULLIF(TRIM(COALESCE(_search, '')), '');
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  is_command :=
    public.has_role(uid, 'admin')
    OR public.has_role(uid, 'oic')
    OR public.has_role(uid, '2ic')
    OR public.has_role(uid, 'staff_officer');

  RETURN QUERY
  WITH viewer_depts AS (
    SELECT DISTINCT ud.department_id
    FROM public.user_department_ids(uid) ud
  ),
  ranked AS (
    SELECT
      p.id              AS profile_id,
      p.first_name      AS p_first_name,
      p.last_name       AS p_last_name,
      r.abbreviation    AS p_rank_abbrev,
      d.name            AS p_department_name,
      ur.role::TEXT     AS p_role,
      ROW_NUMBER() OVER (
        PARTITION BY p.id
        ORDER BY CASE ur.role::TEXT WHEN 'oic' THEN 0 WHEN '2ic' THEN 1 ELSE 2 END
      ) AS rn
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    LEFT JOIN public.ranks r       ON r.id = p.rank_id
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE ur.role::TEXT IN ('oic', '2ic')
      AND (
        is_command
        OR EXISTS (
          SELECT 1
          FROM public.profile_departments pd
          JOIN viewer_depts vd ON vd.department_id = pd.department_id
          WHERE pd.profile_id = p.id
        )
        OR EXISTS (
          SELECT 1 FROM viewer_depts vd WHERE vd.department_id = p.department_id
        )
      )
      AND (
        search_term IS NULL
        OR p.first_name ILIKE '%' || search_term || '%'
        OR p.last_name  ILIKE '%' || search_term || '%'
      )
  )
  SELECT
    ranked.profile_id        AS id,
    ranked.p_first_name      AS first_name,
    ranked.p_last_name       AS last_name,
    ranked.p_rank_abbrev     AS rank_abbrev,
    ranked.p_department_name AS department_name,
    ranked.p_role            AS role
  FROM ranked
  WHERE ranked.rn = 1
  ORDER BY ranked.p_last_name, ranked.p_first_name
  LIMIT effective_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_authorising_officers(TEXT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_authorising_officers(TEXT, INT) TO authenticated;
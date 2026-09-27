CREATE OR REPLACE FUNCTION public.staff_analytics(_org_unit_id uuid DEFAULT NULL, _department_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean;
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  _is_admin := public.has_role(_uid, 'admin');
  IF NOT _is_admin AND NOT public.has_profile_oversight_role(_uid) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF _org_unit_id IS NOT NULL AND NOT _is_admin
     AND NOT EXISTS (SELECT 1 FROM public.user_org_scope(_uid) s WHERE s = _org_unit_id) THEN
    RAISE EXCEPTION 'command outside your scope' USING ERRCODE = '42501';
  END IF;

  WITH scope AS (
    SELECT id FROM public.org_units
    WHERE (_is_admin OR id IN (SELECT public.user_org_scope(_uid)))
      AND (_org_unit_id IS NULL OR id IN (SELECT public.org_unit_descendants(_org_unit_id)) OR id = _org_unit_id)
  ),
  base AS (
    SELECT p.id, p.staff_id, trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) AS name,
           coalesce(nullif(initcap(p.gender),''),'Not recorded') AS sex,
           coalesce(r.name,'Not recorded') AS rank, coalesce(d.name,'Unassigned') AS department,
           p.department_id, p.org_unit_id, coalesce(u.name,'Unposted') AS command,
           p.status::text AS status,
           coalesce((SELECT ru.name FROM public.org_unit_ancestors(p.org_unit_id) a
                     JOIN public.org_units ru ON ru.id = a WHERE ru.type = 'regional' LIMIT 1),
                    CASE WHEN u.type = 'regional' THEN u.name END, 'Not recorded') AS region,
           coalesce((SELECT string_agg(ur.role::text, ', ' ORDER BY ur.role::text) FROM public.user_roles ur WHERE ur.user_id = p.user_id),'staff') AS roles
    FROM public.profiles p
    LEFT JOIN public.ranks r ON r.id = p.rank_id
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.org_units u ON u.id = p.org_unit_id
    WHERE p.deleted_at IS NULL
      AND (_department_id IS NULL OR p.department_id = _department_id)
      AND ((p.org_unit_id IN (SELECT id FROM scope))
           OR (_is_admin AND _org_unit_id IS NULL AND p.org_unit_id IS NULL))
  ),
  roleflat AS (SELECT trim(x) AS role FROM base, unnest(string_to_array(base.roles, ',')) x)
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'active', (SELECT count(*) FROM base WHERE status = 'active'),
    'by_status', (SELECT coalesce(jsonb_object_agg(k, c),'{}') FROM (SELECT status k, count(*) c FROM base GROUP BY 1) t),
    'by_sex', (SELECT coalesce(jsonb_object_agg(k, c),'{}') FROM (SELECT sex k, count(*) c FROM base GROUP BY 1) t),
    'by_rank', (SELECT coalesce(jsonb_object_agg(k, c),'{}') FROM (SELECT rank k, count(*) c FROM base GROUP BY 1) t),
    'by_role', (SELECT coalesce(jsonb_object_agg(k, c),'{}') FROM (SELECT role k, count(*) c FROM roleflat GROUP BY 1) t),
    'by_region', (SELECT coalesce(jsonb_object_agg(k, c),'{}') FROM (SELECT region k, count(*) c FROM base GROUP BY 1) t),
    'by_department', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',department_id,'name',department,'count',c,'active',a) ORDER BY c DESC),'[]')
                      FROM (SELECT department_id, department, count(*) c, count(*) FILTER (WHERE status='active') a FROM base GROUP BY 1,2) t),
    'by_command', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',org_unit_id,'name',command,'count',c,'active',a,'authorised',ou.authorised_strength) ORDER BY c DESC),'[]')
                   FROM (SELECT org_unit_id, command, count(*) c, count(*) FILTER (WHERE status='active') a FROM base GROUP BY 1,2) t
                   LEFT JOIN public.org_units ou ON ou.id = t.org_unit_id),
    'staff', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'staff_id',staff_id,'name',name,'sex',sex,'rank',rank,'roles',roles,'department',department,'command',command,'region',region,'status',status) ORDER BY name),'[]') FROM base)
  ) INTO _result;
  RETURN _result;
END $$;
REVOKE ALL ON FUNCTION public.staff_analytics(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_analytics(uuid, uuid) TO authenticated;
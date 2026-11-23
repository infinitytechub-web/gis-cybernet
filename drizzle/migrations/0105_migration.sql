CREATE OR REPLACE FUNCTION public._directory_visible_unit(_unit uuid, _owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    _owner = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    OR _unit IN (SELECT public.user_org_scope(auth.uid()))
    OR _unit = (SELECT me.org_unit_id FROM public.profiles me WHERE me.user_id = auth.uid() AND me.deleted_at IS NULL LIMIT 1)
  );
$$;
REVOKE EXECUTE ON FUNCTION public._directory_visible_unit(uuid, uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.staff_directory_rows()
 RETURNS TABLE(id uuid, user_id uuid, first_name text, last_name text, staff_id text, status text, unit text, shift_group text, photo_url text, phone text, department_id uuid, department_name text, rank_id uuid, rank_abbreviation text, rank_name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id, p.user_id, p.first_name, p.last_name, p.staff_id,
         p.status::text, p.unit, p.shift_group, p.photo_url, p.phone,
         p.department_id, d.name, p.rank_id, r.abbreviation, r.name
    FROM public.profiles p
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.ranks r ON r.id = p.rank_id
   WHERE p.status = 'active' AND p.deleted_at IS NULL
     AND public._directory_visible_unit(p.org_unit_id, p.user_id)
   ORDER BY p.last_name, p.first_name;
$function$;

CREATE OR REPLACE FUNCTION public.duty_roster_live(_date date DEFAULT CURRENT_DATE, _group text DEFAULT NULL::text)
 RETURNS TABLE(profile_id uuid, staff_id text, full_name text, rank_abbr text, rank_name text, department_name text, unit text, shift_group text, status text, photo_url text, on_duty boolean, check_in timestamp with time zone, check_out timestamp with time zone, attendance_status text, org_unit_name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT pr.id, pr.staff_id::text, TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name))::text,
    rk.abbreviation::text, rk.name::text, dp.name::text, pr.unit::text, pr.shift_group::text,
    pr.status::text, pr.photo_url::text,
    (_group IS NOT NULL AND UPPER(COALESCE(pr.shift_group, '')) = UPPER(_group)),
    att.check_in, att.check_out, att.status::text, ou.name::text
  FROM public.profiles pr
  LEFT JOIN public.ranks rk ON rk.id = pr.rank_id
  LEFT JOIN public.departments dp ON dp.id = pr.department_id
  LEFT JOIN public.org_units ou ON ou.id = pr.org_unit_id
  LEFT JOIN public.attendances att ON att.profile_id = pr.id AND att.date = _date
  WHERE COALESCE(pr.status::text, 'active') = 'active'
    AND pr.deleted_at IS NULL
    AND pr.shift_group IS NOT NULL
    AND public._directory_visible_unit(pr.org_unit_id, pr.user_id);
$function$;
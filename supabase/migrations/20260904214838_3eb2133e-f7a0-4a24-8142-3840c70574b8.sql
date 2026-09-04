CREATE OR REPLACE FUNCTION public.leave_balances(_year integer DEFAULT EXTRACT(YEAR FROM now())::int)
RETURNS TABLE (
  profile_id uuid,
  staff_id text,
  full_name text,
  rank_name text,
  department_name text,
  unit text,
  shift_group text,
  leave_type public.leave_type,
  days_entitled numeric,
  days_taken numeric,
  days_pending numeric,
  days_remaining numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible AS (
    SELECT p.id, p.staff_id,
           btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) AS full_name,
           r.name AS rank_name, d.name AS department_name, p.unit, p.shift_group
    FROM public.profiles p
    LEFT JOIN public.ranks r ON r.id = p.rank_id
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE p.status = 'active'
      AND (
        p.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'oic')
        OR public.has_role(auth.uid(), '2ic')
        OR public.has_role(auth.uid(), 'staff_officer')
        OR public.has_role(auth.uid(), 'supervisor')
      )
  ),
  ent AS (
    SELECT e.leave_type, e.days FROM public.leave_entitlements e WHERE e.year = _year
  ),
  used AS (
    SELECT lr.profile_id, lr.type,
           sum(CASE WHEN lr.status = 'approved'
                    THEN greatest(least(lr.end_date, make_date(_year,12,31)) - greatest(lr.start_date, make_date(_year,1,1)) + 1, 0)
                    ELSE 0 END)::numeric AS taken,
           sum(CASE WHEN lr.status = 'pending'
                    THEN greatest(least(lr.end_date, make_date(_year,12,31)) - greatest(lr.start_date, make_date(_year,1,1)) + 1, 0)
                    ELSE 0 END)::numeric AS pending
    FROM public.leave_requests lr
    WHERE lr.start_date <= make_date(_year,12,31)
      AND lr.end_date >= make_date(_year,1,1)
    GROUP BY lr.profile_id, lr.type
  )
  SELECT v.id, v.staff_id, v.full_name, v.rank_name, v.department_name, v.unit, v.shift_group,
         ent.leave_type,
         ent.days,
         coalesce(u.taken, 0),
         coalesce(u.pending, 0),
         greatest(ent.days - coalesce(u.taken, 0), 0)
  FROM visible v
  CROSS JOIN ent
  LEFT JOIN used u ON u.profile_id = v.id AND u.type = ent.leave_type
  ORDER BY v.full_name, ent.leave_type;
$$;

REVOKE EXECUTE ON FUNCTION public.leave_balances(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_balances(integer) TO authenticated;
-- Fix infinite recursion in profiles UPDATE policy by using a SECURITY DEFINER
-- helper function instead of self-referencing subqueries inside WITH CHECK.

CREATE OR REPLACE FUNCTION public.get_profile_protected_fields(_user_id uuid)
RETURNS TABLE (
  department_id uuid,
  rank_id uuid,
  status text,
  account_locked boolean,
  login_enabled boolean,
  staff_id text,
  shift_group text,
  unit text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.department_id,
    p.rank_id,
    p.status::text,
    p.account_locked,
    p.login_enabled,
    p.staff_id,
    p.shift_group::text,
    p.unit
  FROM public.profiles p
  WHERE p.user_id = _user_id
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "Users can update own profile safe fields" ON public.profiles;

CREATE POLICY "Users can update own profile safe fields"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND department_id   IS NOT DISTINCT FROM (SELECT f.department_id   FROM public.get_profile_protected_fields(auth.uid()) f)
  AND rank_id         IS NOT DISTINCT FROM (SELECT f.rank_id         FROM public.get_profile_protected_fields(auth.uid()) f)
  AND status::text    IS NOT DISTINCT FROM (SELECT f.status          FROM public.get_profile_protected_fields(auth.uid()) f)
  AND account_locked  IS NOT DISTINCT FROM (SELECT f.account_locked  FROM public.get_profile_protected_fields(auth.uid()) f)
  AND login_enabled   IS NOT DISTINCT FROM (SELECT f.login_enabled   FROM public.get_profile_protected_fields(auth.uid()) f)
  AND staff_id        IS NOT DISTINCT FROM (SELECT f.staff_id        FROM public.get_profile_protected_fields(auth.uid()) f)
  AND shift_group::text IS NOT DISTINCT FROM (SELECT f.shift_group   FROM public.get_profile_protected_fields(auth.uid()) f)
  AND unit            IS NOT DISTINCT FROM (SELECT f.unit            FROM public.get_profile_protected_fields(auth.uid()) f)
);
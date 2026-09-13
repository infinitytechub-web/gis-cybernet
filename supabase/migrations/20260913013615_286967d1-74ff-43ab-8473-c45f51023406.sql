-- 1. Oversight-role helper: only these roles have any business reading another
--    officer's full record. Plain staff and applicant-facing roles do not.
CREATE OR REPLACE FUNCTION public.has_profile_oversight_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = _user_id
       AND ur.role IN (
         'admin','oic','2ic','staff_officer','supervisor','command_officer',
         'head_of_administration','chief_staff_officer',
         'deputy_supervisor','deputy','shift_leader','deputy_shift_leader',
         'shift_supervisor','deputy_shift_supervisor','special_duties',
         'ipse_supervisor','ipse_deputy_supervisor',
         'head_of_processing','deputy_head_of_processing',
         'medical_officer','me_officer','project_manager'
       )
  );
$$;
REVOKE ALL ON FUNCTION public.has_profile_oversight_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_profile_oversight_role(uuid) TO authenticated, service_role;

-- 2. The org-scope read policy applied to every signed-in user, which let plain
--    staff read complete records of everyone in their command. Gate it on an
--    oversight role; officers still read their own row via the owner policy.
DROP POLICY IF EXISTS "Org oversight can view profiles in scope" ON public.profiles;
CREATE POLICY "Org oversight can view profiles in scope"
ON public.profiles FOR SELECT TO authenticated
USING (
  org_unit_id IS NOT NULL
  AND public.has_profile_oversight_role(auth.uid())
  AND public.has_org_access(auth.uid(), org_unit_id)
);

-- 3. Directory listing for every signed-in officer — non-confidential columns
--    only, so the staff directory keeps working without exposing KYC data.
CREATE OR REPLACE FUNCTION public.staff_directory_rows()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  staff_id text,
  status text,
  unit text,
  shift_group text,
  photo_url text,
  phone text,
  department_id uuid,
  department_name text,
  rank_id uuid,
  rank_abbreviation text,
  rank_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.user_id, p.first_name, p.last_name, p.staff_id,
         p.status::text, p.unit, p.shift_group, p.photo_url, p.phone,
         p.department_id, d.name, p.rank_id, r.abbreviation, r.name
    FROM public.profiles p
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.ranks r ON r.id = p.rank_id
   WHERE auth.uid() IS NOT NULL
     AND p.status = 'active'
   ORDER BY p.last_name, p.first_name;
$$;
REVOKE ALL ON FUNCTION public.staff_directory_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_directory_rows() TO authenticated, service_role;

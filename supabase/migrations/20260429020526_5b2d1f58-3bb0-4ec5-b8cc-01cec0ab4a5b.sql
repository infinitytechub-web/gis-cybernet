-- Multi-department membership for officers (and any staff who serve more
-- than one department). The legacy profiles.department_id remains as the
-- "primary" department; this join table records every department a profile
-- is attached to, so the Authorised-By picker (and similar scoped queries)
-- can return officers visible to ANY of the viewer's departments.

CREATE TABLE IF NOT EXISTS public.profile_departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_departments_profile ON public.profile_departments(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_departments_department ON public.profile_departments(department_id);

ALTER TABLE public.profile_departments ENABLE ROW LEVEL SECURITY;

-- Read access mirrors the office-history model: command tier sees everything,
-- supervisors see members of their own department(s), and every authenticated
-- user can see their own membership rows.
CREATE POLICY "Profile-departments visibility"
ON public.profile_departments FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
  OR public.is_supervisor_for_profile(auth.uid(), profile_id)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = profile_departments.profile_id AND p.user_id = auth.uid()
  )
);

-- Only admins / command tier may add or remove memberships.
CREATE POLICY "Command tier manages profile-departments"
ON public.profile_departments FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
);

-- Backfill: copy each profile's existing single department_id as a primary
-- membership so the picker keeps working without manual data entry.
INSERT INTO public.profile_departments (profile_id, department_id, is_primary)
SELECT id, department_id, true
FROM public.profiles
WHERE department_id IS NOT NULL
ON CONFLICT (profile_id, department_id) DO NOTHING;

-- Helper: list every department_id the given user belongs to (primary or
-- secondary). SECURITY DEFINER so RLS recursion is avoided when callers
-- (e.g. RLS policies on other tables) reference it.
CREATE OR REPLACE FUNCTION public.user_department_ids(_user_id UUID)
RETURNS TABLE (department_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT pd.department_id
  FROM public.profile_departments pd
  JOIN public.profiles p ON p.id = pd.profile_id
  WHERE p.user_id = _user_id
  UNION
  SELECT DISTINCT p.department_id
  FROM public.profiles p
  WHERE p.user_id = _user_id AND p.department_id IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.user_department_ids(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_department_ids(UUID) TO authenticated;

-- Helper: is the user a supervisor in the MISD/CYBER department?
CREATE OR REPLACE FUNCTION public.is_misd_supervisor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.departments d ON d.id = p.department_id
    WHERE p.user_id = _user_id
      AND public.has_role(_user_id, 'supervisor'::app_role)
      AND (d.name ILIKE '%cyber%' OR d.name ILIKE '%misd%')
  );
$$;

-- Helper: get the MISD/CYBER department id (first match)
CREATE OR REPLACE FUNCTION public.get_misd_department_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.departments
  WHERE name ILIKE '%cyber%' OR name ILIKE '%misd%'
  ORDER BY name
  LIMIT 1;
$$;

-- Replace the profile update guard: allow command-tier (OIC, 2IC, supervisor)
-- to assign departments, except moves into/out of MISD/CYBER which are
-- restricted to admin or MISD/CYBER supervisors.
CREATE OR REPLACE FUNCTION public.restrict_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _misd_id uuid;
  _is_admin boolean;
  _is_command boolean;
  _is_supervisor boolean;
  _is_misd_sup boolean;
BEGIN
  _is_admin := public.has_role(auth.uid(), 'admin'::app_role);

  -- Admins can change anything
  IF _is_admin THEN
    RETURN NEW;
  END IF;

  _is_command := public.has_role(auth.uid(), 'oic'::app_role)
              OR public.has_role(auth.uid(), '2ic'::app_role);
  _is_supervisor := public.has_role(auth.uid(), 'supervisor'::app_role);
  _is_misd_sup := public.is_misd_supervisor(auth.uid());
  _misd_id := public.get_misd_department_id();

  -- Department assignment: command tier (OIC/2IC) and supervisors may assign
  -- departments. MISD/CYBER assignments are restricted to admins and
  -- MISD/CYBER supervisors.
  IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    IF NOT (_is_command OR _is_supervisor) THEN
      RAISE EXCEPTION 'Only admins, OIC, 2IC or supervisors can change department';
    END IF;
    -- Block moves involving the MISD/CYBER department unless admin or MISD supervisor
    IF _misd_id IS NOT NULL
       AND (NEW.department_id = _misd_id OR OLD.department_id = _misd_id)
       AND NOT _is_misd_sup THEN
      RAISE EXCEPTION 'Only admins or MISD/CYBER supervisors can assign staff to or from the MISD/CYBER department';
    END IF;
  END IF;

  -- Other sensitive fields remain admin-only
  IF NEW.rank_id IS DISTINCT FROM OLD.rank_id THEN
    RAISE EXCEPTION 'Only admins can change rank';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only admins can change status';
  END IF;
  IF NEW.account_locked IS DISTINCT FROM OLD.account_locked THEN
    RAISE EXCEPTION 'Only admins can change account_locked';
  END IF;
  IF NEW.login_enabled IS DISTINCT FROM OLD.login_enabled THEN
    RAISE EXCEPTION 'Only admins can change login_enabled';
  END IF;
  IF NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
    RAISE EXCEPTION 'Only admins can change staff_id';
  END IF;
  IF NEW.shift_group IS DISTINCT FROM OLD.shift_group THEN
    RAISE EXCEPTION 'Only admins can change shift_group';
  END IF;
  IF NEW.unit IS DISTINCT FROM OLD.unit THEN
    RAISE EXCEPTION 'Only admins can change unit';
  END IF;

  RETURN NEW;
END;
$$;

-- Allow OIC/2IC/Supervisor to UPDATE profiles (the trigger above enforces
-- which fields they may change). Insert/Delete remain admin-only via the
-- existing "Admins can manage profiles" policy.
DROP POLICY IF EXISTS "Command tier can update profiles" ON public.profiles;
CREATE POLICY "Command tier can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
);

-- Update MISD unit assignments policy: include MISD/CYBER supervisors
DROP POLICY IF EXISTS "Cmd manage misd assignments" ON public.misd_unit_assignments;
CREATE POLICY "Manage misd unit assignments"
ON public.misd_unit_assignments
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_misd_supervisor(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_misd_supervisor(auth.uid())
);
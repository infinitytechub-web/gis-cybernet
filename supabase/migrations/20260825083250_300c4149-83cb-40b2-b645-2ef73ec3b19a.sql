CREATE OR REPLACE FUNCTION public.fleet_vehicle_visible(_user_id uuid, _vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fleet_vehicles v
    LEFT JOIN public.profiles p ON p.id = v.assigned_driver_id
    WHERE v.id = _vehicle_id
      AND (
        p.user_id = _user_id
        OR (
          public.can_manage_fleet(_user_id)
          AND (
            public.is_command_tier(_user_id)
            OR v.org_unit_id IS NULL
            OR public.can_view_org_unit(_user_id, v.org_unit_id)
          )
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.fleet_vehicle_visible(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_vehicle_visible(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fleet_vehicle_visible(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Fleet managers view all vehicles" ON public.fleet_vehicles;
CREATE POLICY "Fleet staff view org-scoped vehicles"
ON public.fleet_vehicles FOR SELECT TO authenticated
USING (
  assigned_driver_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR (
    public.can_manage_fleet(auth.uid())
    AND (
      public.is_command_tier(auth.uid())
      OR org_unit_id IS NULL
      OR public.can_view_org_unit(auth.uid(), org_unit_id)
    )
  )
);

DROP POLICY IF EXISTS "Fleet viewers read alerts" ON public.fleet_alerts;
CREATE POLICY "Fleet viewers read org-scoped alerts"
ON public.fleet_alerts FOR SELECT TO authenticated
USING (
  raised_by = auth.uid()
  OR (vehicle_id IS NOT NULL AND public.fleet_vehicle_visible(auth.uid(), vehicle_id))
  OR (vehicle_id IS NULL AND public.is_command_tier(auth.uid()))
);

DROP POLICY IF EXISTS "Fleet staff and assigned drivers read vehicle messages" ON public.fleet_messages;
CREATE POLICY "Fleet staff and drivers read org-scoped messages"
ON public.fleet_messages FOR SELECT TO authenticated
USING (public.fleet_vehicle_visible(auth.uid(), vehicle_id));

DROP POLICY IF EXISTS "Authenticated view misd assignments" ON public.misd_unit_assignments;
CREATE POLICY "Command tier and own record view misd assignments"
ON public.misd_unit_assignments FOR SELECT TO authenticated
USING (
  public.is_command_tier(auth.uid())
  OR profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Authorized officers can insert user roles" ON public.user_roles;
CREATE POLICY "Authorized officers can insert user roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_command_tier(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin')
    OR (user_id <> auth.uid() AND role::text <> 'admin')
  )
);

DROP POLICY IF EXISTS "Authorized officers can update user roles" ON public.user_roles;
CREATE POLICY "Authorized officers can update user roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  public.can_manage_command_tier(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR (user_id <> auth.uid() AND role::text <> 'admin'))
)
WITH CHECK (
  public.can_manage_command_tier(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR (user_id <> auth.uid() AND role::text <> 'admin'))
);

DROP POLICY IF EXISTS "Authorized officers can create grants" ON public.command_tier_grants;
CREATE POLICY "Authorized officers can create grants"
ON public.command_tier_grants FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_command_tier(auth.uid())
  AND granted_by = auth.uid()
  AND (public.has_role(auth.uid(), 'admin') OR user_id <> auth.uid())
);

DROP POLICY IF EXISTS "Authorized officers can update grants" ON public.command_tier_grants;
CREATE POLICY "Authorized officers can update grants"
ON public.command_tier_grants FOR UPDATE TO authenticated
USING (
  public.can_manage_command_tier(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR user_id <> auth.uid())
)
WITH CHECK (
  public.can_manage_command_tier(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR user_id <> auth.uid())
);
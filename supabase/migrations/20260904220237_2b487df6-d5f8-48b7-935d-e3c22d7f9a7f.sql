-- 1. Guard scheduling / roster policies: scope to authenticated role only
DROP POLICY IF EXISTS "Command tier manage schedules" ON public.guard_schedules;
CREATE POLICY "Command tier manage schedules" ON public.guard_schedules FOR ALL TO authenticated
  USING (public.is_roster_manager(auth.uid())) WITH CHECK (public.is_roster_manager(auth.uid()));

DROP POLICY IF EXISTS "Command tier manage assignments" ON public.guard_schedule_assignments;
CREATE POLICY "Command tier manage assignments" ON public.guard_schedule_assignments FOR ALL TO authenticated
  USING (public.is_roster_manager(auth.uid())) WITH CHECK (public.is_roster_manager(auth.uid()));

DROP POLICY IF EXISTS "Command tier read imports" ON public.duty_roster_imports;
CREATE POLICY "Command tier read imports" ON public.duty_roster_imports FOR SELECT TO authenticated
  USING (public.is_roster_manager(auth.uid()));
DROP POLICY IF EXISTS "Command tier insert imports" ON public.duty_roster_imports;
CREATE POLICY "Command tier insert imports" ON public.duty_roster_imports FOR INSERT TO authenticated
  WITH CHECK (public.is_roster_manager(auth.uid()) AND uploaded_by = auth.uid());
DROP POLICY IF EXISTS "Command tier update imports" ON public.duty_roster_imports;
CREATE POLICY "Command tier update imports" ON public.duty_roster_imports FOR UPDATE TO authenticated
  USING (public.is_roster_manager(auth.uid()));
DROP POLICY IF EXISTS "Command tier delete imports" ON public.duty_roster_imports;
CREATE POLICY "Command tier delete imports" ON public.duty_roster_imports FOR DELETE TO authenticated
  USING (public.is_roster_manager(auth.uid()));

DROP POLICY IF EXISTS "Command tier read pending matches" ON public.pending_staff_matches;
CREATE POLICY "Command tier read pending matches" ON public.pending_staff_matches FOR SELECT TO authenticated
  USING (public.is_roster_manager(auth.uid()));
DROP POLICY IF EXISTS "Command tier insert pending matches" ON public.pending_staff_matches;
CREATE POLICY "Command tier insert pending matches" ON public.pending_staff_matches FOR INSERT TO authenticated
  WITH CHECK (public.is_roster_manager(auth.uid()));
DROP POLICY IF EXISTS "Command tier update pending matches" ON public.pending_staff_matches;
CREATE POLICY "Command tier update pending matches" ON public.pending_staff_matches FOR UPDATE TO authenticated
  USING (public.is_roster_manager(auth.uid()));
DROP POLICY IF EXISTS "Command tier delete pending matches" ON public.pending_staff_matches;
CREATE POLICY "Command tier delete pending matches" ON public.pending_staff_matches FOR DELETE TO authenticated
  USING (public.is_roster_manager(auth.uid()));

-- 2. profiles: staff_officer / supervisor edits limited to their own command branch or department
DROP POLICY IF EXISTS "Command tier can update profiles" ON public.profiles;
CREATE POLICY "Command tier can update profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
    OR (
      (public.has_role(auth.uid(), 'staff_officer'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
      AND (
        (org_unit_id IS NOT NULL AND public.has_org_access(auth.uid(), org_unit_id))
        OR (department_id IS NOT NULL AND department_id = public.get_user_department_id(auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
    OR (
      (public.has_role(auth.uid(), 'staff_officer'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
      AND (
        (org_unit_id IS NOT NULL AND public.has_org_access(auth.uid(), org_unit_id))
        OR (department_id IS NOT NULL AND department_id = public.get_user_department_id(auth.uid()))
      )
    )
  );

-- 3. security_monitor_webhooks: signing secrets fully fail-closed for client roles
REVOKE ALL ON public.security_monitor_webhooks FROM anon;
REVOKE ALL ON public.security_monitor_webhooks FROM authenticated;
GRANT ALL ON public.security_monitor_webhooks TO service_role;

DROP POLICY IF EXISTS "Deny all client access to security monitor webhooks" ON public.security_monitor_webhooks;
CREATE POLICY "Deny all client access to security monitor webhooks" ON public.security_monitor_webhooks
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
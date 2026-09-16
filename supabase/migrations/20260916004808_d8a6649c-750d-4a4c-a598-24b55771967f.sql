-- 1) Health reports: restrict from all command-tier roles to medical/administration oversight
DROP POLICY IF EXISTS "Command tier manage health reports" ON public.health_reports;
DROP POLICY IF EXISTS "Command tier or owner view health reports" ON public.health_reports;

CREATE POLICY "Health oversight manage health reports"
ON public.health_reports FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
  OR has_role(auth.uid(), 'medical_officer'::app_role)
  OR has_role(auth.uid(), 'head_of_administration'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
  OR has_role(auth.uid(), 'medical_officer'::app_role)
  OR has_role(auth.uid(), 'head_of_administration'::app_role)
);

CREATE POLICY "Health oversight or owner view health reports"
ON public.health_reports FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
  OR has_role(auth.uid(), 'medical_officer'::app_role)
  OR has_role(auth.uid(), 'head_of_administration'::app_role)
);

-- 2) Night guard activity log: scope supervisor reads to their own department
DROP POLICY IF EXISTS "Supervisors can view night guard activity log" ON public.night_guard_activity_log;

CREATE POLICY "Supervisors view own department night guard activity log"
ON public.night_guard_activity_log FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
  OR (
    (has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'staff_officer'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = night_guard_activity_log.profile_id
        AND p.department_id IS NOT NULL
        AND p.department_id = public.get_user_department_id(auth.uid())
    )
  )
);
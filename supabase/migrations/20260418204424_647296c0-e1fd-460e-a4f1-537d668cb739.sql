-- =========================================================================
-- 1) FIX: privilege escalation via is_shift_leader_tier + profile self-update
-- =========================================================================

-- Remove the self-promotion branch — only explicit shift-leader roles count.
CREATE OR REPLACE FUNCTION public.is_shift_leader_tier(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'shift_supervisor'::app_role)
      OR public.has_role(_user_id, 'deputy_shift_supervisor'::app_role)
      OR public.has_role(_user_id, 'shift_leader'::app_role)
      OR public.has_role(_user_id, 'deputy_shift_leader'::app_role);
$$;

-- Replace the user-self-update policy with a column-restricted version.
-- Existing trigger restrict_profile_updates still enforces field-level rules
-- when non-admins update; this RLS policy adds a hard guard against changing
-- privileged columns on your own row.
DROP POLICY IF EXISTS "Users can update own profile safe fields" ON public.profiles;

CREATE POLICY "Users can update own profile safe fields"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND department_id IS NOT DISTINCT FROM (SELECT department_id FROM public.profiles WHERE user_id = auth.uid())
  AND rank_id        IS NOT DISTINCT FROM (SELECT rank_id        FROM public.profiles WHERE user_id = auth.uid())
  AND status         IS NOT DISTINCT FROM (SELECT status         FROM public.profiles WHERE user_id = auth.uid())
  AND account_locked IS NOT DISTINCT FROM (SELECT account_locked FROM public.profiles WHERE user_id = auth.uid())
  AND login_enabled  IS NOT DISTINCT FROM (SELECT login_enabled  FROM public.profiles WHERE user_id = auth.uid())
  AND staff_id       IS NOT DISTINCT FROM (SELECT staff_id       FROM public.profiles WHERE user_id = auth.uid())
  AND shift_group    IS NOT DISTINCT FROM (SELECT shift_group    FROM public.profiles WHERE user_id = auth.uid())
  AND unit           IS NOT DISTINCT FROM (SELECT unit           FROM public.profiles WHERE user_id = auth.uid())
);

-- =========================================================================
-- 2) FIX: profile_contacts exposed to all authenticated users
-- =========================================================================

DROP POLICY IF EXISTS "Authenticated users can view profile contacts" ON public.profile_contacts;

-- Self-read
CREATE POLICY "Users can view their own contacts"
ON public.profile_contacts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = profile_contacts.profile_id
      AND p.user_id = auth.uid()
  )
);

-- Admins / OIC / 2IC / Staff Officer can view all contacts
CREATE POLICY "Command tier can view all contacts"
ON public.profile_contacts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_command_tier(auth.uid())
);

-- Supervisors can view contacts for staff in their department (or OIC dept)
CREATE POLICY "Supervisors can view department contacts"
ON public.profile_contacts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.profiles staff
    WHERE staff.id = profile_contacts.profile_id
      AND (
        staff.department_id = public.get_user_department_id(auth.uid())
        OR public.get_user_department_id(auth.uid()) = (
          SELECT id FROM public.departments WHERE name = 'OIC' LIMIT 1
        )
      )
  )
);

-- =========================================================================
-- 3) FIX: tighten the audit-log INSERT policy
-- =========================================================================

DROP POLICY IF EXISTS "Authenticated users can insert audit entries" ON public.system_audit_log;

CREATE POLICY "System can insert audit entries"
ON public.system_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  performed_by = auth.uid()
  OR performed_by = '00000000-0000-0000-0000-000000000000'::uuid
);

-- =========================================================================
-- 4) FIX: realtime channel-level authorization for sensitive tables
-- =========================================================================
-- Topics used in the app are the table names (default channel naming).
-- Only command tier, supervisors, shift leaders, and admins may subscribe
-- to row-change broadcasts on sensitive tables. The notifications:{uid}
-- topic policy is left untouched.

-- Helper: which topics are sensitive and need restriction
CREATE OR REPLACE FUNCTION public.is_sensitive_realtime_topic(_topic text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _topic = ANY (ARRAY[
    'visa_applications',
    'visa_extensions',
    'passport_applications',
    'official_applications',
    'enquiry_applications',
    'enforcement_operations',
    'operations',
    'report_uploads',
    -- common channel names used by the client
    'frontdesk-rt',
    'processing-rt',
    'reports-rt',
    'enforcement-rt',
    'operations-rt',
    'misd-rt'
  ]);
$$;

-- Drop any prior version of our policy to keep this idempotent
DROP POLICY IF EXISTS "Restrict sensitive realtime topics" ON realtime.messages;

CREATE POLICY "Restrict sensitive realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  NOT public.is_sensitive_realtime_topic(realtime.topic())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_command_tier(auth.uid())
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
  OR public.is_shift_leader_tier(auth.uid())
);
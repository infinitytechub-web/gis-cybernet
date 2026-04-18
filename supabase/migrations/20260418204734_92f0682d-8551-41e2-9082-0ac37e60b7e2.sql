-- =========================================================================
-- 1) Explicit deny-INSERT for otp_codes (defense in depth)
-- =========================================================================
DROP POLICY IF EXISTS "Block direct OTP inserts" ON public.otp_codes;
CREATE POLICY "Block direct OTP inserts"
ON public.otp_codes
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (false);

-- =========================================================================
-- 2) Restrict user_roles SELECT — block role enumeration
-- =========================================================================
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Command tier can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_command_tier(auth.uid())
);

-- =========================================================================
-- 3) Tighten realtime subscription policy: deny by default for sensitive
--    topics, otherwise require an authenticated, privileged role.
-- =========================================================================
DROP POLICY IF EXISTS "Restrict sensitive realtime topics" ON realtime.messages;

-- Only privileged users may subscribe to sensitive table channels.
CREATE POLICY "Privileged roles can subscribe to sensitive realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_sensitive_realtime_topic(realtime.topic())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_command_tier(auth.uid())
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.is_shift_leader_tier(auth.uid())
  )
);

-- =========================================================================
-- 4) Lock down inventory-photos bucket SELECT to procurement roles
-- =========================================================================
DROP POLICY IF EXISTS "inv-photos view" ON storage.objects;
CREATE POLICY "inv-photos view"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'inventory-photos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
    OR public.has_role(auth.uid(), 'staff_officer'::app_role)
    OR public.has_role(auth.uid(), 'storekeeper'::app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::app_role)
  )
);
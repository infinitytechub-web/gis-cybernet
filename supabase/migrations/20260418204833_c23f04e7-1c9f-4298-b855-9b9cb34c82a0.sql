-- =========================================================================
-- 1) staff-documents: add UPDATE policy for owners
-- =========================================================================
DROP POLICY IF EXISTS "Users update own staff document files" ON storage.objects;
CREATE POLICY "Users update own staff document files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT (p.id)::text FROM public.profiles p WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'staff-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT (p.id)::text FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);

-- =========================================================================
-- 2) detention-photos: add UPDATE and DELETE policies
-- =========================================================================
DROP POLICY IF EXISTS "det-photos update" ON storage.objects;
CREATE POLICY "det-photos update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'detention-photos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'shift_supervisor'::app_role)
    OR public.has_role(auth.uid(), 'deputy_shift_supervisor'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'detention-photos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'shift_supervisor'::app_role)
    OR public.has_role(auth.uid(), 'deputy_shift_supervisor'::app_role)
  )
);

DROP POLICY IF EXISTS "det-photos delete" ON storage.objects;
CREATE POLICY "det-photos delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'detention-photos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
);

-- =========================================================================
-- 3) Realtime: deny-by-default + role-scoped allowlist
-- =========================================================================

-- Helper: front-desk topics
CREATE OR REPLACE FUNCTION public.is_frontdesk_realtime_topic(_topic text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _topic = ANY (ARRAY[
    'visa_applications',
    'visa_extensions',
    'passport_applications',
    'official_applications',
    'enquiry_applications',
    'report_uploads',
    'frontdesk-rt',
    'processing-rt',
    'reports-rt'
  ]);
$$;

-- Replace the previous policy with a strict allowlist
DROP POLICY IF EXISTS "Privileged roles can subscribe to sensitive realtime topics" ON realtime.messages;

-- Privileged users (admin/command/supervisor/shift) — sensitive topics
CREATE POLICY "Privileged subscribers"
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

-- Front desk staff — only Front Desk topics
CREATE POLICY "Front desk subscribers"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_frontdesk_realtime_topic(realtime.topic())
  AND public.has_role(auth.uid(), 'front_desk'::app_role)
);
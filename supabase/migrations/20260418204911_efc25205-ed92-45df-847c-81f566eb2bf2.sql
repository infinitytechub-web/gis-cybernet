-- 1) Remove bare 'notifications' from sensitive list (per-user topic still allowed)
CREATE OR REPLACE FUNCTION public.is_sensitive_realtime_topic(_topic text)
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
    'enforcement_operations',
    'operations',
    'report_uploads',
    'frontdesk-rt',
    'processing-rt',
    'reports-rt',
    'enforcement-rt',
    'operations-rt',
    'misd-rt'
  ]);
$$;

-- 2) Lock submitted_by on report uploads
DROP POLICY IF EXISTS "Shift leaders can submit reports" ON public.report_uploads;
CREATE POLICY "Shift leaders can submit reports"
ON public.report_uploads
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (submitted_by IS NULL OR submitted_by = auth.uid())
  AND (
    public.is_shift_leader_tier(auth.uid())
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.is_command_tier(auth.uid())
  )
);
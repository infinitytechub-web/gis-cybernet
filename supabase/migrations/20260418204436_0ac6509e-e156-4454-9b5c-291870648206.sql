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
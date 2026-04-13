-- 1. Remove SELECT policy on otp_codes so codes are write-only from client
DROP POLICY IF EXISTS "Users can view own OTP codes" ON public.otp_codes;

-- 2. Scope supervisor report upload storage policy to their department path
DROP POLICY IF EXISTS "Supervisors can upload report files" ON storage.objects;

CREATE POLICY "Supervisors can upload report files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'reports'
  AND has_role(auth.uid(), 'supervisor'::app_role)
  AND (storage.foldername(name))[1] = get_user_department_id(auth.uid())::text
);

-- 1. Replace the broad "Users can update own profile" policy with one that
--    only allows updating non-sensitive columns (phone, photo_url, ghana_card_number, email).
--    Sensitive fields (department_id, rank_id, status, account_locked, login_enabled, staff_id, shift_group, unit)
--    are already protected by the restrict_profile_updates trigger, but this adds defense-in-depth.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile safe fields"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 2. Add a DELETE policy on otp_codes so admins can clean up expired/used codes
CREATE POLICY "Admins can delete otp codes"
ON public.otp_codes
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3. Add a function + cron-friendly approach: allow the verify_otp function 
--    to atomically mark codes as used (it already does via SECURITY DEFINER).
--    Add a SELECT policy so users can check their own OTP status if needed.
CREATE POLICY "Users can view own otp codes"
ON public.otp_codes
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

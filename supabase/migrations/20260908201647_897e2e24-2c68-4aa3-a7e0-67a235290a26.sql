-- The only supported insert path for public.otp_codes is the SECURITY DEFINER
-- function public.issue_otp(), which stamps user_id from auth.uid(). Direct
-- table writes are already blocked by RLS (WITH CHECK false); remove the
-- redundant table-level write grants so the privileged function (and
-- service_role for backend jobs) is the sole write path.
REVOKE INSERT, UPDATE ON public.otp_codes FROM anon;
REVOKE INSERT, UPDATE ON public.otp_codes FROM authenticated;

GRANT ALL ON public.otp_codes TO service_role;

REVOKE ALL ON FUNCTION public.issue_otp(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_otp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_otp(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_otp(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.me_approval_reviewer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.me_approval_reviewer() FROM anon;
GRANT EXECUTE ON FUNCTION public.me_approval_reviewer() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_password_policy(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_password_policy(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_password_policy(text) TO authenticated, service_role;
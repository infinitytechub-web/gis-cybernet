REVOKE ALL ON FUNCTION public.set_leave_decision_metadata() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_leave_request_deletion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restrict_leave_request_updates() FROM PUBLIC, anon, authenticated;
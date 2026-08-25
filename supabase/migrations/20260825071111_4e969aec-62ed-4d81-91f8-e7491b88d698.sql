ALTER TABLE public.request_approval_audit
  DROP CONSTRAINT IF EXISTS request_approval_audit_action_check;

ALTER TABLE public.request_approval_audit
  ADD CONSTRAINT request_approval_audit_action_check
  CHECK (action = ANY (ARRAY['approved','rejected','edited','reverted_to_pending','cancelled','deleted']));
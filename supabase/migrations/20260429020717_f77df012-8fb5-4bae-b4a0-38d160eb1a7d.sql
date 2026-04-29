-- Audit log for every attempt to view a staff member's office history.
CREATE TABLE IF NOT EXISTS public.office_history_access_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  viewer_user_id UUID NOT NULL,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL,
  reason TEXT NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_history_access_log_profile
  ON public.office_history_access_log(profile_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_history_access_log_viewer
  ON public.office_history_access_log(viewer_user_id, accessed_at DESC);

ALTER TABLE public.office_history_access_log ENABLE ROW LEVEL SECURITY;

-- Only command tier (admin/OIC/2IC/staff_officer) can read the audit trail.
CREATE POLICY "Command tier reads office-history access log"
ON public.office_history_access_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
);

-- No direct writes from clients — all inserts go through the helper below.
REVOKE INSERT, UPDATE, DELETE ON public.office_history_access_log FROM authenticated, anon, public;

-- Helper RPC: re-evaluates the viewer's permission server-side, then writes
-- the audit entry. Returns the resolved `allowed` boolean so the caller can
-- still gate UI on it (defence-in-depth alongside RLS).
CREATE OR REPLACE FUNCTION public.log_office_history_access(_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  is_command BOOLEAN;
  is_supervisor BOOLEAN;
  is_owner BOOLEAN;
  resolved_allowed BOOLEAN;
  resolved_reason TEXT;
BEGIN
  IF uid IS NULL THEN
    -- Don't log unauthenticated attempts; just deny.
    RETURN FALSE;
  END IF;

  is_command :=
    public.has_role(uid, 'admin')
    OR public.has_role(uid, 'oic')
    OR public.has_role(uid, '2ic')
    OR public.has_role(uid, 'staff_officer');

  is_supervisor := public.is_supervisor_for_profile(uid, _profile_id);

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _profile_id AND p.user_id = uid
  ) INTO is_owner;

  IF is_command THEN
    resolved_allowed := TRUE;
    resolved_reason := 'command_tier';
  ELSIF is_supervisor THEN
    resolved_allowed := TRUE;
    resolved_reason := 'department_supervisor';
  ELSIF is_owner THEN
    resolved_allowed := TRUE;
    resolved_reason := 'profile_owner';
  ELSE
    resolved_allowed := FALSE;
    resolved_reason := 'insufficient_permission';
  END IF;

  INSERT INTO public.office_history_access_log (viewer_user_id, profile_id, allowed, reason)
  VALUES (uid, _profile_id, resolved_allowed, resolved_reason);

  RETURN resolved_allowed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_office_history_access(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_office_history_access(UUID) TO authenticated;

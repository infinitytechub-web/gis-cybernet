-- 1. Tighten bail record deletion
DROP POLICY IF EXISTS "Command tier can delete bail records" ON public.detention_bail_records;
CREATE POLICY "Senior command or unauthorized creator can delete bail records"
ON public.detention_bail_records FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
  OR (
    created_by = auth.uid()
    AND has_command_capability(auth.uid(), 'detention'::text)
    AND coalesce(authorization_status, 'pending') NOT IN ('approved', 'authorized')
    AND authorized_at IS NULL
  )
);

-- 2. Stop broadcasting the permission matrix over realtime
ALTER PUBLICATION supabase_realtime DROP TABLE public.directory_permissions;

-- 3. Prevent requesters from editing review/issue fields on their own fuel requests
CREATE OR REPLACE FUNCTION public.guard_fuel_request_owner_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_command_tier(auth.uid())
     OR can_manage_procurement(auth.uid())
     OR can_manage_fleet(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_by_name IS DISTINCT FROM OLD.reviewed_by_name
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_note IS DISTINCT FROM OLD.review_note
     OR NEW.issued_by IS DISTINCT FROM OLD.issued_by
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.litres_issued IS DISTINCT FROM OLD.litres_issued
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
    RAISE EXCEPTION 'Only reviewers may change the status or review details of a fuel request';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_fuel_request_owner_edit ON public.fuel_requests;
CREATE TRIGGER trg_guard_fuel_request_owner_edit
BEFORE UPDATE ON public.fuel_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_fuel_request_owner_edit();

REVOKE EXECUTE ON FUNCTION public.guard_fuel_request_owner_edit() FROM PUBLIC, anon;
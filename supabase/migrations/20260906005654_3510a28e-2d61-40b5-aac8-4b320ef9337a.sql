-- 1. email_unsubscribe_tokens: scope policies to service_role instead of public
DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;

CREATE POLICY "Service role can insert tokens"
  ON public.email_unsubscribe_tokens FOR INSERT TO service_role
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service role can read tokens"
  ON public.email_unsubscribe_tokens FOR SELECT TO service_role
  USING (auth.role() = 'service_role');
CREATE POLICY "Service role can mark tokens as used"
  ON public.email_unsubscribe_tokens FOR UPDATE TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. procurement-photos storage uploads: verify uploader relationship to the requisition
DROP POLICY IF EXISTS "procurement photos upload" ON storage.objects;
CREATE POLICY "procurement photos upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'procurement-photos'
    AND (
      public.can_manage_procurement(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.purchase_requisitions r
        WHERE r.id::text = split_part(name, '/', 1)
          AND r.requested_by = auth.uid()
          AND r.status IN ('draft', 'submitted')
      )
    )
  );

-- 3. profiles: close the NULL org_unit escape in the restrictive write policy
DROP POLICY IF EXISTS "Org scope restricts profile writes" ON public.profiles;
CREATE POLICY "Org scope restricts profile writes"
  ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR user_id = auth.uid()
    OR (
      org_unit_id IS NULL
      AND NOT (has_role(auth.uid(), 'staff_officer'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
    )
    OR has_org_access(auth.uid(), org_unit_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR user_id = auth.uid()
    OR (
      org_unit_id IS NULL
      AND NOT (has_role(auth.uid(), 'staff_officer'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
    )
    OR has_org_access(auth.uid(), org_unit_id)
  );

-- 4. Audit staff_officer/supervisor-initiated profile updates into system_audit_log
CREATE OR REPLACE FUNCTION public.audit_scoped_profile_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role)
     AND (has_role(auth.uid(), 'staff_officer'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)) THEN
    INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
    VALUES (
      'UPDATE',
      'profiles_scope_write',
      NEW.id,
      auth.uid(),
      jsonb_build_object(
        'org_unit_id', jsonb_build_object('old', OLD.org_unit_id, 'new', NEW.org_unit_id),
        'department_id', jsonb_build_object('old', OLD.department_id, 'new', NEW.department_id)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_scoped_profile_writes ON public.profiles;
CREATE TRIGGER audit_scoped_profile_writes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_scoped_profile_writes();
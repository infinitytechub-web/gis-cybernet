
-- Fix 1: Restrict front desk UPDATE on visa_extensions to own records (matching other application tables)
DROP POLICY IF EXISTS "Front desk can update visa extensions" ON public.visa_extensions;
CREATE POLICY "Front desk can update own processed visa extensions"
ON public.visa_extensions FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid())
WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid());

-- Also restrict front desk SELECT on visa_extensions to own records (matching other tables)
DROP POLICY IF EXISTS "Front desk can view visa extensions" ON public.visa_extensions;
CREATE POLICY "Front desk can view own processed visa extensions"
ON public.visa_extensions FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid());

-- Add auto-set processed_by trigger for visa_extensions (matching passport/enquiry pattern)
CREATE OR REPLACE FUNCTION public.set_visa_ext_processed_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.processed_by IS NULL THEN
    NEW.processed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_visa_ext_processed_by
BEFORE INSERT ON public.visa_extensions
FOR EACH ROW
EXECUTE FUNCTION public.set_visa_ext_processed_by();

-- Fix 2: Restrict report_uploads staff SELECT to supervisors and above
DROP POLICY IF EXISTS "Staff can view department reports" ON public.report_uploads;
CREATE POLICY "Supervisors can view department reports"
ON public.report_uploads FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role))
  AND department_id = get_user_department_id(auth.uid())
);

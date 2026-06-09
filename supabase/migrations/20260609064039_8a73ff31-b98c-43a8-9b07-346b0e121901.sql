DROP TABLE IF EXISTS public._delete_diag;

CREATE OR REPLACE FUNCTION public.block_sao_mutations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Internal/service-role calls (no JWT) and admins may mutate (covers
  -- profile cascade deletes triggered by admin-delete-staff-account).
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'shift_assignment_overrides is append-only';
END $function$;
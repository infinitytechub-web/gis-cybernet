
ALTER TABLE public.detention_records ADD COLUMN IF NOT EXISTS marital_status text;

CREATE OR REPLACE FUNCTION public.log_profile_marital_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.marital_status IS DISTINCT FROM OLD.marital_status THEN
    INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
    VALUES (
      'marital_status_changed',
      'profile',
      NEW.id,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      jsonb_build_object(
        'staff_id', NEW.staff_id,
        'old_value', OLD.marital_status,
        'new_value', NEW.marital_status
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_profile_marital_status ON public.profiles;
CREATE TRIGGER trg_log_profile_marital_status
AFTER UPDATE OF marital_status ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_profile_marital_status_change();

ALTER TABLE public.detention_records
  ADD COLUMN IF NOT EXISTS referred_from text,
  ADD COLUMN IF NOT EXISTS referred_to text,
  ADD COLUMN IF NOT EXISTS statement_approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS statement_approved_by_name text,
  ADD COLUMN IF NOT EXISTS statement_approved_at timestamptz;

ALTER TABLE public.detention_records DROP CONSTRAINT IF EXISTS detention_records_status_check;
ALTER TABLE public.detention_records ADD CONSTRAINT detention_records_status_check
  CHECK (status = ANY (ARRAY['in_custody','released','bail','transferred','court','escaped','repatriated','deported']));

CREATE OR REPLACE FUNCTION public.guard_detention_statement_approver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    changed := NEW.statement_approved_by IS NOT NULL OR NEW.statement_approved_by_name IS NOT NULL;
  ELSE
    changed := (COALESCE(NEW.statement_approved_by::text,'') <> COALESCE(OLD.statement_approved_by::text,''))
            OR (COALESCE(NEW.statement_approved_by_name,'') <> COALESCE(OLD.statement_approved_by_name,''));
  END IF;

  IF changed AND auth.uid() IS NOT NULL AND NOT (
       has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'oic'::app_role)
    OR has_role(auth.uid(), '2ic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only Admin, OIC or 2IC may set the statement approver';
  END IF;

  IF changed AND NEW.statement_approved_by IS NOT NULL AND NEW.statement_approved_at IS NULL THEN
    NEW.statement_approved_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_det_statement_approver ON public.detention_records;
CREATE TRIGGER trg_det_statement_approver
  BEFORE INSERT OR UPDATE ON public.detention_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_detention_statement_approver();
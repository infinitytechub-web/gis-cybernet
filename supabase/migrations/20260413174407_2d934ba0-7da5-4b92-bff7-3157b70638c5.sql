
-- Auto-set processed_by on passport application insert
CREATE OR REPLACE FUNCTION public.set_passport_processed_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.processed_by IS NULL THEN
    NEW.processed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_passport_processed_by_trigger
  BEFORE INSERT ON public.passport_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_passport_processed_by();

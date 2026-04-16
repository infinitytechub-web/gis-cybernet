-- Auto-set processed_by on enquiry_applications INSERT (mirrors set_passport_processed_by)
CREATE OR REPLACE FUNCTION public.set_enquiry_processed_by()
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

CREATE TRIGGER trg_set_enquiry_processed_by
BEFORE INSERT ON public.enquiry_applications
FOR EACH ROW
EXECUTE FUNCTION public.set_enquiry_processed_by();
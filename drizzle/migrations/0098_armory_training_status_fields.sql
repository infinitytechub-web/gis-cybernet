CREATE OR REPLACE FUNCTION public.armory_validate_training()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
 IF NEW.kind <> 'certification' THEN RETURN NEW; END IF;
 IF COALESCE(NEW.details->>'training_month','') <> '' AND (NEW.details->>'training_month' !~ '^(19|20)\d{2}-(0[1-9]|1[0-2])$') THEN
   RAISE EXCEPTION 'Training month must be a year and month';
 END IF;
 IF COALESCE(NEW.details->>'training_status','') <> '' AND NEW.details->>'training_status' NOT IN
   ('Qualified','Refresher due','Qualification expired','Training scheduled','In training','Remedial training required','Not qualified','Exempt') THEN
   RAISE EXCEPTION 'Invalid training status';
 END IF;
 IF length(COALESCE(NEW.details->>'location','')) > 200 THEN RAISE EXCEPTION 'Training location is too long'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS armory_validate_training ON public.armory_records;
CREATE TRIGGER armory_validate_training BEFORE INSERT OR UPDATE ON public.armory_records
FOR EACH ROW EXECUTE FUNCTION public.armory_validate_training();
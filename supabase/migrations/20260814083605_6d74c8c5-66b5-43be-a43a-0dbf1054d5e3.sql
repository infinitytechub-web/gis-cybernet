ALTER TABLE public.detention_records
  ADD COLUMN IF NOT EXISTS archive_review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS archive_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reviewed_by_name text,
  ADD COLUMN IF NOT EXISTS archive_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_review_reason text;

CREATE OR REPLACE FUNCTION public.guard_detention_archive_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  changed boolean;
BEGIN
  IF NEW.archive_review_status NOT IN ('pending', 'approved', 'denied') THEN
    RAISE EXCEPTION 'Invalid archive review status: %', NEW.archive_review_status;
  END IF;

  IF TG_OP = 'INSERT' THEN
    changed := NEW.archive_review_status <> 'pending';
  ELSE
    changed := COALESCE(NEW.archive_review_status, '') <> COALESCE(OLD.archive_review_status, '');
  END IF;

  IF NOT changed THEN
    RETURN NEW;
  END IF;

  -- Authority: only Admin, OIC or 2IC may approve or deny an archived record.
  IF auth.uid() IS NOT NULL AND NOT (
       has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'oic'::app_role)
    OR has_role(auth.uid(), '2ic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only Admin, OIC or 2IC may approve or deny an archived detention record';
  END IF;

  IF NEW.archive_review_status = 'denied'
     AND COALESCE(btrim(NEW.archive_review_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required when denying an archived detention record';
  END IF;

  IF NEW.archive_review_status = 'pending' THEN
    NEW.archive_reviewed_by := NULL;
    NEW.archive_reviewed_by_name := NULL;
    NEW.archive_reviewed_at := NULL;
  ELSE
    NEW.archive_reviewed_by := COALESCE(NEW.archive_reviewed_by, auth.uid());
    NEW.archive_reviewed_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_detention_archive_review ON public.detention_records;
CREATE TRIGGER trg_guard_detention_archive_review
  BEFORE INSERT OR UPDATE ON public.detention_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_detention_archive_review();
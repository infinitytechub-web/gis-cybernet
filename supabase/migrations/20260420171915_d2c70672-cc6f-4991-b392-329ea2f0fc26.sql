-- Auto-notify the next approver at each IPSE forward step
CREATE OR REPLACE FUNCTION public.notify_ipse_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _submitter uuid;
BEGIN
  -- Only fire on actual ipse_status transitions
  IF TG_OP <> 'UPDATE' OR OLD.ipse_status IS NOT DISTINCT FROM NEW.ipse_status THEN
    RETURN NEW;
  END IF;

  _submitter := COALESCE(NEW.submitted_by, NEW.uploaded_by);

  IF NEW.ipse_status = 'forwarded_to_2ic' THEN
    PERFORM public.notify_roles(
      ARRAY['admin','2ic']::app_role[],
      'IPSE Report — Awaiting 2IC',
      format('"%s" forwarded by IPSE (severity: %s).', NEW.title, COALESCE(upper(NEW.severity),'—')),
      'general',
      NEW.id
    );
  ELSIF NEW.ipse_status = 'forwarded_to_oic' THEN
    PERFORM public.notify_roles(
      ARRAY['admin','oic']::app_role[],
      'IPSE Report — Awaiting OIC',
      format('"%s" forwarded by 2IC for final approval (severity: %s).', NEW.title, COALESCE(upper(NEW.severity),'—')),
      'general',
      NEW.id
    );
  ELSIF NEW.ipse_status = 'approved' THEN
    -- Notify submitter that report is approved
    IF _submitter IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_id)
      VALUES (_submitter, 'Report Approved', format('Your report "%s" has been approved by the OIC.', NEW.title), 'general', NEW.id);
    END IF;
  ELSIF NEW.ipse_status = 'rejected' THEN
    IF _submitter IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_id)
      VALUES (_submitter, 'Report Returned', format('Your report "%s" was returned. Comment: %s', NEW.title, COALESCE(NEW.review_comment,'(none)')), 'general', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_ipse_workflow_trg ON public.report_uploads;
CREATE TRIGGER notify_ipse_workflow_trg
AFTER UPDATE ON public.report_uploads
FOR EACH ROW
EXECUTE FUNCTION public.notify_ipse_workflow();

-- Also notify IPSE on initial submission so they can triage
CREATE OR REPLACE FUNCTION public.notify_ipse_on_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.ipse_status = 'pending_ipse' THEN
    PERFORM public.notify_roles(
      ARRAY['admin','ipse_supervisor','ipse_deputy_supervisor']::app_role[],
      'New Report for IPSE Triage',
      format('"%s" submitted — assign severity and forward.', NEW.title),
      'general',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_ipse_on_submission_trg ON public.report_uploads;
CREATE TRIGGER notify_ipse_on_submission_trg
AFTER INSERT ON public.report_uploads
FOR EACH ROW
EXECUTE FUNCTION public.notify_ipse_on_submission();
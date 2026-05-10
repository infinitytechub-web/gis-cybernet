
CREATE OR REPLACE FUNCTION public.notify_profile_change_request_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_fields TEXT;
BEGIN
  -- Only fire when status actually changes and it's a review outcome
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','rejected','pending') THEN

    SELECT string_agg(k, ', ')
      INTO v_fields
      FROM jsonb_object_keys(COALESCE(NEW.requested_changes, '{}'::jsonb)) AS k;

    IF NEW.status = 'approved' THEN
      v_title := 'Profile change approved';
      v_message := 'Your profile change request was approved and applied'
        || COALESCE(' (fields: ' || v_fields || ')', '') || '.';
    ELSIF NEW.status = 'rejected' THEN
      v_title := 'Profile change rejected';
      v_message := 'Your profile change request was rejected'
        || COALESCE(' (fields: ' || v_fields || ')', '')
        || COALESCE('. Reviewer notes: ' || NEW.reviewer_notes, '') || '.';
    ELSE
      v_title := 'Profile change marked pending';
      v_message := 'Your profile change request was marked pending for further review'
        || COALESCE('. Reviewer notes: ' || NEW.reviewer_notes, '') || '.';
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type, reference_id)
    VALUES (NEW.user_id, v_title, v_message, 'general', NEW.id);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_profile_change_request_review failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_profile_change_review ON public.profile_change_requests;
CREATE TRIGGER trg_notify_profile_change_review
AFTER UPDATE OF status ON public.profile_change_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_profile_change_request_review();

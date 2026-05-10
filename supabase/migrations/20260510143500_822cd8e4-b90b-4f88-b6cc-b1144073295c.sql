CREATE OR REPLACE FUNCTION public.notify_rotation_proposal_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposer_user uuid;
  v_summary text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    -- Notify all approvers
    INSERT INTO public.notifications (user_id, title, message, type, reference_id)
    SELECT DISTINCT ur.user_id,
      'New rotation proposal: ' || NEW.title,
      'A ' ||
      CASE WHEN COALESCE(NEW.pattern->>'scope','unit_wide') = 'reassignment'
           THEN 'reassignment'
           ELSE 'cycle pattern'
      END
      || ' proposal is awaiting your review (effective ' || NEW.effective_from::text || ').',
      'shift',
      NEW.id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin','oic','2ic','chief_staff_officer','head_of_administration');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','rejected') THEN
    SELECT user_id INTO v_proposer_user
      FROM public.profiles WHERE id = NEW.proposer_id;

    v_summary := 'Your rotation proposal "' || NEW.title || '" was '
              || NEW.status
              || COALESCE(' — ' || NULLIF(NEW.review_comment, ''), '') || '.';

    IF v_proposer_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_id)
      VALUES (
        v_proposer_user,
        CASE NEW.status WHEN 'approved' THEN 'Rotation proposal approved'
                        ELSE 'Rotation proposal rejected' END,
        v_summary,
        'shift',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_rotation_proposal
  ON public.rotation_change_proposals;
CREATE TRIGGER trg_notify_rotation_proposal
  AFTER INSERT OR UPDATE OF status
  ON public.rotation_change_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_rotation_proposal_event();
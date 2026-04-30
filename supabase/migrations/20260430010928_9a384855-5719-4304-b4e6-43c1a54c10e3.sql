CREATE OR REPLACE FUNCTION public.notify_interlink_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _target_user uuid;
  _target_email text;
  _title text;
  _message text;
  _state text;
  _project_url text := 'https://ebndffutyrgybsduvijo.supabase.co/functions/v1/send-record-email';
  _anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVibmRmZnV0eXJneWJzZHV2aWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTQ0OTQsImV4cCI6MjA5MDg3MDQ5NH0.8P0c15nRrp0l0Q--wmOq1av9xumK6yB0TTzEE_iz_zE';
BEGIN
  -- Only fire when workflow_state actually transitions
  IF TG_OP = 'INSERT' THEN
    _state := NEW.workflow_state;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.workflow_state IS NOT DISTINCT FROM NEW.workflow_state THEN
      RETURN NEW;
    END IF;
    _state := NEW.workflow_state;
  ELSE
    RETURN NEW;
  END IF;

  -- Pick target based on the new state
  IF _state = 'draft' AND NEW.reviewer_id IS NOT NULL THEN
    _target_user := NEW.reviewer_id;
    _title := 'Interlink — Review requested';
    _message := format('A new dispatch "%s" is awaiting your review.', NEW.subject);
  ELSIF _state = 'review' THEN
    _target_user := NEW.approver_id;  -- may be null → fall through to broadcast
    _title := 'Interlink — Approval requested';
    _message := format('Dispatch "%s" has been reviewed and needs your approval.', NEW.subject);
  ELSE
    RETURN NEW;
  END IF;

  -- In-app: targeted recipient if known, otherwise broadcast to command tier
  IF _target_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, reference_id)
    VALUES (_target_user, _title, _message, 'general', NEW.id);

    -- Resolve email
    SELECT u.email INTO _target_email
    FROM auth.users u WHERE u.id = _target_user LIMIT 1;
  ELSE
    PERFORM public.notify_roles(
      ARRAY['admin','oic','2ic','staff_officer']::app_role[],
      _title, _message, 'general', NEW.id
    );
  END IF;

  -- Email via existing send-record-email function (best-effort)
  IF _target_email IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := _project_url,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey', _anon,
          'Authorization', 'Bearer ' || _anon
        ),
        body := jsonb_build_object(
          'recipients', ARRAY[_target_email],
          'bulk', true,
          'subject', _title,
          'message', _message || E'\n\nDispatch ID: ' || NEW.id::text || E'\nScope: ' || NEW.scope ||
                     E'\nRecipients: ' || NEW.recipient_count::text ||
                     E'\nAttachments: ' || NEW.attachment_count::text,
          'attachment_base64', encode(convert_to(_message, 'UTF8'), 'base64'),
          'attachment_filename', 'interlink-notification.txt',
          'record_kind', 'interlink_workflow_notice',
          'record_id', NEW.id
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'interlink workflow email dispatch failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_interlink_workflow failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_interlink_workflow_notify ON public.interlink_dispatches;
CREATE TRIGGER trg_interlink_workflow_notify
  AFTER INSERT OR UPDATE OF workflow_state ON public.interlink_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.notify_interlink_workflow();
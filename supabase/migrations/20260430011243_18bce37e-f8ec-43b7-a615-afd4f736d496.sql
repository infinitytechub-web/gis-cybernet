-- ============================================================
-- 1. Notification log table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.interlink_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.interlink_dispatches(id) ON DELETE CASCADE,
  target_user_id uuid,
  target_email text,
  channel text NOT NULL CHECK (channel IN ('email','in_app','broadcast')),
  event text NOT NULL,                          -- e.g. review_requested, approval_requested
  workflow_state text,                          -- snapshot
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','retrying')),
  error_message text,
  attempt_count integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  resent_by uuid,                               -- last user who triggered manual resend
  resent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interlink_notif_log_dispatch ON public.interlink_notification_log(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_interlink_notif_log_status ON public.interlink_notification_log(status, created_at DESC);

ALTER TABLE public.interlink_notification_log ENABLE ROW LEVEL SECURITY;

-- View: command tier
CREATE POLICY "Command tier can view interlink notif log"
ON public.interlink_notification_log FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
  OR public.has_role(auth.uid(), 'supervisor')
);

-- Update (mark resent): admin + oic only
CREATE POLICY "Admin/OIC can update interlink notif log"
ON public.interlink_notification_log FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'oic')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'oic')
);

-- Insert: only via trigger / service role (no client policy needed; trigger uses SECURITY DEFINER paths)
-- We add a permissive insert for service_role implicitly via no policy + RLS, but allow command tier to insert
-- (defensive — edge function uses anon key with explicit auth from client)
CREATE POLICY "Command tier can insert interlink notif log"
ON public.interlink_notification_log FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
);

-- ============================================================
-- 2. Helper: who can export Interlink logs
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_export_interlink_logs(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'oic');
$$;

-- ============================================================
-- 3. Update notify_interlink_workflow to log every attempt
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_interlink_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _state text;
  _target_user uuid;
  _target_email text;
  _title text;
  _message text;
  _event text;
  _project_url text := 'https://ebndffutyrgybsduvijo.supabase.co/functions/v1/send-record-email';
  _anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVibmRmZnV0eXJneWJzZHV2aWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTQ0OTQsImV4cCI6MjA5MDg3MDQ5NH0.8P0c15nRrp0l0Q--wmOq1av9xumK6yB0TTzEE_iz_zE';
  _http_status int;
  _err text;
BEGIN
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

  IF _state = 'draft' AND NEW.reviewer_id IS NOT NULL THEN
    _target_user := NEW.reviewer_id;
    _title := 'Interlink — Review requested';
    _message := format('A new dispatch "%s" is awaiting your review.', NEW.subject);
    _event := 'review_requested';
  ELSIF _state = 'review' THEN
    _target_user := NEW.approver_id;
    _title := 'Interlink — Approval requested';
    _message := format('Dispatch "%s" has been reviewed and needs your approval.', NEW.subject);
    _event := 'approval_requested';
  ELSE
    RETURN NEW;
  END IF;

  IF _target_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, reference_id)
    VALUES (_target_user, _title, _message, 'general', NEW.id);

    SELECT u.email INTO _target_email
    FROM auth.users u WHERE u.id = _target_user LIMIT 1;
  ELSE
    PERFORM public.notify_roles(
      ARRAY['admin','oic','2ic','staff_officer']::app_role[],
      _title, _message, 'general', NEW.id
    );
    INSERT INTO public.interlink_notification_log
      (dispatch_id, target_user_id, target_email, channel, event, workflow_state, status, attempt_count)
    VALUES (NEW.id, NULL, NULL, 'broadcast', _event, _state, 'sent', 1);
    RETURN NEW;
  END IF;

  -- Best-effort email via pg_net
  IF _target_email IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := _project_url,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || _anon
        ),
        body := jsonb_build_object(
          'to', _target_email,
          'subject', _title,
          'message', _message,
          'recordType','interlink_workflow',
          'recordId', NEW.id::text
        )
      );
      INSERT INTO public.interlink_notification_log
        (dispatch_id, target_user_id, target_email, channel, event, workflow_state, status, attempt_count)
      VALUES (NEW.id, _target_user, _target_email, 'email', _event, _state, 'sent', 1);
    EXCEPTION WHEN OTHERS THEN
      _err := SQLERRM;
      INSERT INTO public.interlink_notification_log
        (dispatch_id, target_user_id, target_email, channel, event, workflow_state, status, attempt_count, error_message)
      VALUES (NEW.id, _target_user, _target_email, 'email', _event, _state, 'failed', 1, _err);
    END;
  ELSE
    INSERT INTO public.interlink_notification_log
      (dispatch_id, target_user_id, target_email, channel, event, workflow_state, status, attempt_count, error_message)
    VALUES (NEW.id, _target_user, NULL, 'email', _event, _state, 'failed', 1, 'no email on file for target user');
  END IF;

  RETURN NEW;
END;
$$;

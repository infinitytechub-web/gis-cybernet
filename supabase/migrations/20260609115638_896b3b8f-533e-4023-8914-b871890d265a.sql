-- Remove notifications table from supabase_realtime publication so per-user rows
-- are no longer broadcast to every authenticated subscriber (postgres_changes
-- bypasses row-level RLS). Replace with a per-user private Broadcast channel.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications';
  END IF;
END $$;

-- Trigger function: send the inserted notification to the recipient's private
-- Broadcast topic. Topic format matches the existing realtime.messages SELECT
-- policy: 'notifications:<user_id>'.
CREATE OR REPLACE FUNCTION public.broadcast_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'id', NEW.id,
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'type', NEW.type,
      'reference_id', NEW.reference_id,
      'is_read', NEW.is_read,
      'created_at', NEW.created_at
    ),
    'new_notification',
    'notifications:' || NEW.user_id::text,
    true
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the insert if broadcast fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_notification_insert_trg ON public.notifications;
CREATE TRIGGER broadcast_notification_insert_trg
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.broadcast_notification_insert();
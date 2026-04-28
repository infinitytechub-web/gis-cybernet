-- Event type enum
DO $$ BEGIN
  CREATE TYPE public.presence_event_type AS ENUM ('heartbeat', 'prune');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.presence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type public.presence_event_type NOT NULL,
  current_page TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pruned_at TIMESTAMPTZ,
  window_minutes INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presence_events_user_created
  ON public.presence_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presence_events_created
  ON public.presence_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presence_events_type_created
  ON public.presence_events (event_type, created_at DESC);

ALTER TABLE public.presence_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users may record only their own presence events
CREATE POLICY "Users can insert own presence events"
ON public.presence_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admins can read all presence events
CREATE POLICY "Admins can view all presence events"
ON public.presence_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can purge presence events
CREATE POLICY "Admins can delete presence events"
ON public.presence_events
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Self-cleanup helper: removes rows older than _retention_days (default 7).
CREATE OR REPLACE FUNCTION public.purge_old_presence_events(_retention_days integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _deleted integer;
BEGIN
  DELETE FROM public.presence_events
  WHERE created_at < now() - make_interval(days => GREATEST(1, _retention_days));
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_presence_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_presence_events(integer) TO authenticated;
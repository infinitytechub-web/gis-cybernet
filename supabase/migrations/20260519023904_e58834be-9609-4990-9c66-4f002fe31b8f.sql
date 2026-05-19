ALTER PUBLICATION supabase_realtime ADD TABLE public.presence_events;
ALTER TABLE public.presence_events REPLICA IDENTITY FULL;
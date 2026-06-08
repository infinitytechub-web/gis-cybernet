DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='report_uploads') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.report_uploads';
  END IF;
END $$;
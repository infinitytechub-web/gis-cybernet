DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['visa_applications','visa_extensions','passport_applications','official_applications','enquiry_applications']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
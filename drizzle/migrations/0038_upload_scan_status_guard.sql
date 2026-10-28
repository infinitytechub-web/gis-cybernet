ALTER TABLE public.detention_records ADD COLUMN IF NOT EXISTS mugshot_scan_status text NOT NULL DEFAULT 'pending';
CREATE OR REPLACE FUNCTION public.guard_scan_status() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE col text := TG_ARGV[0]; pathcol text := TG_ARGV[1]; newv text; oldv text; newp text; oldp text;
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' OR current_user IN ('postgres','service_role','supabase_admin') THEN RETURN NEW; END IF;
  EXECUTE format('SELECT ($1).%I::text, ($1).%I::text', col, pathcol) INTO newv, newp USING NEW;
  IF TG_OP = 'UPDATE' THEN
    EXECUTE format('SELECT ($1).%I::text, ($1).%I::text', col, pathcol) INTO oldv, oldp USING OLD;
    IF newp IS DISTINCT FROM oldp THEN NEW := jsonb_populate_record(NEW, jsonb_build_object(col, 'pending'));
    ELSIF newv IS DISTINCT FROM oldv THEN RAISE EXCEPTION 'Scan status can only be set by the virus scanner'; END IF;
  ELSE
    NEW := jsonb_populate_record(NEW, jsonb_build_object(col, 'pending'));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_scan_guard_docs BEFORE INSERT OR UPDATE ON public.suspect_documents FOR EACH ROW EXECUTE FUNCTION public.guard_scan_status('scan_status','file_path');
CREATE TRIGGER trg_scan_guard_sureties BEFORE INSERT OR UPDATE ON public.detention_sureties FOR EACH ROW EXECUTE FUNCTION public.guard_scan_status('scan_status','photo_path');
CREATE TRIGGER trg_scan_guard_mugshot BEFORE UPDATE OF mugshot_url, mugshot_scan_status ON public.detention_records FOR EACH ROW EXECUTE FUNCTION public.guard_scan_status('mugshot_scan_status','mugshot_url');
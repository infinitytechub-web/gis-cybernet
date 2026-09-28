DO $$
DECLARE r record; d text;
BEGIN
  FOR r IN SELECT oid FROM pg_proc WHERE proname IN ('fuel_request_create','fuel_request_set_status') AND pronamespace='public'::regnamespace LOOP
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'full_name', 'nullif(btrim(coalesce(first_name,'''')||'' ''||coalesce(last_name,'''')),'''')');
    EXECUTE d;
  END LOOP;
END $$;
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'medical_records','excuse_duty_forms','profile_change_requests','mfa_review_audit',
    'profiles','forced_signouts','failed_login_attempts','ip_block_audit',
    'shift_change_requests','compliance_upload_audit','interlink_dispatches',
    'interlink_schedules','interlink_approval_actions','shift_rotation_config_audit',
    'medical_appointments','medical_inventory_audit','health_reports','medical_inventory'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
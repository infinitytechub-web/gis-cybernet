
-- P0: Restrict medical_appointment_audit INSERT to service_role only
DROP POLICY IF EXISTS "System inserts appointment audit" ON public.medical_appointment_audit;
CREATE POLICY "Only service role inserts appointment audit"
  ON public.medical_appointment_audit FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'service_role');

-- P1: Tighten inventory_audit_schedules UPDATE WITH CHECK
ALTER POLICY audit_sched_update ON public.inventory_audit_schedules
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'oic'::app_role)
    OR has_role(auth.uid(),'2ic'::app_role)
    OR has_role(auth.uid(),'storekeeper'::app_role)
  );

-- P2: Pin search_path on 8 functions
ALTER FUNCTION public.block_security_audit_mutation() SET search_path = public, pg_temp;
ALTER FUNCTION public.block_threshold_audit_mutation() SET search_path = public, pg_temp;
ALTER FUNCTION public.compute_interlink_next_run(_frequency text, _run_time text, _day_of_week smallint, _day_of_month smallint, _from timestamp with time zone) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_email(queue_name text, message_id bigint) SET search_path = public, pg_temp;
ALTER FUNCTION public.enqueue_email(queue_name text, payload jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_interlink_schedule_next_run() SET search_path = public, pg_temp;

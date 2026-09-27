ALTER TABLE public.guard_schedules ADD COLUMN IF NOT EXISTS source_format text;

CREATE TABLE IF NOT EXISTS public.guard_duty_import_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid,
  actor_id uuid,
  action text NOT NULL,
  source_format text,
  schedule_name text,
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.guard_duty_import_audit TO authenticated;
GRANT ALL ON public.guard_duty_import_audit TO service_role;
ALTER TABLE public.guard_duty_import_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read guard import audit" ON public.guard_duty_import_audit
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.guard_schedule_import_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source_format IS NULL OR NEW.source_format NOT IN ('xlsx','csv') THEN
      RAISE EXCEPTION 'Guard Duty Import accepts only Excel (.xlsx) or CSV (.csv) files';
    END IF;
    IF auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
  ELSIF NEW.source_format IS DISTINCT FROM OLD.source_format THEN
    RAISE EXCEPTION 'Import source format cannot be changed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_schedule_import_guard ON public.guard_schedules;
CREATE TRIGGER trg_guard_schedule_import_guard BEFORE INSERT OR UPDATE ON public.guard_schedules
  FOR EACH ROW EXECUTE FUNCTION public.guard_schedule_import_guard();

CREATE OR REPLACE FUNCTION public.guard_schedule_import_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO public.guard_duty_import_audit(schedule_id, actor_id, action, source_format, schedule_name, start_date, end_date)
  VALUES (r.id, auth.uid(), lower(TG_OP), r.source_format, r.name, r.start_date, r.end_date);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_guard_schedule_import_audit ON public.guard_schedules;
CREATE TRIGGER trg_guard_schedule_import_audit AFTER INSERT OR UPDATE OR DELETE ON public.guard_schedules
  FOR EACH ROW EXECUTE FUNCTION public.guard_schedule_import_audit();

CREATE OR REPLACE FUNCTION public.block_guard_import_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'Audit rows are immutable'; END $$;
CREATE TRIGGER trg_block_guard_import_audit BEFORE UPDATE OR DELETE ON public.guard_duty_import_audit
  FOR EACH ROW EXECUTE FUNCTION public.block_guard_import_audit_mutation();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.guard_schedules;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
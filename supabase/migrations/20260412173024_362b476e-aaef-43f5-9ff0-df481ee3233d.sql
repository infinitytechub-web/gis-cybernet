
-- Create the system audit log table
CREATE TABLE public.system_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  performed_by uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view system audit logs"
  ON public.system_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only system (via triggers) can insert
CREATE POLICY "System can insert audit logs"
  ON public.system_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Admins can delete old logs
CREATE POLICY "Admins can delete audit logs"
  ON public.system_audit_log FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create index for fast lookups
CREATE INDEX idx_system_audit_log_created_at ON public.system_audit_log (created_at DESC);
CREATE INDEX idx_system_audit_log_entity_type ON public.system_audit_log (entity_type);
CREATE INDEX idx_system_audit_log_performed_by ON public.system_audit_log (performed_by);

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION public.log_system_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _action text;
  _details jsonb;
  _entity_id uuid;
  _performed_by uuid;
BEGIN
  _performed_by := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  
  IF TG_OP = 'INSERT' THEN
    _action := 'created';
    _entity_id := NEW.id;
    _details := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'updated';
    _entity_id := NEW.id;
    _details := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'deleted';
    _entity_id := OLD.id;
    _details := to_jsonb(OLD);
  END IF;

  INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
  VALUES (_action, TG_TABLE_NAME, _entity_id, _performed_by, _details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers to key tables
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

CREATE TRIGGER audit_leave_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

CREATE TRIGGER audit_postings_transfers
  AFTER INSERT OR UPDATE OR DELETE ON public.postings_transfers
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

CREATE TRIGGER audit_attendances
  AFTER INSERT OR UPDATE OR DELETE ON public.attendances
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

CREATE TRIGGER audit_departments
  AFTER INSERT OR UPDATE OR DELETE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

CREATE TRIGGER audit_shifts
  AFTER INSERT OR UPDATE OR DELETE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

CREATE TRIGGER audit_announcements
  AFTER INSERT OR UPDATE OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

CREATE TRIGGER audit_shift_assignments
  AFTER INSERT OR UPDATE OR DELETE ON public.shift_assignments
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

CREATE TRIGGER audit_holidays
  AFTER INSERT OR UPDATE OR DELETE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

CREATE TRIGGER audit_report_schedules
  AFTER INSERT OR UPDATE OR DELETE ON public.report_schedules
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

CREATE TRIGGER audit_security_incidents
  AFTER INSERT OR UPDATE OR DELETE ON public.security_incidents
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

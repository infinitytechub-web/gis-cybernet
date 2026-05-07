
-- Appointment override fields + audit table
ALTER TABLE public.medical_appointments
  ADD COLUMN IF NOT EXISTS conflict_override_by uuid,
  ADD COLUMN IF NOT EXISTS conflict_override_role text,
  ADD COLUMN IF NOT EXISTS conflict_override_reason text,
  ADD COLUMN IF NOT EXISTS conflict_override_at timestamptz;

CREATE TABLE IF NOT EXISTS public.medical_appointment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid,
  action text NOT NULL,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  details jsonb,
  before_data jsonb,
  after_data jsonb
);
CREATE INDEX IF NOT EXISTS idx_appt_audit_time ON public.medical_appointment_audit(performed_at DESC);

ALTER TABLE public.medical_appointment_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Command can read appointment audit" ON public.medical_appointment_audit;
CREATE POLICY "Command can read appointment audit" ON public.medical_appointment_audit
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'staff_officer')
    OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'head_of_administration')
  );

DROP POLICY IF EXISTS "System inserts appointment audit" ON public.medical_appointment_audit;
CREATE POLICY "System inserts appointment audit" ON public.medical_appointment_audit
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Replace double-book trigger to honor explicit overrides + log them
CREATE OR REPLACE FUNCTION public.prevent_appointment_double_book()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _conflict uuid; _is_authorized boolean;
BEGIN
  IF NEW.status IN ('cancelled','no_show') THEN RETURN NEW; END IF;

  SELECT id INTO _conflict FROM medical_appointments
   WHERE staff_profile_id = NEW.staff_profile_id
     AND scheduled_at = NEW.scheduled_at
     AND status NOT IN ('cancelled','no_show')
     AND id <> COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid)
   LIMIT 1;

  IF _conflict IS NULL THEN RETURN NEW; END IF;

  -- Conflict exists. Allow ONLY if a valid override is set on this row.
  IF NEW.conflict_override_by IS NULL OR COALESCE(trim(NEW.conflict_override_reason),'') = '' THEN
    RAISE EXCEPTION 'APPOINTMENT_CONFLICT: this staff member already has an appointment at this time (id=%)', _conflict
      USING ERRCODE='check_violation';
  END IF;

  -- Verify the overrider is in command tier OR a shift supervisor
  SELECT EXISTS(
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = NEW.conflict_override_by
      AND ur.role IN ('admin','oic','2ic','staff_officer','supervisor',
                      'head_of_administration','shift_supervisor','deputy_shift_supervisor')
  ) INTO _is_authorized;

  IF NOT _is_authorized THEN
    RAISE EXCEPTION 'OVERRIDE_NOT_AUTHORIZED: % is not authorized to override appointment conflicts', NEW.conflict_override_by
      USING ERRCODE='insufficient_privilege';
  END IF;

  -- Stamp override timestamp
  IF NEW.conflict_override_at IS NULL THEN NEW.conflict_override_at := now(); END IF;

  -- Log override
  INSERT INTO medical_appointment_audit(appointment_id, action, performed_by, details)
  VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    'conflict_override',
    auth.uid(),
    jsonb_build_object(
      'conflicting_appointment_id', _conflict,
      'override_by', NEW.conflict_override_by,
      'override_role', NEW.conflict_override_role,
      'reason', NEW.conflict_override_reason,
      'staff_profile_id', NEW.staff_profile_id,
      'scheduled_at', NEW.scheduled_at
    )
  );

  RETURN NEW;
END$$;

-- General appointment audit (create/edit/cancel/status-change)
CREATE OR REPLACE FUNCTION public.audit_medical_appointment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _action text;
BEGIN
  IF TG_OP='INSERT' THEN _action := 'create';
  ELSIF TG_OP='UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN _action := 'status_change';
    ELSIF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at THEN _action := 'reschedule';
    ELSE _action := 'edit'; END IF;
  ELSIF TG_OP='DELETE' THEN _action := 'cancel';
  END IF;

  INSERT INTO medical_appointment_audit(appointment_id, action, performed_by, before_data, after_data)
  VALUES (COALESCE(NEW.id, OLD.id), _action, auth.uid(),
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);

  RETURN COALESCE(NEW, OLD);
END$$;

DROP TRIGGER IF EXISTS trg_audit_medical_appointment ON public.medical_appointments;
CREATE TRIGGER trg_audit_medical_appointment
  AFTER INSERT OR UPDATE OR DELETE ON public.medical_appointments
  FOR EACH ROW EXECUTE FUNCTION public.audit_medical_appointment();

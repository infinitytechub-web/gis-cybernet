
-- ─── Health Lab inventory audit ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.medical_inventory_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid,
  action text NOT NULL CHECK (action IN ('create','edit','adjust','delete')),
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  item_name text,
  delta integer,
  quantity_before integer,
  quantity_after integer,
  before_data jsonb,
  after_data jsonb,
  note text
);

CREATE INDEX IF NOT EXISTS idx_inv_audit_item ON public.medical_inventory_audit(inventory_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_audit_time ON public.medical_inventory_audit(performed_at DESC);

ALTER TABLE public.medical_inventory_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Command can read inventory audit" ON public.medical_inventory_audit;
CREATE POLICY "Command can read inventory audit" ON public.medical_inventory_audit
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'staff_officer')
    OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'head_of_administration')
  );

DROP POLICY IF EXISTS "System can insert inventory audit" ON public.medical_inventory_audit;
CREATE POLICY "System can insert inventory audit" ON public.medical_inventory_audit
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_medical_inventory_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _action text; _delta int;
BEGIN
  IF TG_OP='INSERT' THEN
    _action := 'create';
    INSERT INTO medical_inventory_audit(inventory_id, action, performed_by, item_name, quantity_after, after_data)
      VALUES (NEW.id, _action, auth.uid(), NEW.item_name, NEW.quantity, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP='UPDATE' THEN
    IF OLD.quantity IS DISTINCT FROM NEW.quantity AND
       (OLD.item_name=NEW.item_name AND COALESCE(OLD.category,'')=COALESCE(NEW.category,'')
        AND COALESCE(OLD.unit,'')=COALESCE(NEW.unit,'')
        AND COALESCE(OLD.reorder_threshold,0)=COALESCE(NEW.reorder_threshold,0)
        AND COALESCE(OLD.expiry_date::text,'')=COALESCE(NEW.expiry_date::text,'')) THEN
      _action := 'adjust';
      _delta := NEW.quantity - OLD.quantity;
    ELSE
      _action := 'edit';
      _delta := NULLIF(NEW.quantity - OLD.quantity, 0);
    END IF;
    INSERT INTO medical_inventory_audit(inventory_id, action, performed_by, item_name, delta, quantity_before, quantity_after, before_data, after_data, note)
      VALUES (NEW.id, _action, auth.uid(), NEW.item_name, _delta, OLD.quantity, NEW.quantity, to_jsonb(OLD), to_jsonb(NEW),
        CASE WHEN _action='adjust' THEN NEW.notes END);
    RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
    INSERT INTO medical_inventory_audit(inventory_id, action, performed_by, item_name, quantity_before, before_data)
      VALUES (OLD.id, 'delete', auth.uid(), OLD.item_name, OLD.quantity, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END$$;

DROP TRIGGER IF EXISTS trg_log_medical_inventory ON public.medical_inventory;
CREATE TRIGGER trg_log_medical_inventory
  AFTER INSERT OR UPDATE OR DELETE ON public.medical_inventory
  FOR EACH ROW EXECUTE FUNCTION public.log_medical_inventory_change();

-- ─── Appointments: authorized_by + conflict prevention + notifications ───
ALTER TABLE public.medical_appointments
  ADD COLUMN IF NOT EXISTS authorized_by uuid,
  ADD COLUMN IF NOT EXISTS authorized_role text;

-- Unique active appointment per staff+timeslot
CREATE OR REPLACE FUNCTION public.prevent_appointment_double_book()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _conflict uuid;
BEGIN
  IF NEW.status IN ('cancelled','no_show') THEN RETURN NEW; END IF;
  SELECT id INTO _conflict FROM medical_appointments
   WHERE staff_profile_id = NEW.staff_profile_id
     AND scheduled_at = NEW.scheduled_at
     AND status NOT IN ('cancelled','no_show')
     AND id <> COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid)
   LIMIT 1;
  IF _conflict IS NOT NULL THEN
    RAISE EXCEPTION 'APPOINTMENT_CONFLICT: this staff member already has an appointment at this time (id=%)', _conflict
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_prevent_appt_double ON public.medical_appointments;
CREATE TRIGGER trg_prevent_appt_double
  BEFORE INSERT OR UPDATE OF scheduled_at, staff_profile_id, status ON public.medical_appointments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_appointment_double_book();

-- Notifications on appointment lifecycle
CREATE OR REPLACE FUNCTION public.notify_appointment_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _staff_user uuid; _title text; _msg text; _type text; _when text;
        _reviewer uuid;
BEGIN
  -- Resolve staff auth user
  SELECT user_id INTO _staff_user FROM profiles WHERE id = COALESCE(NEW.staff_profile_id, OLD.staff_profile_id);

  IF TG_OP='INSERT' THEN
    _type := 'health_appointment_created';
    _when := to_char(NEW.scheduled_at AT TIME ZONE 'UTC','DD Mon YYYY HH24:MI');
    _title := 'New appointment scheduled';
    _msg := 'A health appointment has been scheduled for you on ' || _when;
  ELSIF TG_OP='UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      _type := 'health_appointment_status';
      _title := 'Appointment ' || NEW.status;
      _msg := 'Your appointment status has been updated to ' || NEW.status;
    ELSIF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at THEN
      _type := 'health_appointment_rescheduled';
      _title := 'Appointment rescheduled';
      _msg := 'Your health appointment has been rescheduled to ' || to_char(NEW.scheduled_at AT TIME ZONE 'UTC','DD Mon YYYY HH24:MI');
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_OP='DELETE' THEN
    _type := 'health_appointment_cancelled';
    _title := 'Appointment cancelled';
    _msg := 'Your health appointment has been cancelled';
  END IF;

  -- Notify staff
  IF _staff_user IS NOT NULL THEN
    INSERT INTO notifications(user_id, title, message, type, reference_id)
      VALUES (_staff_user, _title, _msg, _type, COALESCE(NEW.id, OLD.id));
  END IF;

  -- Notify command tier reviewers
  FOR _reviewer IN
    SELECT DISTINCT ur.user_id FROM user_roles ur
     WHERE ur.role IN ('admin','oic','2ic','staff_officer','supervisor','head_of_administration','shift_supervisor','deputy_shift_supervisor')
  LOOP
    IF _reviewer <> COALESCE(_staff_user,'00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO notifications(user_id, title, message, type, reference_id)
        VALUES (_reviewer, _title, _msg, _type, COALESCE(NEW.id, OLD.id));
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END$$;

DROP TRIGGER IF EXISTS trg_notify_appt_change ON public.medical_appointments;
CREATE TRIGGER trg_notify_appt_change
  AFTER INSERT OR UPDATE OR DELETE ON public.medical_appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_appointment_change();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.medical_inventory_audit;

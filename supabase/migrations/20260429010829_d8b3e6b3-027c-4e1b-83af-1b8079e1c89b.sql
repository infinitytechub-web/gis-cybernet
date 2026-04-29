-- 1) Add date-range columns to per-shift overrides
ALTER TABLE public.shift_attendance_window_overrides
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date;

-- 2) Drop the old unique-per-shift constraint so multiple date-scoped rules are allowed
ALTER TABLE public.shift_attendance_window_overrides
  DROP CONSTRAINT IF EXISTS shift_attendance_window_overrides_shift_id_key;

CREATE INDEX IF NOT EXISTS idx_shift_window_overrides_shift_dates
  ON public.shift_attendance_window_overrides (shift_id, effective_from, effective_to);

-- 3) Range-overlap validation
-- Treat NULL effective_from as "-infinity" and NULL effective_to as "+infinity".
CREATE OR REPLACE FUNCTION public.validate_shift_window_override_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _conflict RECORD;
  _new_from date := COALESCE(NEW.effective_from, '-infinity'::date);
  _new_to   date := COALESCE(NEW.effective_to,   'infinity'::date);
BEGIN
  IF NEW.effective_from IS NOT NULL AND NEW.effective_to IS NOT NULL
     AND NEW.effective_from > NEW.effective_to THEN
    RAISE EXCEPTION 'effective_from (%) cannot be after effective_to (%)', NEW.effective_from, NEW.effective_to;
  END IF;

  SELECT id, effective_from, effective_to
    INTO _conflict
  FROM public.shift_attendance_window_overrides o
  WHERE o.shift_id = NEW.shift_id
    AND o.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND COALESCE(o.effective_from, '-infinity'::date) <= _new_to
    AND COALESCE(o.effective_to,   'infinity'::date)  >= _new_from
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Overlapping rule already exists for this shift (% to %). Resolve the existing override before saving.',
      COALESCE(_conflict.effective_from::text, 'open'),
      COALESCE(_conflict.effective_to::text,   'open');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_window_overlap ON public.shift_attendance_window_overrides;
CREATE TRIGGER trg_shift_window_overlap
BEFORE INSERT OR UPDATE ON public.shift_attendance_window_overrides
FOR EACH ROW EXECUTE FUNCTION public.validate_shift_window_override_overlap();

-- 4) Audit log table
CREATE TABLE IF NOT EXISTS public.shift_window_override_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_id uuid,
  shift_id uuid,
  action text NOT NULL CHECK (action IN ('created','updated','deleted')),
  changed_fields text[],
  old_values jsonb,
  new_values jsonb,
  performed_by uuid,
  performed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_window_audit_created ON public.shift_window_override_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_window_audit_shift ON public.shift_window_override_audit(shift_id);

ALTER TABLE public.shift_window_override_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Command tier views shift window audit" ON public.shift_window_override_audit;
CREATE POLICY "Command tier views shift window audit"
ON public.shift_window_override_audit FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'oic')
  OR public.has_role(auth.uid(),'2ic')
  OR public.has_role(auth.uid(),'staff_officer')
);

-- Block direct inserts/updates/deletes; trigger inserts via SECURITY DEFINER
DROP POLICY IF EXISTS "Block direct writes to shift window audit" ON public.shift_window_override_audit;
CREATE POLICY "Block direct writes to shift window audit"
ON public.shift_window_override_audit FOR ALL TO authenticated
USING (false) WITH CHECK (false);

-- 5) Audit trigger
CREATE OR REPLACE FUNCTION public.log_shift_window_override_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _name text;
  _changed text[] := ARRAY[]::text[];
BEGIN
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO _name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.shift_window_override_audit
      (override_id, shift_id, action, new_values, performed_by, performed_by_name)
    VALUES (NEW.id, NEW.shift_id, 'created', to_jsonb(NEW), auth.uid(), NULLIF(trim(_name),''));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.grace_minutes IS DISTINCT FROM OLD.grace_minutes THEN _changed := array_append(_changed,'grace_minutes'); END IF;
    IF NEW.early_checkin_minutes IS DISTINCT FROM OLD.early_checkin_minutes THEN _changed := array_append(_changed,'early_checkin_minutes'); END IF;
    IF NEW.late_checkout_minutes IS DISTINCT FROM OLD.late_checkout_minutes THEN _changed := array_append(_changed,'late_checkout_minutes'); END IF;
    IF NEW.enforce_window IS DISTINCT FROM OLD.enforce_window THEN _changed := array_append(_changed,'enforce_window'); END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN _changed := array_append(_changed,'notes'); END IF;
    IF NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN _changed := array_append(_changed,'effective_from'); END IF;
    IF NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN _changed := array_append(_changed,'effective_to'); END IF;

    IF array_length(_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.shift_window_override_audit
      (override_id, shift_id, action, changed_fields, old_values, new_values, performed_by, performed_by_name)
    VALUES (NEW.id, NEW.shift_id, 'updated', _changed, to_jsonb(OLD), to_jsonb(NEW), auth.uid(), NULLIF(trim(_name),''));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.shift_window_override_audit
      (override_id, shift_id, action, old_values, performed_by, performed_by_name)
    VALUES (OLD.id, OLD.shift_id, 'deleted', to_jsonb(OLD), auth.uid(), NULLIF(trim(_name),''));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_window_override_audit ON public.shift_attendance_window_overrides;
CREATE TRIGGER trg_shift_window_override_audit
AFTER INSERT OR UPDATE OR DELETE ON public.shift_attendance_window_overrides
FOR EACH ROW EXECUTE FUNCTION public.log_shift_window_override_change();
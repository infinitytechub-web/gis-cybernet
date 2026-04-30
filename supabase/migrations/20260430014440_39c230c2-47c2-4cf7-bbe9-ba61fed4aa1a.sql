-- 1) Audit log for the singleton shift_rotation_config

CREATE TABLE public.shift_rotation_config_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  changed_by UUID REFERENCES auth.users(id),
  changed_by_name TEXT,
  action TEXT NOT NULL, -- 'created' | 'updated'
  old_anchor_date DATE,
  new_anchor_date DATE,
  old_pattern TEXT[],
  new_pattern TEXT[],
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);

CREATE INDEX idx_shift_rotation_config_audit_changed_at ON public.shift_rotation_config_audit(changed_at DESC);

ALTER TABLE public.shift_rotation_config_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read rotation config audit"
  ON public.shift_rotation_config_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Block direct writes; only the trigger (SECURITY DEFINER) inserts rows.
CREATE POLICY "No direct writes to rotation config audit"
  ON public.shift_rotation_config_audit FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.log_shift_rotation_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name TEXT;
  _changed TEXT[] := ARRAY[]::TEXT[];
  _action TEXT;
BEGIN
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO _name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    _action := 'created';
    _changed := ARRAY['anchor_date','pattern'];
    INSERT INTO public.shift_rotation_config_audit
      (changed_by, changed_by_name, action, old_anchor_date, new_anchor_date, old_pattern, new_pattern, changed_fields)
    VALUES (auth.uid(), NULLIF(trim(_name),''), _action, NULL, NEW.anchor_date, NULL, NEW.pattern, _changed);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.anchor_date IS DISTINCT FROM OLD.anchor_date THEN _changed := array_append(_changed, 'anchor_date'); END IF;
    IF NEW.pattern IS DISTINCT FROM OLD.pattern THEN _changed := array_append(_changed, 'pattern'); END IF;
    IF array_length(_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.shift_rotation_config_audit
      (changed_by, changed_by_name, action, old_anchor_date, new_anchor_date, old_pattern, new_pattern, changed_fields)
    VALUES (auth.uid(), NULLIF(trim(_name),''), 'updated', OLD.anchor_date, NEW.anchor_date, OLD.pattern, NEW.pattern, _changed);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER shift_rotation_config_audit_trg
AFTER INSERT OR UPDATE ON public.shift_rotation_config
FOR EACH ROW EXECUTE FUNCTION public.log_shift_rotation_config_change();

-- 2) Per-role / per-department rotation overrides

CREATE TABLE public.shift_rotation_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('role','department')),
  -- For 'role' this stores the app_role text; for 'department' stores departments.id::text.
  scope_value TEXT NOT NULL,
  anchor_date DATE NOT NULL,
  pattern TEXT[] NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  CONSTRAINT shift_rotation_overrides_pattern_len CHECK (array_length(pattern,1) >= 1 AND array_length(pattern,1) <= 12),
  CONSTRAINT shift_rotation_overrides_unique UNIQUE (scope_type, scope_value)
);

CREATE INDEX idx_shift_rotation_overrides_scope ON public.shift_rotation_overrides(scope_type, scope_value);

ALTER TABLE public.shift_rotation_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read rotation overrides"
  ON public.shift_rotation_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert rotation overrides"
  ON public.shift_rotation_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update rotation overrides"
  ON public.shift_rotation_overrides FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete rotation overrides"
  ON public.shift_rotation_overrides FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_shift_rotation_override()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate pattern entries are A-Z single letters
  IF EXISTS (SELECT 1 FROM unnest(NEW.pattern) AS p WHERE p !~ '^[A-Z]$') THEN
    RAISE EXCEPTION 'pattern entries must each be a single uppercase letter (A-Z)';
  END IF;
  IF NEW.scope_type = 'role' THEN
    -- Validate it casts to app_role
    PERFORM NEW.scope_value::public.app_role;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER shift_rotation_overrides_touch
BEFORE INSERT OR UPDATE ON public.shift_rotation_overrides
FOR EACH ROW EXECUTE FUNCTION public.touch_shift_rotation_override();

-- Audit log for overrides (reuses system_audit_log via existing log_system_audit() trigger)
CREATE TRIGGER shift_rotation_overrides_audit
AFTER INSERT OR UPDATE OR DELETE ON public.shift_rotation_overrides
FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_rotation_overrides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_rotation_config_audit;
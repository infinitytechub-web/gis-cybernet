CREATE TABLE public.enforcement_field_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL CHECK (table_name IN ('enforcement_operations', 'operations')),
  record_id UUID NOT NULL,
  field_name TEXT NOT NULL CHECK (field_name IN ('mugshot_path', 'authorized_by')),
  old_value TEXT,
  new_value TEXT,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'clear')),
  changed_by UUID,
  changed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_enf_field_audit_record ON public.enforcement_field_audit(table_name, record_id);
CREATE INDEX idx_enf_field_audit_created ON public.enforcement_field_audit(created_at DESC);

ALTER TABLE public.enforcement_field_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier can view enforcement field audit"
ON public.enforcement_field_audit
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
  OR public.has_role(auth.uid(), 'supervisor')
);

CREATE OR REPLACE FUNCTION public.log_enforcement_field_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
  _actor_name TEXT;
BEGIN
  SELECT (first_name || ' ' || last_name) INTO _actor_name
  FROM public.profiles WHERE user_id = _actor LIMIT 1;

  IF (TG_OP = 'INSERT') THEN
    IF NEW.mugshot_path IS NOT NULL THEN
      INSERT INTO public.enforcement_field_audit(table_name, record_id, field_name, old_value, new_value, action, changed_by, changed_by_name)
      VALUES (TG_TABLE_NAME, NEW.id, 'mugshot_path', NULL, NEW.mugshot_path, 'insert', _actor, _actor_name);
    END IF;
    IF NEW.authorized_by IS NOT NULL THEN
      INSERT INTO public.enforcement_field_audit(table_name, record_id, field_name, old_value, new_value, action, changed_by, changed_by_name)
      VALUES (TG_TABLE_NAME, NEW.id, 'authorized_by', NULL, NEW.authorized_by::text, 'insert', _actor, _actor_name);
    END IF;
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    IF NEW.mugshot_path IS DISTINCT FROM OLD.mugshot_path THEN
      INSERT INTO public.enforcement_field_audit(table_name, record_id, field_name, old_value, new_value, action, changed_by, changed_by_name)
      VALUES (TG_TABLE_NAME, NEW.id, 'mugshot_path', OLD.mugshot_path, NEW.mugshot_path,
              CASE WHEN NEW.mugshot_path IS NULL THEN 'clear' ELSE 'update' END,
              _actor, _actor_name);
    END IF;
    IF NEW.authorized_by IS DISTINCT FROM OLD.authorized_by THEN
      INSERT INTO public.enforcement_field_audit(table_name, record_id, field_name, old_value, new_value, action, changed_by, changed_by_name)
      VALUES (TG_TABLE_NAME, NEW.id, 'authorized_by', OLD.authorized_by::text, NEW.authorized_by::text,
              CASE WHEN NEW.authorized_by IS NULL THEN 'clear' ELSE 'update' END,
              _actor, _actor_name);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enf_field_audit ON public.enforcement_operations;
CREATE TRIGGER trg_enf_field_audit
AFTER INSERT OR UPDATE OF mugshot_path, authorized_by ON public.enforcement_operations
FOR EACH ROW EXECUTE FUNCTION public.log_enforcement_field_change();

DROP TRIGGER IF EXISTS trg_ops_field_audit ON public.operations;
CREATE TRIGGER trg_ops_field_audit
AFTER INSERT OR UPDATE OF mugshot_path, authorized_by ON public.operations
FOR EACH ROW EXECUTE FUNCTION public.log_enforcement_field_change();
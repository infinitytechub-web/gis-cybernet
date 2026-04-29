ALTER TABLE public.inventory_alert_overrides_audit
  ADD COLUMN IF NOT EXISTS entry_hash text,
  ADD COLUMN IF NOT EXISTS prev_hash text;

CREATE OR REPLACE FUNCTION public.set_threshold_audit_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _prev text;
  _payload text;
BEGIN
  SELECT entry_hash INTO _prev
    FROM public.inventory_alert_overrides_audit
    WHERE entry_hash IS NOT NULL
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

  NEW.prev_hash := _prev;
  _payload := COALESCE(_prev, '') || '|' ||
              COALESCE(NEW.id::text,'') || '|' ||
              COALESCE(NEW.override_id::text,'') || '|' ||
              COALESCE(NEW.scope_type,'') || '|' ||
              COALESCE(NEW.scope_value,'') || '|' ||
              COALESCE(NEW.action,'') || '|' ||
              COALESCE(array_to_string(NEW.changed_fields, ','),'') || '|' ||
              COALESCE(NEW.old_values::text,'') || '|' ||
              COALESCE(NEW.new_values::text,'') || '|' ||
              COALESCE(NEW.performed_by::text,'') || '|' ||
              COALESCE(NEW.performed_by_name,'') || '|' ||
              COALESCE(NEW.created_at::text,'');
  NEW.entry_hash := encode(digest(_payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_threshold_audit_hash ON public.inventory_alert_overrides_audit;
CREATE TRIGGER trg_threshold_audit_hash
  BEFORE INSERT ON public.inventory_alert_overrides_audit
  FOR EACH ROW EXECUTE FUNCTION public.set_threshold_audit_hash();

CREATE OR REPLACE FUNCTION public.block_threshold_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Threshold audit entries are immutable (tamper-evident).';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_threshold_audit_update ON public.inventory_alert_overrides_audit;
CREATE TRIGGER trg_block_threshold_audit_update
  BEFORE UPDATE OR DELETE ON public.inventory_alert_overrides_audit
  FOR EACH ROW EXECUTE FUNCTION public.block_threshold_audit_mutation();

-- Verifier: walks the chain and returns the first row that fails verification (or none)
CREATE OR REPLACE FUNCTION public.verify_threshold_audit_chain()
RETURNS TABLE(total bigint, verified bigint, first_break_id uuid, first_break_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row RECORD;
  _prev text := NULL;
  _expected text;
  _verified bigint := 0;
  _total bigint := 0;
  _break_id uuid := NULL;
  _break_at timestamptz := NULL;
BEGIN
  FOR _row IN
    SELECT * FROM public.inventory_alert_overrides_audit
    ORDER BY created_at ASC, id ASC
  LOOP
    _total := _total + 1;
    _expected := encode(digest(
      COALESCE(_prev,'') || '|' ||
      COALESCE(_row.id::text,'') || '|' ||
      COALESCE(_row.override_id::text,'') || '|' ||
      COALESCE(_row.scope_type,'') || '|' ||
      COALESCE(_row.scope_value,'') || '|' ||
      COALESCE(_row.action,'') || '|' ||
      COALESCE(array_to_string(_row.changed_fields, ','),'') || '|' ||
      COALESCE(_row.old_values::text,'') || '|' ||
      COALESCE(_row.new_values::text,'') || '|' ||
      COALESCE(_row.performed_by::text,'') || '|' ||
      COALESCE(_row.performed_by_name,'') || '|' ||
      COALESCE(_row.created_at::text,'')
    , 'sha256'), 'hex');

    IF _row.entry_hash = _expected AND COALESCE(_row.prev_hash,'') = COALESCE(_prev,'') THEN
      _verified := _verified + 1;
    ELSIF _break_id IS NULL THEN
      _break_id := _row.id;
      _break_at := _row.created_at;
    END IF;
    _prev := _row.entry_hash;
  END LOOP;
  total := _total;
  verified := _verified;
  first_break_id := _break_id;
  first_break_at := _break_at;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_threshold_audit_chain() TO authenticated;

-- Backfill hashes for any pre-existing rows (in chronological order) without firing the immutability guard
DO $$
DECLARE
  _r RECORD;
  _prev text := NULL;
  _hash text;
BEGIN
  ALTER TABLE public.inventory_alert_overrides_audit DISABLE TRIGGER trg_block_threshold_audit_update;
  FOR _r IN
    SELECT * FROM public.inventory_alert_overrides_audit
    WHERE entry_hash IS NULL
    ORDER BY created_at ASC, id ASC
  LOOP
    _hash := encode(digest(
      COALESCE(_prev,'') || '|' ||
      COALESCE(_r.id::text,'') || '|' ||
      COALESCE(_r.override_id::text,'') || '|' ||
      COALESCE(_r.scope_type,'') || '|' ||
      COALESCE(_r.scope_value,'') || '|' ||
      COALESCE(_r.action,'') || '|' ||
      COALESCE(array_to_string(_r.changed_fields, ','),'') || '|' ||
      COALESCE(_r.old_values::text,'') || '|' ||
      COALESCE(_r.new_values::text,'') || '|' ||
      COALESCE(_r.performed_by::text,'') || '|' ||
      COALESCE(_r.performed_by_name,'') || '|' ||
      COALESCE(_r.created_at::text,'')
    , 'sha256'), 'hex');
    UPDATE public.inventory_alert_overrides_audit
       SET entry_hash = _hash, prev_hash = _prev
     WHERE id = _r.id;
    _prev := _hash;
  END LOOP;
  ALTER TABLE public.inventory_alert_overrides_audit ENABLE TRIGGER trg_block_threshold_audit_update;
END $$;
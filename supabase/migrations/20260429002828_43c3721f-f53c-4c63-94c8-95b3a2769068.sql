-- Per-override webhook routing
ALTER TABLE public.inventory_alert_overrides
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS webhook_enabled boolean NOT NULL DEFAULT false;

-- Audit trail for threshold/override changes
CREATE TABLE IF NOT EXISTS public.inventory_alert_overrides_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_id uuid,
  scope_type text,
  scope_value text,
  action text NOT NULL CHECK (action IN ('created','updated','deleted')),
  changed_fields text[],
  old_values jsonb,
  new_values jsonb,
  performed_by uuid,
  performed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_alert_overrides_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stores roles can view threshold audit"
  ON public.inventory_alert_overrides_audit FOR SELECT
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'storekeeper')
    OR public.has_role(auth.uid(),'procurement_officer')
  );

CREATE INDEX IF NOT EXISTS idx_overrides_audit_created ON public.inventory_alert_overrides_audit(created_at DESC);

CREATE OR REPLACE FUNCTION public.log_inventory_override_change()
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
    INSERT INTO public.inventory_alert_overrides_audit
      (override_id, scope_type, scope_value, action, new_values, performed_by, performed_by_name)
    VALUES (NEW.id, NEW.scope_type, NEW.scope_value, 'created', to_jsonb(NEW), auth.uid(), NULLIF(trim(_name),''));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.variance_qty_threshold IS DISTINCT FROM OLD.variance_qty_threshold THEN _changed := array_append(_changed, 'variance_qty_threshold'); END IF;
    IF NEW.variance_value_threshold IS DISTINCT FROM OLD.variance_value_threshold THEN _changed := array_append(_changed, 'variance_value_threshold'); END IF;
    IF NEW.enabled IS DISTINCT FROM OLD.enabled THEN _changed := array_append(_changed, 'enabled'); END IF;
    IF NEW.webhook_url IS DISTINCT FROM OLD.webhook_url THEN _changed := array_append(_changed, 'webhook_url'); END IF;
    IF NEW.webhook_enabled IS DISTINCT FROM OLD.webhook_enabled THEN _changed := array_append(_changed, 'webhook_enabled'); END IF;
    IF NEW.scope_value IS DISTINCT FROM OLD.scope_value THEN _changed := array_append(_changed, 'scope_value'); END IF;
    IF NEW.scope_type IS DISTINCT FROM OLD.scope_type THEN _changed := array_append(_changed, 'scope_type'); END IF;

    IF array_length(_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.inventory_alert_overrides_audit
      (override_id, scope_type, scope_value, action, changed_fields, old_values, new_values, performed_by, performed_by_name)
    VALUES (NEW.id, NEW.scope_type, NEW.scope_value, 'updated', _changed, to_jsonb(OLD), to_jsonb(NEW), auth.uid(), NULLIF(trim(_name),''));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.inventory_alert_overrides_audit
      (override_id, scope_type, scope_value, action, old_values, performed_by, performed_by_name)
    VALUES (OLD.id, OLD.scope_type, OLD.scope_value, 'deleted', to_jsonb(OLD), auth.uid(), NULLIF(trim(_name),''));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_overrides_audit ON public.inventory_alert_overrides;
CREATE TRIGGER trg_inventory_overrides_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_alert_overrides
  FOR EACH ROW EXECUTE FUNCTION public.log_inventory_override_change();

-- Update variance trigger to prefer per-override webhook when configured
CREATE OR REPLACE FUNCTION public.notify_audit_variance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _settings RECORD;
  _override RECORD;
  _item RECORD;
  _abs_qty integer;
  _abs_val numeric;
  _qty_th integer;
  _val_th numeric;
  _project_url text;
  _webhook text;
  _webhook_enabled boolean;
BEGIN
  SELECT * INTO _settings FROM public.inventory_alert_settings LIMIT 1;
  IF _settings IS NULL OR _settings.variance_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT name, unit, unit_cost, location INTO _item FROM public.inventory_items WHERE id = NEW.item_id;
  _abs_qty := abs(COALESCE(NEW.variance, NEW.physical_count - NEW.system_qty));
  _abs_val := _abs_qty * COALESCE(_item.unit_cost, 0);

  _qty_th := _settings.variance_qty_threshold;
  _val_th := _settings.variance_value_threshold;
  _webhook := _settings.webhook_url;
  _webhook_enabled := _settings.alert_webhook_enabled;

  IF _item.location IS NOT NULL THEN
    SELECT * INTO _override FROM public.inventory_alert_overrides
      WHERE scope_type='location' AND lower(scope_value)=lower(_item.location) AND enabled=true
      LIMIT 1;
    IF FOUND THEN
      _qty_th := _override.variance_qty_threshold;
      _val_th := _override.variance_value_threshold;
      IF _override.webhook_enabled AND _override.webhook_url IS NOT NULL AND length(btrim(_override.webhook_url)) > 0 THEN
        _webhook := _override.webhook_url;
        _webhook_enabled := true;
      END IF;
    END IF;
  END IF;

  IF _abs_qty >= _qty_th OR _abs_val >= _val_th THEN
    PERFORM public.notify_roles(
      ARRAY['admin','oic','2ic','storekeeper','procurement_officer']::app_role[],
      'Inventory Variance Alert',
      format('%s [%s] — variance %s %s (≈ ₵%s).',
        COALESCE(_item.name,'item'),
        COALESCE(_item.location,'—'),
        _abs_qty,
        COALESCE(_item.unit,''),
        round(_abs_val::numeric, 2)
      ),
      'general',
      NEW.id
    );

    IF (_webhook_enabled AND _webhook IS NOT NULL)
       OR (_settings.alert_email_enabled AND coalesce(array_length(_settings.email_recipients, 1), 0) > 0)
    THEN
      _project_url := 'https://ebndffutyrgybsduvijo.supabase.co/functions/v1/run-audit-scheduler';
      BEGIN
        PERFORM net.http_post(
          url := _project_url,
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVibmRmZnV0eXJneWJzZHV2aWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTQ0OTQsImV4cCI6MjA5MDg3MDQ5NH0.8P0c15nRrp0l0Q--wmOq1av9xumK6yB0TTzEE_iz_zE'
          ),
          body := jsonb_build_object(
            'mode','variance_alert',
            'item_name', COALESCE(_item.name,'item'),
            'item_location', COALESCE(_item.location,''),
            'item_unit', COALESCE(_item.unit,''),
            'variance_qty', _abs_qty,
            'variance_value', round(_abs_val::numeric, 2),
            'threshold_qty', _qty_th,
            'threshold_value', _val_th,
            'override_webhook', CASE WHEN _webhook_enabled AND _webhook IS NOT NULL AND _webhook IS DISTINCT FROM _settings.webhook_url THEN _webhook ELSE NULL END,
            'count_id', NEW.id
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'variance webhook dispatch failed: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_audit_variance failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;
-- Per-location/department variance threshold overrides
CREATE TABLE IF NOT EXISTS public.inventory_alert_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('location','department')),
  scope_value text NOT NULL,
  variance_qty_threshold integer NOT NULL DEFAULT 1,
  variance_value_threshold numeric NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_value)
);

ALTER TABLE public.inventory_alert_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stores roles can view overrides"
  ON public.inventory_alert_overrides FOR SELECT
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'storekeeper')
    OR public.has_role(auth.uid(),'procurement_officer')
  );

CREATE POLICY "Stores managers can manage overrides"
  ON public.inventory_alert_overrides FOR ALL
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'storekeeper')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'storekeeper')
  );

CREATE TRIGGER update_inventory_alert_overrides_updated_at
  BEFORE UPDATE ON public.inventory_alert_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add PDF report path to runs and schedules
ALTER TABLE public.inventory_audit_runs
  ADD COLUMN IF NOT EXISTS report_pdf_path text;

ALTER TABLE public.inventory_audit_schedules
  ADD COLUMN IF NOT EXISTS last_report_pdf_path text;

-- Update variance trigger to honour per-location overrides
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
BEGIN
  SELECT * INTO _settings FROM public.inventory_alert_settings LIMIT 1;
  IF _settings IS NULL OR _settings.variance_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT name, unit, unit_cost, location INTO _item FROM public.inventory_items WHERE id = NEW.item_id;
  _abs_qty := abs(COALESCE(NEW.variance, NEW.physical_count - NEW.system_qty));
  _abs_val := _abs_qty * COALESCE(_item.unit_cost, 0);

  -- Per-location override (case-insensitive)
  _qty_th := _settings.variance_qty_threshold;
  _val_th := _settings.variance_value_threshold;
  IF _item.location IS NOT NULL THEN
    SELECT * INTO _override FROM public.inventory_alert_overrides
      WHERE scope_type='location' AND lower(scope_value)=lower(_item.location) AND enabled=true
      LIMIT 1;
    IF FOUND THEN
      _qty_th := _override.variance_qty_threshold;
      _val_th := _override.variance_value_threshold;
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

    IF (_settings.alert_webhook_enabled AND _settings.webhook_url IS NOT NULL)
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
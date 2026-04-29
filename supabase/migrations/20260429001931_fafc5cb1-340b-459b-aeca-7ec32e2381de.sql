CREATE OR REPLACE FUNCTION public.notify_audit_variance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings RECORD;
  _item RECORD;
  _abs_qty integer;
  _abs_val numeric;
  _project_url text;
BEGIN
  SELECT * INTO _settings FROM public.inventory_alert_settings LIMIT 1;
  IF _settings IS NULL OR _settings.variance_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  _abs_qty := abs(COALESCE(NEW.variance, NEW.physical_count - NEW.system_qty));
  SELECT name, unit, unit_cost INTO _item FROM public.inventory_items WHERE id = NEW.item_id;
  _abs_val := _abs_qty * COALESCE(_item.unit_cost, 0);

  IF _abs_qty >= _settings.variance_qty_threshold
     OR _abs_val >= _settings.variance_value_threshold THEN
    -- in-app
    PERFORM public.notify_roles(
      ARRAY['admin','oic','2ic','storekeeper','procurement_officer']::app_role[],
      'Inventory Variance Alert',
      format('%s — variance %s %s (≈ ₵%s).',
        COALESCE(_item.name,'item'),
        _abs_qty,
        COALESCE(_item.unit,''),
        round(_abs_val::numeric, 2)
      ),
      'general',
      NEW.id
    );

    -- webhook / email fan-out via edge function (best-effort)
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
            'item_unit', COALESCE(_item.unit,''),
            'variance_qty', _abs_qty,
            'variance_value', round(_abs_val::numeric, 2),
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
$$;
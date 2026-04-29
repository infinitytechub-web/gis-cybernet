-- Settings table (singleton)
CREATE TABLE IF NOT EXISTS public.inventory_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  low_stock_enabled boolean NOT NULL DEFAULT true,
  variance_enabled boolean NOT NULL DEFAULT true,
  variance_qty_threshold integer NOT NULL DEFAULT 5,
  variance_value_threshold numeric NOT NULL DEFAULT 500,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed singleton row
INSERT INTO public.inventory_alert_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_alert_settings);

ALTER TABLE public.inventory_alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_settings_select" ON public.inventory_alert_settings;
CREATE POLICY "alert_settings_select"
  ON public.inventory_alert_settings FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic')
    OR public.has_role(auth.uid(),'storekeeper')
  );

DROP POLICY IF EXISTS "alert_settings_update" ON public.inventory_alert_settings;
CREATE POLICY "alert_settings_update"
  ON public.inventory_alert_settings FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic')
    OR public.has_role(auth.uid(),'storekeeper')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic')
    OR public.has_role(auth.uid(),'storekeeper')
  );

DROP TRIGGER IF EXISTS trg_inventory_alert_settings_updated ON public.inventory_alert_settings;
CREATE TRIGGER trg_inventory_alert_settings_updated
  BEFORE UPDATE ON public.inventory_alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Variance alert trigger function
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
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_audit_variance failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_audit_variance ON public.inventory_audit_counts;
CREATE TRIGGER trg_notify_audit_variance
  AFTER INSERT ON public.inventory_audit_counts
  FOR EACH ROW EXECUTE FUNCTION public.notify_audit_variance();
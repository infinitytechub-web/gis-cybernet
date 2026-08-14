-- 1. inventory_alert_settings: remove table-wide access and re-grant per column (no webhook_url)
REVOKE SELECT, UPDATE ON public.inventory_alert_settings FROM authenticated;
GRANT SELECT (id, low_stock_enabled, variance_enabled, variance_qty_threshold, variance_value_threshold, updated_by, created_at, updated_at, email_recipients, alert_email_enabled, alert_webhook_enabled) ON public.inventory_alert_settings TO authenticated;
GRANT UPDATE (low_stock_enabled, variance_enabled, variance_qty_threshold, variance_value_threshold, updated_by, updated_at, email_recipients, alert_email_enabled, alert_webhook_enabled) ON public.inventory_alert_settings TO authenticated;
GRANT ALL ON public.inventory_alert_settings TO service_role;

-- 2. inventory_alert_overrides: same treatment
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.inventory_alert_overrides FROM authenticated;
GRANT SELECT (id, scope_type, scope_value, variance_qty_threshold, variance_value_threshold, enabled, created_at, updated_at, webhook_enabled) ON public.inventory_alert_overrides TO authenticated;
GRANT INSERT (id, scope_type, scope_value, variance_qty_threshold, variance_value_threshold, enabled, created_at, updated_at, webhook_enabled) ON public.inventory_alert_overrides TO authenticated;
GRANT UPDATE (scope_type, scope_value, variance_qty_threshold, variance_value_threshold, enabled, updated_at, webhook_enabled) ON public.inventory_alert_overrides TO authenticated;
GRANT DELETE ON public.inventory_alert_overrides TO authenticated;
GRANT ALL ON public.inventory_alert_overrides TO service_role;

-- 3. Command-tier only read of webhook addresses
CREATE OR REPLACE FUNCTION public.get_inventory_alert_webhooks()
RETURNS TABLE (source text, record_id uuid, webhook_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'oic'::app_role)
          OR has_role(auth.uid(), '2ic'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised to view alert webhook addresses';
  END IF;

  RETURN QUERY
    SELECT 'settings'::text, s.id, s.webhook_url FROM public.inventory_alert_settings s
    UNION ALL
    SELECT 'override'::text, o.id, o.webhook_url FROM public.inventory_alert_overrides o;
END;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_alert_webhooks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_alert_webhooks() TO authenticated, service_role;

-- 4. Command-tier only write of webhook addresses
CREATE OR REPLACE FUNCTION public.set_inventory_alert_webhook(_source text, _record_id uuid, _webhook_url text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'oic'::app_role)
          OR has_role(auth.uid(), '2ic'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised to change alert webhook addresses';
  END IF;

  IF _webhook_url IS NOT NULL AND btrim(_webhook_url) <> '' AND _webhook_url !~* '^https://' THEN
    RAISE EXCEPTION 'Webhook address must be an https URL';
  END IF;

  IF _source = 'settings' THEN
    UPDATE public.inventory_alert_settings
       SET webhook_url = NULLIF(btrim(_webhook_url), ''), updated_at = now()
     WHERE id = _record_id;
  ELSIF _source = 'override' THEN
    UPDATE public.inventory_alert_overrides
       SET webhook_url = NULLIF(btrim(_webhook_url), ''), updated_at = now()
     WHERE id = _record_id;
  ELSE
    RAISE EXCEPTION 'Unknown webhook target';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_inventory_alert_webhook(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_alert_webhook(text, uuid, text) TO authenticated, service_role;
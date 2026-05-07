-- Server-side paginated inventory audit reader with role enforcement
CREATE OR REPLACE FUNCTION public.list_medical_inventory_audit(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_inventory_id uuid DEFAULT NULL,
  p_item_search text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  inventory_id uuid,
  action text,
  performed_by uuid,
  performed_at timestamptz,
  item_name text,
  delta int,
  quantity_before int,
  quantity_after int,
  note text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _allowed boolean;
  _offset int;
  _limit int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  _allowed := has_role(_uid, 'admin'::app_role)
           OR has_role(_uid, 'oic'::app_role)
           OR has_role(_uid, '2ic'::app_role)
           OR has_role(_uid, 'staff_officer'::app_role)
           OR has_role(_uid, 'supervisor'::app_role)
           OR has_role(_uid, 'head_of_administration'::app_role);

  IF NOT _allowed THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING HINT = 'Inventory audit log is restricted to Admin and Command tier.';
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(p_page_size, 25), 200));
  _offset := GREATEST(0, (COALESCE(p_page, 1) - 1) * _limit);

  RETURN QUERY
  WITH base AS (
    SELECT a.*
    FROM medical_inventory_audit a
    WHERE (p_from IS NULL OR a.performed_at >= p_from)
      AND (p_to IS NULL OR a.performed_at <= p_to)
      AND (p_performed_by IS NULL OR a.performed_by = p_performed_by)
      AND (p_inventory_id IS NULL OR a.inventory_id = p_inventory_id)
      AND (p_item_search IS NULL OR p_item_search = '' OR a.item_name ILIKE '%' || p_item_search || '%')
      AND (p_action IS NULL OR p_action = '' OR a.action = p_action)
  ), counted AS (
    SELECT COUNT(*)::bigint AS c FROM base
  )
  SELECT b.id, b.inventory_id, b.action, b.performed_by, b.performed_at, b.item_name,
         b.delta, b.quantity_before, b.quantity_after, b.note,
         (SELECT c FROM counted) AS total_count
  FROM base b
  ORDER BY b.performed_at DESC
  LIMIT _limit OFFSET _offset;
END;
$$;

REVOKE ALL ON FUNCTION public.list_medical_inventory_audit(timestamptz, timestamptz, uuid, uuid, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_medical_inventory_audit(timestamptz, timestamptz, uuid, uuid, text, text, int, int) TO authenticated;

COMMENT ON FUNCTION public.list_medical_inventory_audit IS
  'Paginated, role-checked reader for medical_inventory_audit. Inventory is an org-wide resource with no department scoping, so Admin and the entire Command tier (OIC, 2IC, Staff Officer, Supervisor, Head of Administration) can read all entries; other roles are denied.';

COMMENT ON POLICY "Staff submit own excuse duty" ON public.excuse_duty_forms IS
  'Universal: any authenticated staff with a matching profile may submit an Excuse Duty Form for themselves. Status is forced to pending and reviewer fields must be empty on insert.';
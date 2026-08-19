-- 1. Link request lines to stock items
ALTER TABLE public.purchase_requisition_items
  ADD COLUMN IF NOT EXISTS inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pr_items_inventory_item
  ON public.purchase_requisition_items (inventory_item_id)
  WHERE inventory_item_id IS NOT NULL;

-- 2. Receiving goods now feeds stock levels for linked items
CREATE OR REPLACE FUNCTION public.procurement_request_receive(_requisition_id uuid, _items jsonb DEFAULT '[]'::jsonb, _note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.purchase_requisitions;
  v_row jsonb;
  v_ordered numeric;
  v_received numeric;
  v_to text;
  v_prev numeric;
  v_new numeric;
  v_item public.purchase_requisition_items;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_manage_procurement(v_uid) THEN
    RAISE EXCEPTION 'Only the storekeeper tier can record goods received';
  END IF;

  SELECT * INTO v_req FROM public.purchase_requisitions WHERE id = _requisition_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status NOT IN ('approved', 'partial') THEN
    RAISE EXCEPTION 'Only approved requests can be received';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) LOOP
    SELECT * INTO v_item
      FROM public.purchase_requisition_items
     WHERE id = (v_row->>'id')::uuid
       AND requisition_id = _requisition_id;
    CONTINUE WHEN v_item.id IS NULL;

    v_prev := coalesce(v_item.received_qty, 0);
    v_new := greatest(0, least((v_row->>'received_qty')::numeric, v_item.quantity));

    UPDATE public.purchase_requisition_items
       SET received_qty = v_new
     WHERE id = v_item.id;

    -- Push the newly received quantity into stock when the line is linked to an item
    IF v_item.inventory_item_id IS NOT NULL AND v_new > v_prev THEN
      INSERT INTO public.inventory_movements
        (item_id, movement_type, quantity, reference, notes, performed_by)
      VALUES
        (v_item.inventory_item_id, 'in', v_new - v_prev, v_req.pr_number,
         format('Goods received on procurement request %s (%s)', v_req.pr_number, v_item.item_name),
         v_uid);

      IF coalesce(v_item.estimated_unit_cost, 0) > 0 THEN
        UPDATE public.inventory_items
           SET unit_cost = v_item.estimated_unit_cost, updated_at = now()
         WHERE id = v_item.inventory_item_id;
      END IF;
    END IF;
  END LOOP;

  SELECT coalesce(sum(quantity), 0), coalesce(sum(received_qty), 0)
    INTO v_ordered, v_received
    FROM public.purchase_requisition_items
   WHERE requisition_id = _requisition_id;

  v_to := CASE
            WHEN v_ordered > 0 AND v_received >= v_ordered THEN 'received'
            WHEN v_received > 0 THEN 'partial'
            ELSE v_req.status
          END;

  UPDATE public.purchase_requisitions
     SET status = v_to,
         received_by = v_uid,
         received_at = now(),
         receive_notes = coalesce(_note, receive_notes),
         updated_at = now()
   WHERE id = _requisition_id;

  INSERT INTO public.procurement_request_events
    (requisition_id, action, from_status, to_status, note, actor_id, actor_name)
  VALUES
    (_requisition_id, 'received', v_req.status, v_to,
     coalesce(_note, '') || format(' [%s of %s units]', v_received, v_ordered),
     v_uid, public.procurement_actor_name(v_uid));

  RETURN v_to;
END;
$function$;

-- 3. Procurement stock report (items + linked request/receipt activity)
CREATE OR REPLACE FUNCTION public.procurement_inventory(_days integer DEFAULT 365)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := auth.uid();
  since timestamptz := now() - make_interval(days => GREATEST(COALESCE(_days, 365), 1));
  result jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (public.is_command_tier(actor)
          OR public.has_role(actor, 'storekeeper'::app_role)
          OR public.has_role(actor, 'procurement_officer'::app_role)) THEN
    RAISE EXCEPTION 'Procurement or storekeeper authority required';
  END IF;

  WITH lines AS (
    SELECT i.inventory_item_id AS item_id,
           sum(i.quantity) AS ordered_qty,
           sum(coalesce(i.received_qty, 0)) AS received_qty,
           sum(GREATEST(i.quantity - coalesce(i.received_qty, 0), 0))
             FILTER (WHERE r.status IN ('submitted', 'approved', 'partial')) AS outstanding_qty,
           count(*) FILTER (WHERE r.status IN ('submitted', 'approved', 'partial')) AS open_requests,
           count(*) AS request_lines,
           max(r.received_at) AS last_received_at,
           (array_agg(r.pr_number ORDER BY r.created_at DESC))[1] AS last_pr_number,
           (array_agg(r.status ORDER BY r.created_at DESC))[1] AS last_pr_status
      FROM public.purchase_requisition_items i
      JOIN public.purchase_requisitions r ON r.id = i.requisition_id
     WHERE i.inventory_item_id IS NOT NULL
       AND r.created_at >= since
     GROUP BY i.inventory_item_id
  ),
  rows AS (
    SELECT jsonb_build_object(
      'id', it.id,
      'name', it.name,
      'sku', it.sku,
      'asset_tag', it.asset_tag,
      'unit', it.unit,
      'location', it.location,
      'qty_on_hand', it.qty_on_hand,
      'min_stock', it.min_stock,
      'unit_cost', coalesce(it.unit_cost, 0),
      'stock_value', round(coalesce(it.unit_cost, 0) * it.qty_on_hand, 2),
      'stock_level', CASE
                       WHEN it.qty_on_hand <= 0 THEN 'out'
                       WHEN it.qty_on_hand <= it.min_stock THEN 'low'
                       ELSE 'ok'
                     END,
      'ordered_qty', coalesce(l.ordered_qty, 0),
      'procured_qty', coalesce(l.received_qty, 0),
      'outstanding_qty', coalesce(l.outstanding_qty, 0),
      'open_requests', coalesce(l.open_requests, 0),
      'request_lines', coalesce(l.request_lines, 0),
      'last_received_at', l.last_received_at,
      'last_pr_number', l.last_pr_number,
      'last_pr_status', l.last_pr_status
    ) AS row,
    it.name AS sort_name
    FROM public.inventory_items it
    LEFT JOIN lines l ON l.item_id = it.id
    WHERE it.is_active
  )
  SELECT jsonb_build_object(
    'as_of', now(),
    'days', GREATEST(COALESCE(_days, 365), 1),
    'items', COALESCE(jsonb_agg(row ORDER BY sort_name), '[]'::jsonb)
  )
  INTO result
  FROM rows;

  RETURN COALESCE(result, jsonb_build_object('as_of', now(), 'days', 365, 'items', '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.procurement_inventory(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.procurement_inventory(integer) TO authenticated;

-- 4. Procurement KPIs per branch on the command dashboard
CREATE OR REPLACE FUNCTION public.command_dashboard(_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := auth.uid();
  today date := (now() AT TIME ZONE 'UTC')::date;
  since timestamptz := now() - make_interval(days => GREATEST(COALESCE(_days, 30), 1));
  result jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_command_tier(actor) THEN
    RAISE EXCEPTION 'Command authority required';
  END IF;

  WITH reach AS (
    SELECT u.id FROM public.org_units u
    WHERE u.id IN (SELECT public.command_reach_units(actor))
  ),
  branches AS (
    SELECT u.id, u.name, u.type::text AS unit_type, u.parent_id
    FROM public.org_units u
    JOIN reach r ON r.id = u.id
  ),
  branch_units AS (
    SELECT b.id AS branch_id, d AS unit_id
    FROM branches b
    CROSS JOIN public.org_unit_descendants(b.id) d
    WHERE d IN (SELECT id FROM reach)
  ),
  staff AS (
    SELECT bu.branch_id, p.id AS profile_id, p.user_id
    FROM branch_units bu
    JOIN public.profiles p ON p.org_unit_id = bu.unit_id
    WHERE COALESCE(p.status::text, 'active') = 'active'
  ),
  attendance AS (
    SELECT s.branch_id,
           count(*) FILTER (WHERE a.status::text = 'present') AS present,
           count(*) FILTER (WHERE a.status::text = 'late') AS late,
           count(*) FILTER (WHERE a.status::text = 'excused') AS excused,
           count(*) FILTER (WHERE a.status::text = 'absent') AS absent
    FROM staff s
    LEFT JOIN public.attendances a
      ON a.profile_id = s.profile_id AND a.date = today
    GROUP BY s.branch_id
  ),
  head AS (
    SELECT branch_id, count(*) AS staff_total FROM staff GROUP BY branch_id
  ),
  vehicles AS (
    SELECT bu.branch_id,
           count(*) AS total,
           count(*) FILTER (WHERE v.status::text = 'active') AS active,
           count(*) FILTER (WHERE v.status::text = 'maintenance') AS maintenance,
           count(*) FILTER (WHERE v.status::text = 'grounded') AS grounded,
           count(*) FILTER (WHERE v.immobilized) AS immobilized,
           count(*) FILTER (WHERE v.last_seen_at IS NULL OR v.last_seen_at < now() - interval '30 minutes') AS offline,
           round(avg(v.last_fuel_level_pct)::numeric, 1) AS avg_fuel,
           count(*) FILTER (
             WHERE v.last_fuel_level_pct IS NOT NULL
               AND v.last_fuel_level_pct <= COALESCE(v.low_fuel_threshold_pct, 20)
           ) AS low_fuel
    FROM branch_units bu
    JOIN public.fleet_vehicles v ON v.org_unit_id = bu.unit_id
    GROUP BY bu.branch_id
  ),
  cmd_alerts AS (
    SELECT bu.branch_id,
           count(*) FILTER (WHERE a.status::text <> 'closed') AS open_alerts,
           count(*) FILTER (WHERE a.status::text <> 'closed' AND a.severity::text = 'critical') AS critical_alerts
    FROM branch_units bu
    JOIN public.command_alerts a ON a.org_unit_id = bu.unit_id
    WHERE a.created_at >= since
    GROUP BY bu.branch_id
  ),
  fleet_al AS (
    SELECT bu.branch_id, count(*) AS open_fleet_alerts
    FROM branch_units bu
    JOIN public.fleet_vehicles v ON v.org_unit_id = bu.unit_id
    JOIN public.fleet_alerts fa ON fa.vehicle_id = v.id
    WHERE fa.status::text IN ('new', 'acknowledged') AND fa.occurred_at >= since
    GROUP BY bu.branch_id
  ),
  cyber AS (
    SELECT bu.branch_id,
           count(*) FILTER (WHERE lower(c.status) NOT IN ('resolved', 'closed')) AS open_cyber,
           count(*) AS cyber_total
    FROM branch_units bu
    JOIN public.cyber_incidents c ON c.org_unit_id = bu.unit_id
    WHERE c.reported_at >= since
    GROUP BY bu.branch_id
  ),
  proc AS (
    SELECT s.branch_id,
           count(*) AS proc_total,
           count(*) FILTER (WHERE pr.status = 'submitted') AS proc_pending,
           count(*) FILTER (WHERE pr.status IN ('approved', 'partial')) AS proc_approved,
           count(*) FILTER (WHERE pr.status = 'received') AS proc_received,
           count(*) FILTER (WHERE pr.status = 'rejected') AS proc_rejected,
           round(coalesce(sum(pr.estimated_cost) FILTER (
             WHERE pr.status IN ('approved', 'partial', 'received')), 0)::numeric, 2) AS proc_committed
    FROM staff s
    JOIN public.purchase_requisitions pr ON pr.requested_by = s.user_id
    WHERE pr.created_at >= since
    GROUP BY s.branch_id
  ),
  proc_items AS (
    SELECT s.branch_id,
           coalesce(sum(i.quantity), 0) AS proc_items_ordered,
           coalesce(sum(coalesce(i.received_qty, 0)), 0) AS proc_items_received
    FROM staff s
    JOIN public.purchase_requisitions pr ON pr.requested_by = s.user_id
    JOIN public.purchase_requisition_items i ON i.requisition_id = pr.id
    WHERE pr.created_at >= since
    GROUP BY s.branch_id
  )
  SELECT jsonb_build_object(
    'as_of', now(),
    'day', today,
    'days', GREATEST(COALESCE(_days, 30), 1),
    'branches', COALESCE(jsonb_agg(r.row ORDER BY r.row->>'name'), '[]'::jsonb)
  )
  INTO result
  FROM (
    SELECT jsonb_build_object(
      'org_unit_id', b.id,
      'name', b.name,
      'unit_type', b.unit_type,
      'staff_total', COALESCE(h.staff_total, 0),
      'present', COALESCE(at.present, 0),
      'late', COALESCE(at.late, 0),
      'excused', COALESCE(at.excused, 0),
      'absent', COALESCE(at.absent, 0),
      'vehicles_total', COALESCE(v.total, 0),
      'vehicles_active', COALESCE(v.active, 0),
      'vehicles_maintenance', COALESCE(v.maintenance, 0),
      'vehicles_grounded', COALESCE(v.grounded, 0),
      'vehicles_immobilized', COALESCE(v.immobilized, 0),
      'vehicles_offline', COALESCE(v.offline, 0),
      'avg_fuel_pct', v.avg_fuel,
      'low_fuel', COALESCE(v.low_fuel, 0),
      'open_alerts', COALESCE(ca.open_alerts, 0),
      'critical_alerts', COALESCE(ca.critical_alerts, 0),
      'open_fleet_alerts', COALESCE(fl.open_fleet_alerts, 0),
      'open_cyber', COALESCE(cy.open_cyber, 0),
      'cyber_total', COALESCE(cy.cyber_total, 0),
      'proc_total', COALESCE(pc.proc_total, 0),
      'proc_pending', COALESCE(pc.proc_pending, 0),
      'proc_approved', COALESCE(pc.proc_approved, 0),
      'proc_received', COALESCE(pc.proc_received, 0),
      'proc_rejected', COALESCE(pc.proc_rejected, 0),
      'proc_committed', COALESCE(pc.proc_committed, 0),
      'proc_items_ordered', COALESCE(pi.proc_items_ordered, 0),
      'proc_items_received', COALESCE(pi.proc_items_received, 0)
    ) AS row
    FROM branches b
    LEFT JOIN head h ON h.branch_id = b.id
    LEFT JOIN attendance at ON at.branch_id = b.id
    LEFT JOIN vehicles v ON v.branch_id = b.id
    LEFT JOIN cmd_alerts ca ON ca.branch_id = b.id
    LEFT JOIN fleet_al fl ON fl.branch_id = b.id
    LEFT JOIN cyber cy ON cy.branch_id = b.id
    LEFT JOIN proc pc ON pc.branch_id = b.id
    LEFT JOIN proc_items pi ON pi.branch_id = b.id
  ) r;

  RETURN COALESCE(result, jsonb_build_object('as_of', now(), 'day', today, 'days', 30, 'branches', '[]'::jsonb));
END;
$function$;
-- 1) Departments: add icon column for printable icons
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS icon text;

-- 2) Helper: notify all users that have any of a set of roles
CREATE OR REPLACE FUNCTION public.notify_roles(_roles app_role[], _title text, _message text, _type text, _ref uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  FOR _uid IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = ANY(_roles)
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, reference_id)
    VALUES (_uid, _title, _message, _type, _ref);
  END LOOP;
END;
$$;

-- 3) Detention center: alert Admin/OIC/2IC/Supervisors on new detention record
CREATE OR REPLACE FUNCTION public.notify_new_detention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','oic','2ic','supervisor','shift_supervisor','deputy_shift_supervisor']::app_role[],
    'New Detention Intake',
    format('%s %s booked into custody (%s).', NEW.first_name, NEW.last_name, COALESCE(NEW.crime_type,'unspecified')),
    'general',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_detention ON public.detention_records;
CREATE TRIGGER trg_notify_new_detention
AFTER INSERT ON public.detention_records
FOR EACH ROW EXECUTE FUNCTION public.notify_new_detention();

-- 4) Stores & Inventory: alert Admin/OIC/2IC/Storekeeper on new item or stock movement
CREATE OR REPLACE FUNCTION public.notify_new_inventory_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','oic','2ic','storekeeper']::app_role[],
    'New Inventory Item',
    format('Item "%s" added to stores (qty: %s %s).', NEW.name, NEW.qty_on_hand, NEW.unit),
    'general',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_inventory_item ON public.inventory_items;
CREATE TRIGGER trg_notify_new_inventory_item
AFTER INSERT ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.notify_new_inventory_item();

CREATE OR REPLACE FUNCTION public.notify_new_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
BEGIN
  SELECT name INTO _name FROM public.inventory_items WHERE id = NEW.item_id;
  PERFORM public.notify_roles(
    ARRAY['admin','oic','2ic','storekeeper']::app_role[],
    'Stock Movement',
    format('%s: %s x %s', upper(NEW.movement_type), NEW.quantity, COALESCE(_name,'item')),
    'general',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_inventory_movement ON public.inventory_movements;
CREATE TRIGGER trg_notify_new_inventory_movement
AFTER INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.notify_new_inventory_movement();

-- 5) Procurement & Finance: alert Admin/OIC/2IC/procurement_officer on key new records
CREATE OR REPLACE FUNCTION public.notify_new_requisition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','oic','2ic','procurement_officer']::app_role[],
    'New Purchase Requisition',
    format('Requisition "%s" submitted.', COALESCE(NEW.title, NEW.requisition_number)),
    'general',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_requisition ON public.purchase_requisitions;
CREATE TRIGGER trg_notify_new_requisition
AFTER INSERT ON public.purchase_requisitions
FOR EACH ROW EXECUTE FUNCTION public.notify_new_requisition();

CREATE OR REPLACE FUNCTION public.notify_new_purchase_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','oic','2ic','procurement_officer','storekeeper']::app_role[],
    'New Purchase Order',
    format('PO "%s" created.', NEW.po_number),
    'general',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_po ON public.purchase_orders;
CREATE TRIGGER trg_notify_new_po
AFTER INSERT ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.notify_new_purchase_order();

CREATE OR REPLACE FUNCTION public.notify_new_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','oic','2ic','procurement_officer']::app_role[],
    'New Invoice',
    format('Invoice "%s" recorded (%s %s).', NEW.invoice_number, NEW.amount, NEW.currency),
    'general',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_invoice ON public.procurement_invoices;
CREATE TRIGGER trg_notify_new_invoice
AFTER INSERT ON public.procurement_invoices
FOR EACH ROW EXECUTE FUNCTION public.notify_new_invoice();

CREATE OR REPLACE FUNCTION public.notify_new_rfq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','oic','2ic','procurement_officer']::app_role[],
    'New RFQ Issued',
    format('RFQ "%s" \u2014 %s.', NEW.rfq_number, NEW.title),
    'general',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_rfq ON public.procurement_rfqs;
CREATE TRIGGER trg_notify_new_rfq
AFTER INSERT ON public.procurement_rfqs
FOR EACH ROW EXECUTE FUNCTION public.notify_new_rfq();

CREATE OR REPLACE FUNCTION public.notify_new_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','oic','2ic','procurement_officer']::app_role[],
    'New Contract',
    format('Contract "%s" \u2014 %s.', NEW.contract_number, NEW.title),
    'general',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_contract ON public.procurement_contracts;
CREATE TRIGGER trg_notify_new_contract
AFTER INSERT ON public.procurement_contracts
FOR EACH ROW EXECUTE FUNCTION public.notify_new_contract();
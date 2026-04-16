
-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('inventory-photos', 'inventory-photos', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('detention-photos', 'detention-photos', false) ON CONFLICT (id) DO NOTHING;

-- ============= STORES & INVENTORY =============
CREATE TABLE public.inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text, phone text, email text, address text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text UNIQUE,
  category_id uuid REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
  unit text NOT NULL DEFAULT 'pcs',
  qty_on_hand numeric NOT NULL DEFAULT 0,
  min_stock numeric NOT NULL DEFAULT 0,
  unit_cost numeric DEFAULT 0,
  location text, condition text DEFAULT 'good', photo_url text, notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_items_category ON public.inventory_items(category_id);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('in','out','transfer','adjustment')),
  quantity numeric NOT NULL,
  supplier_id uuid REFERENCES public.inventory_suppliers(id) ON DELETE SET NULL,
  issued_to_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reference text, from_location text, to_location text, notes text,
  performed_by uuid NOT NULL,
  movement_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_mov_item ON public.inventory_movements(item_id);
CREATE INDEX idx_inv_mov_date ON public.inventory_movements(movement_date DESC);

CREATE TABLE public.inventory_issuance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quantity numeric NOT NULL,
  issued_by uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz, condition_on_return text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.movement_type IN ('in','adjustment') THEN
    UPDATE public.inventory_items SET qty_on_hand = qty_on_hand + NEW.quantity, updated_at = now() WHERE id = NEW.item_id;
  ELSIF NEW.movement_type IN ('out','transfer') THEN
    UPDATE public.inventory_items SET qty_on_hand = qty_on_hand - NEW.quantity, updated_at = now() WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_apply_inv_movement AFTER INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();

-- ============= HOLDING / DETENTION CENTER =============
CREATE TABLE public.detention_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL, last_name text NOT NULL, alias text,
  gender text, date_of_birth date,
  nationality text, country_of_origin text,
  id_type text, id_number text, photo_url text,
  home_address text, phone text,
  next_of_kin text, next_of_kin_phone text, emergency_contact text,
  crime_type text NOT NULL, charge_description text,
  location_of_arrest text,
  arrest_date timestamptz NOT NULL DEFAULT now(),
  arresting_officer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  arresting_officer_name text,
  officer_in_charge_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cell_number text,
  intake_at timestamptz NOT NULL DEFAULT now(),
  expected_release_at timestamptz,
  released_at timestamptz,
  released_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  release_reason text,
  status text NOT NULL DEFAULT 'in_custody' CHECK (status IN ('in_custody','released','transferred','court','escaped')),
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
  medical_alerts text, notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_det_status ON public.detention_records(status);
CREATE INDEX idx_det_intake ON public.detention_records(intake_at DESC);
CREATE INDEX idx_det_nationality ON public.detention_records(nationality);

CREATE TABLE public.detention_property_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detention_id uuid NOT NULL REFERENCES public.detention_records(id) ON DELETE CASCADE,
  item_description text NOT NULL,
  quantity numeric DEFAULT 1, condition text,
  logged_by uuid NOT NULL, logged_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz, returned_to text, notes text
);

CREATE TABLE public.detention_visitor_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detention_id uuid NOT NULL REFERENCES public.detention_records(id) ON DELETE CASCADE,
  visitor_name text NOT NULL, relationship text, id_number text, phone text,
  visit_start timestamptz NOT NULL DEFAULT now(), visit_end timestamptz,
  approved_by uuid NOT NULL, notes text
);

CREATE TABLE public.detention_medical_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detention_id uuid NOT NULL REFERENCES public.detention_records(id) ON DELETE CASCADE,
  complaint text NOT NULL, treatment text, attended_by text,
  attended_at timestamptz NOT NULL DEFAULT now(),
  notes text, logged_by uuid NOT NULL
);

CREATE TABLE public.detention_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detention_id uuid NOT NULL REFERENCES public.detention_records(id) ON DELETE CASCADE,
  from_location text, to_location text NOT NULL,
  reason text, escorted_by text,
  transferred_at timestamptz NOT NULL DEFAULT now(),
  performed_by uuid NOT NULL
);

-- updated_at triggers
CREATE TRIGGER trg_inv_cat_upd BEFORE UPDATE ON public.inventory_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_inv_sup_upd BEFORE UPDATE ON public.inventory_suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_inv_items_upd BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_inv_iss_upd BEFORE UPDATE ON public.inventory_issuance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_det_upd BEFORE UPDATE ON public.detention_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- audit triggers
CREATE TRIGGER trg_audit_inv_items AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();
CREATE TRIGGER trg_audit_inv_mov AFTER INSERT OR UPDATE OR DELETE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();
CREATE TRIGGER trg_audit_inv_iss AFTER INSERT OR UPDATE OR DELETE ON public.inventory_issuance FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();
CREATE TRIGGER trg_audit_det AFTER INSERT OR UPDATE OR DELETE ON public.detention_records FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

-- RLS
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_issuance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detention_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detention_property_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detention_visitor_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detention_medical_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detention_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View inv categories" ON public.inventory_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage inv categories" ON public.inventory_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'storekeeper'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'storekeeper'));

CREATE POLICY "View suppliers" ON public.inventory_suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage suppliers" ON public.inventory_suppliers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'storekeeper'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'storekeeper'));

CREATE POLICY "View items" ON public.inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage items" ON public.inventory_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'storekeeper'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'storekeeper'));

CREATE POLICY "View movements" ON public.inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert movements" ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'storekeeper')) AND performed_by = auth.uid());
CREATE POLICY "Admin manages movements" ON public.inventory_movements FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "View issuance" ON public.inventory_issuance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage issuance" ON public.inventory_issuance FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'storekeeper'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'storekeeper'));

CREATE POLICY "Cmd manage detention" ON public.detention_records FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'));
CREATE POLICY "Enf view detention" ON public.detention_records FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor'));
CREATE POLICY "Enf insert detention" ON public.detention_records FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor')) AND created_by = auth.uid());
CREATE POLICY "Enf update detention" ON public.detention_records FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor'))
  WITH CHECK (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor'));

CREATE POLICY "Cmd property" ON public.detention_property_log FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'));
CREATE POLICY "Enf view property" ON public.detention_property_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor'));
CREATE POLICY "Enf insert property" ON public.detention_property_log FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor')) AND logged_by = auth.uid());

CREATE POLICY "Cmd visitor" ON public.detention_visitor_log FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'));
CREATE POLICY "Enf view visitor" ON public.detention_visitor_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor'));
CREATE POLICY "Enf insert visitor" ON public.detention_visitor_log FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor')) AND approved_by = auth.uid());

CREATE POLICY "Cmd medical" ON public.detention_medical_log FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'));
CREATE POLICY "Enf view medical" ON public.detention_medical_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor'));
CREATE POLICY "Enf insert medical" ON public.detention_medical_log FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor')) AND logged_by = auth.uid());

CREATE POLICY "Cmd transfers" ON public.detention_transfers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'));
CREATE POLICY "Enf view transfers" ON public.detention_transfers FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor'));
CREATE POLICY "Enf insert transfers" ON public.detention_transfers FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor')) AND performed_by = auth.uid());

-- Storage RLS
CREATE POLICY "inv-photos upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inventory-photos' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'storekeeper')));
CREATE POLICY "inv-photos view" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'inventory-photos');
CREATE POLICY "inv-photos update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'inventory-photos' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'storekeeper')));
CREATE POLICY "inv-photos delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inventory-photos' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'storekeeper')));

CREATE POLICY "det-photos upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'detention-photos' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor')));
CREATE POLICY "det-photos view" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'detention-photos' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor')));

INSERT INTO public.departments (name, description) VALUES
  ('Stores & Inventory', 'Manages procurement, stock, equipment issuance and inventory operations.'),
  ('Holding Center', 'Detention & custody operations under the Operations command.')
ON CONFLICT DO NOTHING;

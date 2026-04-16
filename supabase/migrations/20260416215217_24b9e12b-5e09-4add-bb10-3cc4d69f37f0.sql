-- ============ VENDORS ============
CREATE TABLE IF NOT EXISTS public.procurement_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vendor_code text UNIQUE,
  contact_person text,
  email text,
  phone text,
  address text,
  tin_number text,
  category text,
  rating numeric DEFAULT 0,
  is_blacklisted boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  department_id uuid,
  requested_by uuid NOT NULL,
  estimated_cost numeric DEFAULT 0,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'draft',
  needed_by date,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_requisition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit text DEFAULT 'pcs',
  estimated_unit_cost numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procurement_rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number text UNIQUE NOT NULL,
  requisition_id uuid REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  closing_date date,
  status text NOT NULL DEFAULT 'open',
  created_by uuid NOT NULL,
  awarded_vendor_id uuid REFERENCES public.procurement_vendors(id) ON DELETE SET NULL,
  awarded_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procurement_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.procurement_rfqs(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.procurement_vendors(id) ON DELETE CASCADE,
  quoted_amount numeric NOT NULL,
  delivery_days integer,
  valid_until date,
  notes text,
  selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE NOT NULL,
  requisition_id uuid REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  rfq_id uuid REFERENCES public.procurement_rfqs(id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES public.procurement_vendors(id) ON DELETE RESTRICT,
  total_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GHS',
  status text NOT NULL DEFAULT 'draft',
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery date,
  delivered_at date,
  payment_terms text,
  delivery_address text,
  created_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  description text,
  quantity numeric NOT NULL,
  unit text DEFAULT 'pcs',
  unit_cost numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procurement_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES public.procurement_vendors(id) ON DELETE RESTRICT,
  amount numeric NOT NULL,
  tax_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GHS',
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text NOT NULL DEFAULT 'pending',
  paid_at date,
  payment_reference text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procurement_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number text UNIQUE NOT NULL,
  title text NOT NULL,
  vendor_id uuid REFERENCES public.procurement_vendors(id) ON DELETE SET NULL,
  contract_type text NOT NULL DEFAULT 'service',
  start_date date,
  end_date date,
  value numeric DEFAULT 0,
  currency text NOT NULL DEFAULT 'GHS',
  status text NOT NULL DEFAULT 'active',
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procurement_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  document_type text NOT NULL DEFAULT 'general',
  reference_table text,
  reference_id uuid,
  vendor_id uuid REFERENCES public.procurement_vendors(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL,
  file_type text NOT NULL,
  tags text[],
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_proc_vendors_upd BEFORE UPDATE ON public.procurement_vendors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pr_upd BEFORE UPDATE ON public.purchase_requisitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rfq_upd BEFORE UPDATE ON public.procurement_rfqs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_po_upd BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_inv_upd BEFORE UPDATE ON public.procurement_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_contracts_upd BEFORE UPDATE ON public.procurement_contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_proc_docs_upd BEFORE UPDATE ON public.procurement_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.procurement_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisition_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_documents ENABLE ROW LEVEL SECURITY;

-- Vendors
CREATE POLICY "View vendors" ON public.procurement_vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage vendors" ON public.procurement_vendors FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));

-- Requisitions
CREATE POLICY "View own/all requisitions" ON public.purchase_requisitions FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer') OR has_role(auth.uid(),'supervisor'));
CREATE POLICY "Create own requisitions" ON public.purchase_requisitions FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());
CREATE POLICY "Update own draft requisitions" ON public.purchase_requisitions FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() AND status = 'draft')
  WITH CHECK (requested_by = auth.uid());
CREATE POLICY "Procurement manages requisitions" ON public.purchase_requisitions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));

CREATE POLICY "View requisition items" ON public.purchase_requisition_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_requisitions r WHERE r.id = requisition_id AND (
    r.requested_by = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'))));
CREATE POLICY "Manage requisition items" ON public.purchase_requisition_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_requisitions r WHERE r.id = requisition_id AND (
    (r.requested_by = auth.uid() AND r.status='draft') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_requisitions r WHERE r.id = requisition_id AND (
    (r.requested_by = auth.uid() AND r.status='draft') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'))));

-- RFQs / Quotes
CREATE POLICY "View rfqs" ON public.procurement_rfqs FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));
CREATE POLICY "Manage rfqs" ON public.procurement_rfqs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));

CREATE POLICY "View quotes" ON public.procurement_quotes FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));
CREATE POLICY "Manage quotes" ON public.procurement_quotes FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));

-- POs
CREATE POLICY "View pos" ON public.purchase_orders FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer') OR has_role(auth.uid(),'storekeeper'));
CREATE POLICY "Manage pos" ON public.purchase_orders FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));

CREATE POLICY "View po items" ON public.purchase_order_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer') OR has_role(auth.uid(),'storekeeper'));
CREATE POLICY "Manage po items" ON public.purchase_order_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));

-- Invoices
CREATE POLICY "View invoices" ON public.procurement_invoices FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));
CREATE POLICY "Manage invoices" ON public.procurement_invoices FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));

-- Contracts
CREATE POLICY "View contracts" ON public.procurement_contracts FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));
CREATE POLICY "Manage contracts" ON public.procurement_contracts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));

-- Documents
CREATE POLICY "View procurement docs" ON public.procurement_documents FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));
CREATE POLICY "Insert procurement docs" ON public.procurement_documents FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer')) AND uploaded_by = auth.uid());
CREATE POLICY "Update procurement docs" ON public.procurement_documents FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));
CREATE POLICY "Delete procurement docs" ON public.procurement_documents FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer'));

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('procurement-docs', 'procurement-docs', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Procurement view docs storage" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'procurement-docs' AND (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer')));
CREATE POLICY "Procurement upload docs storage" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'procurement-docs' AND (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer')));
CREATE POLICY "Procurement update docs storage" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'procurement-docs' AND (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer')));
CREATE POLICY "Procurement delete docs storage" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'procurement-docs' AND (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic') OR has_role(auth.uid(),'procurement_officer')));

CREATE INDEX IF NOT EXISTS idx_pr_status ON public.purchase_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON public.purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_inv_status ON public.procurement_invoices(status);
CREATE INDEX IF NOT EXISTS idx_contract_status ON public.procurement_contracts(status);
CREATE INDEX IF NOT EXISTS idx_proc_docs_type ON public.procurement_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_proc_docs_tags ON public.procurement_documents USING GIN(tags);
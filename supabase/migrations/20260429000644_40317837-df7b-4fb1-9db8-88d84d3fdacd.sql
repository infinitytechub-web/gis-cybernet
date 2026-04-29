-- Inventory audit counts for compliance reconciliation
CREATE TABLE IF NOT EXISTS public.inventory_audit_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  physical_count numeric NOT NULL DEFAULT 0,
  system_qty numeric NOT NULL DEFAULT 0,
  variance numeric GENERATED ALWAYS AS (physical_count - system_qty) STORED,
  notes text,
  counted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  counted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_counts_item ON public.inventory_audit_counts(item_id);
CREATE INDEX IF NOT EXISTS idx_audit_counts_date ON public.inventory_audit_counts(counted_at DESC);

ALTER TABLE public.inventory_audit_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stores team can view audit counts"
  ON public.inventory_audit_counts FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
    OR public.has_role(auth.uid(), 'staff_officer'::app_role)
    OR public.has_role(auth.uid(), 'storekeeper'::app_role)
  );

CREATE POLICY "Stores team can record audit counts"
  ON public.inventory_audit_counts FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
    OR public.has_role(auth.uid(), 'storekeeper'::app_role)
  );

CREATE POLICY "Admins can update audit counts"
  ON public.inventory_audit_counts FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete audit counts"
  ON public.inventory_audit_counts FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
-- 1) Asset tag counter
CREATE TABLE IF NOT EXISTS public.asset_tag_counters (
  year integer PRIMARY KEY,
  next_value integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.asset_tag_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tag counters"
  ON public.asset_tag_counters FOR SELECT TO authenticated USING (true);

-- 2) Add columns to inventory_items
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS asset_tag text UNIQUE,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS purchase_date date,
  ADD COLUMN IF NOT EXISTS warranty_expires date;

CREATE INDEX IF NOT EXISTS idx_inventory_items_asset_tag ON public.inventory_items (asset_tag);

-- 3) Asset tag generator
CREATE OR REPLACE FUNCTION public.generate_asset_tag()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _yr integer := EXTRACT(YEAR FROM now())::int;
  _next integer;
BEGIN
  INSERT INTO public.asset_tag_counters (year, next_value)
  VALUES (_yr, 2)
  ON CONFLICT (year) DO UPDATE
    SET next_value = public.asset_tag_counters.next_value + 1,
        updated_at = now()
  RETURNING next_value - 1 INTO _next;

  RETURN format('GIS-%s-%s', _yr, lpad(_next::text, 4, '0'));
END;
$$;

-- 4) Trigger to assign asset_tag on insert if missing
CREATE OR REPLACE FUNCTION public.set_inventory_asset_tag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.asset_tag IS NULL OR length(btrim(NEW.asset_tag)) = 0 THEN
    NEW.asset_tag := public.generate_asset_tag();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_set_asset_tag ON public.inventory_items;
CREATE TRIGGER trg_inventory_set_asset_tag
BEFORE INSERT ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.set_inventory_asset_tag();

-- 5) Backfill existing rows that don't have a tag
UPDATE public.inventory_items
SET asset_tag = public.generate_asset_tag()
WHERE asset_tag IS NULL;

-- 6) Storage bucket policies for inventory-photos (bucket already exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'inventory-photos') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('inventory-photos', 'inventory-photos', false);
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated can read inventory photos" ON storage.objects;
CREATE POLICY "Authenticated can read inventory photos"
  ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'inventory-photos');

DROP POLICY IF EXISTS "Storekeepers can upload inventory photos" ON storage.objects;
CREATE POLICY "Storekeepers can upload inventory photos"
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'inventory-photos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'oic')
      OR public.has_role(auth.uid(), '2ic')
      OR public.has_role(auth.uid(), 'storekeeper')
    )
  );

DROP POLICY IF EXISTS "Storekeepers can update inventory photos" ON storage.objects;
CREATE POLICY "Storekeepers can update inventory photos"
  ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'inventory-photos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'oic')
      OR public.has_role(auth.uid(), '2ic')
      OR public.has_role(auth.uid(), 'storekeeper')
    )
  );

DROP POLICY IF EXISTS "Storekeepers can delete inventory photos" ON storage.objects;
CREATE POLICY "Storekeepers can delete inventory photos"
  ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'inventory-photos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'oic')
      OR public.has_role(auth.uid(), '2ic')
      OR public.has_role(auth.uid(), 'storekeeper')
    )
  );
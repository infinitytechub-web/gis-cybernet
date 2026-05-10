ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS log_reference TEXT,
  ADD COLUMN IF NOT EXISTS operation_time TIME,
  ADD COLUMN IF NOT EXISTS gps_coordinates TEXT,
  ADD COLUMN IF NOT EXISTS weapons_used TEXT,
  ADD COLUMN IF NOT EXISTS vehicles_involved TEXT,
  ADD COLUMN IF NOT EXISTS casualties_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_seized TEXT,
  ADD COLUMN IF NOT EXISTS witnesses TEXT,
  ADD COLUMN IF NOT EXISTS action_taken TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_notes TEXT,
  ADD COLUMN IF NOT EXISTS supervisor_remarks TEXT,
  ADD COLUMN IF NOT EXISTS hq_reference_number TEXT;

CREATE OR REPLACE FUNCTION public.generate_operations_table_log_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  yymm TEXT;
  seq INT;
BEGIN
  IF NEW.log_reference IS NULL OR length(trim(NEW.log_reference)) = 0 THEN
    yymm := to_char(coalesce(NEW.operation_date, CURRENT_DATE), 'YYYYMM');
    SELECT COALESCE(MAX(NULLIF(regexp_replace(log_reference, '^GIS-OPS-' || yymm || '-', ''), '')::int), 0) + 1
      INTO seq
      FROM public.operations
     WHERE log_reference LIKE 'GIS-OPS-' || yymm || '-%';
    NEW.log_reference := 'GIS-OPS-' || yymm || '-' || lpad(seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_operations_table_log_reference ON public.operations;
CREATE TRIGGER trg_generate_operations_table_log_reference
BEFORE INSERT ON public.operations
FOR EACH ROW EXECUTE FUNCTION public.generate_operations_table_log_reference();
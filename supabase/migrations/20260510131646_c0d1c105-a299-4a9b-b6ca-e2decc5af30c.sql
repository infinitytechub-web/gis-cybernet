-- MFA Passport Form A standard: add remaining fields
ALTER TABLE public.passport_applications
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS spouse_name TEXT,
  ADD COLUMN IF NOT EXISTS previous_passport_place_of_issue TEXT,
  ADD COLUMN IF NOT EXISTS declaration_signed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS declaration_date DATE,
  ADD COLUMN IF NOT EXISTS biometric_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS witnessing_officer_name TEXT,
  ADD COLUMN IF NOT EXISTS witnessing_officer_rank TEXT;

-- GIS Headquarters Operations Log standard: add remaining fields
ALTER TABLE public.enforcement_operations
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

-- Auto-generate log_reference for new operations log entries (e.g. GIS-OPS-202612-0001)
CREATE OR REPLACE FUNCTION public.generate_operations_log_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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
      FROM public.enforcement_operations
     WHERE log_reference LIKE 'GIS-OPS-' || yymm || '-%';
    NEW.log_reference := 'GIS-OPS-' || yymm || '-' || lpad(seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_operations_log_reference ON public.enforcement_operations;
CREATE TRIGGER trg_generate_operations_log_reference
BEFORE INSERT ON public.enforcement_operations
FOR EACH ROW EXECUTE FUNCTION public.generate_operations_log_reference();
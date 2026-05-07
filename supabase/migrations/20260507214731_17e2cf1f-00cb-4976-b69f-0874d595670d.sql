
-- ============================================================
-- GIS standard fields + secure document attachments
-- ============================================================

-- Common GIS biographic / passport / sponsor / processing columns
DO $$ BEGIN
  -- PERMITS
  ALTER TABLE public.permits
    ADD COLUMN IF NOT EXISTS surname text,
    ADD COLUMN IF NOT EXISTS other_names text,
    ADD COLUMN IF NOT EXISTS place_of_birth text,
    ADD COLUMN IF NOT EXISTS dual_nationality text,
    ADD COLUMN IF NOT EXISTS passport_type text,
    ADD COLUMN IF NOT EXISTS passport_issue_date date,
    ADD COLUMN IF NOT EXISTS passport_expiry_date date,
    ADD COLUMN IF NOT EXISTS passport_place_of_issue text,
    ADD COLUMN IF NOT EXISTS port_of_entry text,
    ADD COLUMN IF NOT EXISTS ghana_post_gps text,
    ADD COLUMN IF NOT EXISTS host_name text,
    ADD COLUMN IF NOT EXISTS host_phone text,
    ADD COLUMN IF NOT EXISTS host_address text,
    ADD COLUMN IF NOT EXISTS previous_permit_history text,
    ADD COLUMN IF NOT EXISTS fee_receipt_number text,
    ADD COLUMN IF NOT EXISTS processing_checklist jsonb DEFAULT '{}'::jsonb;

  -- VISA APPLICATIONS
  ALTER TABLE public.visa_applications
    ADD COLUMN IF NOT EXISTS surname text,
    ADD COLUMN IF NOT EXISTS other_names text,
    ADD COLUMN IF NOT EXISTS place_of_birth text,
    ADD COLUMN IF NOT EXISTS dual_nationality text,
    ADD COLUMN IF NOT EXISTS occupation text,
    ADD COLUMN IF NOT EXISTS passport_type text,
    ADD COLUMN IF NOT EXISTS passport_issue_date date,
    ADD COLUMN IF NOT EXISTS passport_expiry_date date,
    ADD COLUMN IF NOT EXISTS passport_place_of_issue text,
    ADD COLUMN IF NOT EXISTS port_of_entry text,
    ADD COLUMN IF NOT EXISTS ghana_post_gps text,
    ADD COLUMN IF NOT EXISTS host_name text,
    ADD COLUMN IF NOT EXISTS host_phone text,
    ADD COLUMN IF NOT EXISTS host_address text,
    ADD COLUMN IF NOT EXISTS previous_visa_history text,
    ADD COLUMN IF NOT EXISTS fee_charged numeric,
    ADD COLUMN IF NOT EXISTS fee_receipt_number text,
    ADD COLUMN IF NOT EXISTS processing_checklist jsonb DEFAULT '{}'::jsonb;

  -- VISA EXTENSIONS
  ALTER TABLE public.visa_extensions
    ADD COLUMN IF NOT EXISTS surname text,
    ADD COLUMN IF NOT EXISTS other_names text,
    ADD COLUMN IF NOT EXISTS place_of_birth text,
    ADD COLUMN IF NOT EXISTS dual_nationality text,
    ADD COLUMN IF NOT EXISTS occupation text,
    ADD COLUMN IF NOT EXISTS passport_type text,
    ADD COLUMN IF NOT EXISTS passport_issue_date date,
    ADD COLUMN IF NOT EXISTS passport_expiry_date date,
    ADD COLUMN IF NOT EXISTS passport_place_of_issue text,
    ADD COLUMN IF NOT EXISTS port_of_entry text,
    ADD COLUMN IF NOT EXISTS ghana_post_gps text,
    ADD COLUMN IF NOT EXISTS host_name text,
    ADD COLUMN IF NOT EXISTS host_phone text,
    ADD COLUMN IF NOT EXISTS host_address text,
    ADD COLUMN IF NOT EXISTS fee_receipt_number text,
    ADD COLUMN IF NOT EXISTS processing_checklist jsonb DEFAULT '{}'::jsonb;

  -- PASSPORT APPLICATIONS
  ALTER TABLE public.passport_applications
    ADD COLUMN IF NOT EXISTS application_reference text,
    ADD COLUMN IF NOT EXISTS surname text,
    ADD COLUMN IF NOT EXISTS other_names text,
    ADD COLUMN IF NOT EXISTS place_of_birth text,
    ADD COLUMN IF NOT EXISTS occupation text,
    ADD COLUMN IF NOT EXISTS height_cm integer,
    ADD COLUMN IF NOT EXISTS eye_colour text,
    ADD COLUMN IF NOT EXISTS distinguishing_marks text,
    ADD COLUMN IF NOT EXISTS ghana_card_number text,
    ADD COLUMN IF NOT EXISTS previous_passport_number text,
    ADD COLUMN IF NOT EXISTS previous_passport_issue_date date,
    ADD COLUMN IF NOT EXISTS previous_passport_expiry_date date,
    ADD COLUMN IF NOT EXISTS ghana_post_gps text,
    ADD COLUMN IF NOT EXISTS region text,
    ADD COLUMN IF NOT EXISTS district text,
    ADD COLUMN IF NOT EXISTS town text,
    ADD COLUMN IF NOT EXISTS father_name text,
    ADD COLUMN IF NOT EXISTS mother_name text,
    ADD COLUMN IF NOT EXISTS fee_charged numeric,
    ADD COLUMN IF NOT EXISTS fee_receipt_number text,
    ADD COLUMN IF NOT EXISTS processing_checklist jsonb DEFAULT '{}'::jsonb;
END $$;

-- ============================================================
-- application_documents (centralised secure-uploads index)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.application_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL CHECK (record_type IN ('permit','visa','visa_extension','passport')),
  record_id uuid NOT NULL,
  slot text NOT NULL,
  slot_label text,
  storage_path text NOT NULL,
  filename text NOT NULL,
  size_bytes bigint,
  mime_type text,
  sniffed_mime text,
  sha256 text,
  scan_action text,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_documents_record_idx
  ON public.application_documents (record_type, record_id);

ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;

-- Read: uploader, processor of the parent record, or command tier
CREATE POLICY "ad_select" ON public.application_documents
FOR SELECT TO authenticated
USING (
  uploaded_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
  OR public.has_role(auth.uid(), 'supervisor')
  OR public.has_role(auth.uid(), 'front_desk')
);

CREATE POLICY "ad_insert" ON public.application_documents
FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "ad_update" ON public.application_documents
FOR UPDATE TO authenticated
USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ad_delete" ON public.application_documents
FOR DELETE TO authenticated
USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

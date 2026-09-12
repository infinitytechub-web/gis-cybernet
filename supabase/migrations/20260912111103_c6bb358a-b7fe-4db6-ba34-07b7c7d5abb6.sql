-- ============ profiles: new columns ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_minor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS minor_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS minor_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS minor_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS minor_review_reason text,
  ADD COLUMN IF NOT EXISTS dob_verification_status text NOT NULL DEFAULT 'not_verified',
  ADD COLUMN IF NOT EXISTS dob_verified_by uuid,
  ADD COLUMN IF NOT EXISTS dob_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS dob_verification_note text,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivation_reason text;

-- auto-flag minors
CREATE OR REPLACE FUNCTION public.flag_minor_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_minor boolean := false;
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    v_minor := NEW.date_of_birth > (current_date - interval '18 years');
  END IF;
  NEW.is_minor := v_minor;
  IF v_minor THEN
    IF NEW.minor_status IS NULL OR NEW.minor_status = 'not_applicable' THEN
      NEW.minor_status := 'pending';
    END IF;
  ELSE
    NEW.minor_status := 'not_applicable';
    NEW.minor_reviewed_by := NULL;
    NEW.minor_reviewed_at := NULL;
    NEW.minor_review_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_minor_profile ON public.profiles;
CREATE TRIGGER trg_flag_minor_profile
BEFORE INSERT OR UPDATE OF date_of_birth ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.flag_minor_profile();

-- ============ rank categories ============
CREATE TABLE IF NOT EXISTS public.rank_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rank_categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rank_categories TO authenticated;
GRANT ALL ON public.rank_categories TO service_role;
ALTER TABLE public.rank_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rank_categories_read" ON public.rank_categories;
CREATE POLICY "rank_categories_read" ON public.rank_categories
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rank_categories_admin_write" ON public.rank_categories;
CREATE POLICY "rank_categories_admin_write" ON public.rank_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.ranks
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.rank_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order integer;

UPDATE public.ranks SET sort_order = COALESCE(sort_order, level) WHERE sort_order IS NULL;

INSERT INTO public.rank_categories (name, sort_order)
VALUES ('Senior Officers', 1), ('Junior Officers', 2), ('Civilian Staff', 3)
ON CONFLICT (name) DO NOTHING;

-- ============ staff deactivations (immutable history) ============
CREATE TABLE IF NOT EXISTS public.staff_deactivations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  reason text NOT NULL,
  effective_date date NOT NULL DEFAULT current_date,
  performed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_deactivations_profile ON public.staff_deactivations(profile_id, created_at DESC);
GRANT SELECT ON public.staff_deactivations TO authenticated;
GRANT ALL ON public.staff_deactivations TO service_role;
ALTER TABLE public.staff_deactivations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_deactivations_read" ON public.staff_deactivations;
CREATE POLICY "staff_deactivations_read" ON public.staff_deactivations
  FOR SELECT TO authenticated
  USING (public.can_access_staff_profile(auth.uid(), profile_id));

-- ============ dependents ============
CREATE TABLE IF NOT EXISTS public.staff_dependents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text,
  sex text,
  date_of_birth date,
  contact text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_dependents_profile ON public.staff_dependents(profile_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_dependents TO authenticated;
GRANT ALL ON public.staff_dependents TO service_role;
ALTER TABLE public.staff_dependents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_dependents_read" ON public.staff_dependents;
CREATE POLICY "staff_dependents_read" ON public.staff_dependents
  FOR SELECT TO authenticated USING (public.can_access_staff_profile(auth.uid(), profile_id));
DROP POLICY IF EXISTS "staff_dependents_write" ON public.staff_dependents;
CREATE POLICY "staff_dependents_write" ON public.staff_dependents
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profile_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profile_id AND p.user_id = auth.uid())
  );
CREATE TRIGGER trg_staff_dependents_updated_at
BEFORE UPDATE ON public.staff_dependents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ digital signatures (immutable) ============
CREATE TABLE IF NOT EXISTS public.staff_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  signer_user_id uuid NOT NULL,
  signer_name text NOT NULL,
  signer_role text,
  record_type text NOT NULL,
  record_id uuid,
  record_fingerprint text NOT NULL,
  signature_data text NOT NULL,
  signature_hash text NOT NULL,
  ip_address text,
  user_agent text,
  device_fingerprint text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  invalidated_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_signatures_record ON public.staff_signatures(record_type, record_id);
GRANT SELECT, INSERT ON public.staff_signatures TO authenticated;
GRANT ALL ON public.staff_signatures TO service_role;
ALTER TABLE public.staff_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_signatures_read" ON public.staff_signatures;
CREATE POLICY "staff_signatures_read" ON public.staff_signatures
  FOR SELECT TO authenticated
  USING (
    signer_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR (profile_id IS NOT NULL AND public.can_access_staff_profile(auth.uid(), profile_id))
  );
DROP POLICY IF EXISTS "staff_signatures_insert_self" ON public.staff_signatures;
CREATE POLICY "staff_signatures_insert_self" ON public.staff_signatures
  FOR INSERT TO authenticated
  WITH CHECK (signer_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.block_signature_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Digital signatures are immutable';
END;
$$;
DROP TRIGGER IF EXISTS trg_block_signature_mutation ON public.staff_signatures;
CREATE TRIGGER trg_block_signature_mutation
BEFORE UPDATE OR DELETE ON public.staff_signatures
FOR EACH ROW EXECUTE FUNCTION public.block_signature_mutation();

DROP TRIGGER IF EXISTS trg_block_deactivation_mutation ON public.staff_deactivations;
CREATE TRIGGER trg_block_deactivation_mutation
BEFORE UPDATE OR DELETE ON public.staff_deactivations
FOR EACH ROW EXECUTE FUNCTION public.block_signature_mutation();

-- ============ MRZ scans ============
CREATE TABLE IF NOT EXISTS public.staff_mrz_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type text,
  document_number text,
  issuing_country text,
  surname text,
  given_names text,
  sex text,
  date_of_birth date,
  expiry_date date,
  nationality text,
  raw_mrz text NOT NULL,
  checksum_valid boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  applied boolean NOT NULL DEFAULT false,
  scanned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_mrz_profile ON public.staff_mrz_scans(profile_id, created_at DESC);
GRANT SELECT, INSERT ON public.staff_mrz_scans TO authenticated;
GRANT ALL ON public.staff_mrz_scans TO service_role;
ALTER TABLE public.staff_mrz_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_mrz_read" ON public.staff_mrz_scans;
CREATE POLICY "staff_mrz_read" ON public.staff_mrz_scans
  FOR SELECT TO authenticated
  USING (scanned_by = auth.uid() OR public.has_role(auth.uid(), 'admin')
         OR (profile_id IS NOT NULL AND public.can_access_staff_profile(auth.uid(), profile_id)));
DROP POLICY IF EXISTS "staff_mrz_insert" ON public.staff_mrz_scans;
CREATE POLICY "staff_mrz_insert" ON public.staff_mrz_scans
  FOR INSERT TO authenticated WITH CHECK (scanned_by = auth.uid());

-- ============ Ghana Card verifications ============
CREATE TABLE IF NOT EXISTS public.ghana_card_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ghana_card_number text,
  recorded_dob date,
  status text NOT NULL DEFAULT 'pending',
  method text NOT NULL DEFAULT 'manual_sighting',
  note text,
  requested_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ghana_card_ver_profile ON public.ghana_card_verifications(profile_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.ghana_card_verifications TO authenticated;
GRANT ALL ON public.ghana_card_verifications TO service_role;
ALTER TABLE public.ghana_card_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ghana_card_ver_read" ON public.ghana_card_verifications;
CREATE POLICY "ghana_card_ver_read" ON public.ghana_card_verifications
  FOR SELECT TO authenticated USING (public.can_access_staff_profile(auth.uid(), profile_id));
DROP POLICY IF EXISTS "ghana_card_ver_insert" ON public.ghana_card_verifications;
CREATE POLICY "ghana_card_ver_insert" ON public.ghana_card_verifications
  FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid() AND public.can_access_staff_profile(auth.uid(), profile_id));
DROP POLICY IF EXISTS "ghana_card_ver_update" ON public.ghana_card_verifications;
CREATE POLICY "ghana_card_ver_update" ON public.ghana_card_verifications
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.can_manage_command_tier(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.can_manage_command_tier(auth.uid()));

-- ============ shared workflow transitions ============
CREATE TABLE IF NOT EXISTS public.workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  note text,
  signature_id uuid REFERENCES public.staff_signatures(id) ON DELETE SET NULL,
  performed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_entity ON public.workflow_transitions(entity_type, entity_id, created_at DESC);
GRANT SELECT, INSERT ON public.workflow_transitions TO authenticated;
GRANT ALL ON public.workflow_transitions TO service_role;
ALTER TABLE public.workflow_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflow_transitions_read" ON public.workflow_transitions;
CREATE POLICY "workflow_transitions_read" ON public.workflow_transitions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "workflow_transitions_insert" ON public.workflow_transitions;
CREATE POLICY "workflow_transitions_insert" ON public.workflow_transitions
  FOR INSERT TO authenticated WITH CHECK (performed_by = auth.uid());
DROP TRIGGER IF EXISTS trg_block_workflow_mutation ON public.workflow_transitions;
CREATE TRIGGER trg_block_workflow_mutation
BEFORE UPDATE OR DELETE ON public.workflow_transitions
FOR EACH ROW EXECUTE FUNCTION public.block_signature_mutation();
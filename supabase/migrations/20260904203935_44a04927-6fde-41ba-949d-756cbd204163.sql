-- ============ A. profiles: additional bio-data columns ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS other_names text,
  ADD COLUMN IF NOT EXISTS place_of_birth text,
  ADD COLUMN IF NOT EXISTS hometown text,
  ADD COLUMN IF NOT EXISTS region_of_origin text,
  ADD COLUMN IF NOT EXISTS is_number text,
  ADD COLUMN IF NOT EXISTS date_of_appointment date,
  ADD COLUMN IF NOT EXISTS cadet_intake text,
  ADD COLUMN IF NOT EXISTS recruit_intake text,
  ADD COLUMN IF NOT EXISTS current_place_of_stay text,
  ADD COLUMN IF NOT EXISTS residential_address text,
  ADD COLUMN IF NOT EXISTS digital_address text,
  ADD COLUMN IF NOT EXISTS postal_address text,
  ADD COLUMN IF NOT EXISTS residential_phone text,
  ADD COLUMN IF NOT EXISTS height_cm numeric,
  ADD COLUMN IF NOT EXISTS uniform_size text,
  ADD COLUMN IF NOT EXISTS shoe_size text,
  ADD COLUMN IF NOT EXISTS religion text,
  ADD COLUMN IF NOT EXISTS hobbies text[],
  ADD COLUMN IF NOT EXISTS special_skills text[],
  ADD COLUMN IF NOT EXISTS service_organization text,
  ADD COLUMN IF NOT EXISTS sector_command text,
  ADD COLUMN IF NOT EXISTS station_unit text,
  ADD COLUMN IF NOT EXISTS form_completed_on date,
  ADD COLUMN IF NOT EXISTS number_of_children integer,
  ADD COLUMN IF NOT EXISTS previous_last_position text,
  ADD COLUMN IF NOT EXISTS previous_reason_for_leaving text;

-- ============ helper: who may view / edit bio-data ============
CREATE OR REPLACE FUNCTION public.biodata_can_view(_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_access_staff_profile(auth.uid(), _profile_id)
$$;

CREATE OR REPLACE FUNCTION public.biodata_can_edit(_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_command_tier(auth.uid())
     OR public.has_command_capability(auth.uid(), 'staff_admin')
     OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _profile_id AND p.user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.biodata_can_view_restricted(_profile_id uuid, _kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
     OR public.has_command_capability(auth.uid(), 'staff_admin')
     OR (_kind = 'medical' AND public.has_role(auth.uid(), 'medical_officer'))
     OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _profile_id AND p.user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.biodata_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- ============ F. Education ============
CREATE TABLE IF NOT EXISTS public.staff_education (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 1,
  institution text NOT NULL,
  from_date text,
  to_date text,
  qualification text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_education TO authenticated;
GRANT ALL ON public.staff_education TO service_role;
ALTER TABLE public.staff_education ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_education_read" ON public.staff_education FOR SELECT TO authenticated USING (public.biodata_can_view(profile_id));
CREATE POLICY "staff_education_write" ON public.staff_education FOR ALL TO authenticated USING (public.biodata_can_edit(profile_id)) WITH CHECK (public.biodata_can_edit(profile_id));
CREATE TRIGGER staff_education_updated_at BEFORE UPDATE ON public.staff_education FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ G. Employment history ============
CREATE TABLE IF NOT EXISTS public.staff_employment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 1,
  employer text NOT NULL,
  position_held text,
  from_date text,
  to_date text,
  reason_for_leaving text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_employment_history TO authenticated;
GRANT ALL ON public.staff_employment_history TO service_role;
ALTER TABLE public.staff_employment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_employment_read" ON public.staff_employment_history FOR SELECT TO authenticated USING (public.biodata_can_view(profile_id));
CREATE POLICY "staff_employment_write" ON public.staff_employment_history FOR ALL TO authenticated USING (public.biodata_can_edit(profile_id)) WITH CHECK (public.biodata_can_edit(profile_id));
CREATE TRIGGER staff_employment_updated_at BEFORE UPDATE ON public.staff_employment_history FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ H. Family details ============
CREATE TABLE IF NOT EXISTS public.staff_family_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  spouse_name text,
  spouse_phone text,
  spouse_address text,
  nok_name text,
  nok_relationship text,
  nok_phone text,
  nok_address text,
  father_name text,
  father_phone text,
  mother_name text,
  mother_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_family_details TO authenticated;
GRANT ALL ON public.staff_family_details TO service_role;
ALTER TABLE public.staff_family_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_family_read" ON public.staff_family_details FOR SELECT TO authenticated USING (public.biodata_can_view(profile_id));
CREATE POLICY "staff_family_write" ON public.staff_family_details FOR ALL TO authenticated USING (public.biodata_can_edit(profile_id)) WITH CHECK (public.biodata_can_edit(profile_id));
CREATE TRIGGER staff_family_updated_at BEFORE UPDATE ON public.staff_family_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ H. Emergency contacts ============
CREATE TABLE IF NOT EXISTS public.staff_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  relationship text,
  phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_emergency_contacts TO authenticated;
GRANT ALL ON public.staff_emergency_contacts TO service_role;
ALTER TABLE public.staff_emergency_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_emergency_read" ON public.staff_emergency_contacts FOR SELECT TO authenticated USING (public.biodata_can_view(profile_id));
CREATE POLICY "staff_emergency_write" ON public.staff_emergency_contacts FOR ALL TO authenticated USING (public.biodata_can_edit(profile_id)) WITH CHECK (public.biodata_can_edit(profile_id));
CREATE TRIGGER staff_emergency_updated_at BEFORE UPDATE ON public.staff_emergency_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ E. Medical & welfare (restricted) ============
CREATE TABLE IF NOT EXISTS public.staff_medical_welfare (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  medical_conditions text,
  welfare_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_medical_welfare TO authenticated;
GRANT ALL ON public.staff_medical_welfare TO service_role;
ALTER TABLE public.staff_medical_welfare ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_medical_welfare_read" ON public.staff_medical_welfare FOR SELECT TO authenticated USING (public.biodata_can_view_restricted(profile_id, 'medical'));
CREATE POLICY "staff_medical_welfare_write" ON public.staff_medical_welfare FOR ALL TO authenticated USING (public.biodata_can_view_restricted(profile_id, 'medical')) WITH CHECK (public.biodata_can_view_restricted(profile_id, 'medical'));
CREATE TRIGGER staff_medical_welfare_updated_at BEFORE UPDATE ON public.staff_medical_welfare FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ I. Bank / salary (restricted) ============
CREATE TABLE IF NOT EXISTS public.staff_bank_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  bank_name text,
  branch text,
  account_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_bank_details TO authenticated;
GRANT ALL ON public.staff_bank_details TO service_role;
ALTER TABLE public.staff_bank_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_bank_details_read" ON public.staff_bank_details FOR SELECT TO authenticated USING (public.biodata_can_view_restricted(profile_id, 'bank'));
CREATE POLICY "staff_bank_details_write" ON public.staff_bank_details FOR ALL TO authenticated USING (public.biodata_can_view_restricted(profile_id, 'bank')) WITH CHECK (public.biodata_can_view_restricted(profile_id, 'bank'));
CREATE TRIGGER staff_bank_details_updated_at BEFORE UPDATE ON public.staff_bank_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ K & L. Declaration and verification ============
CREATE TABLE IF NOT EXISTS public.staff_biodata_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('declaration','checked','verified','approved')),
  name text,
  rank_position text,
  signature text,
  signed_on date,
  acted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_biodata_verifications TO authenticated;
GRANT ALL ON public.staff_biodata_verifications TO service_role;
ALTER TABLE public.staff_biodata_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_biodata_verify_read" ON public.staff_biodata_verifications FOR SELECT TO authenticated USING (public.biodata_can_view(profile_id));
CREATE POLICY "staff_biodata_verify_write" ON public.staff_biodata_verifications FOR ALL TO authenticated USING (public.biodata_can_edit(profile_id)) WITH CHECK (public.biodata_can_edit(profile_id));
CREATE TRIGGER staff_biodata_verify_updated_at BEFORE UPDATE ON public.staff_biodata_verifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Admin-configurable option sets ============
CREATE TABLE IF NOT EXISTS public.biodata_option_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.biodata_option_sets TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.biodata_option_sets TO authenticated;
GRANT ALL ON public.biodata_option_sets TO service_role;
ALTER TABLE public.biodata_option_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "biodata_option_sets_read" ON public.biodata_option_sets FOR SELECT TO authenticated USING (true);
CREATE POLICY "biodata_option_sets_admin" ON public.biodata_option_sets FOR ALL TO authenticated USING (public.biodata_is_admin()) WITH CHECK (public.biodata_is_admin());
CREATE TRIGGER biodata_option_sets_updated_at BEFORE UPDATE ON public.biodata_option_sets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.biodata_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.biodata_option_sets(id) ON DELETE CASCADE,
  value text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (set_id, value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.biodata_options TO authenticated;
GRANT ALL ON public.biodata_options TO service_role;
ALTER TABLE public.biodata_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "biodata_options_read" ON public.biodata_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "biodata_options_admin" ON public.biodata_options FOR ALL TO authenticated USING (public.biodata_is_admin()) WITH CHECK (public.biodata_is_admin());
CREATE TRIGGER biodata_options_updated_at BEFORE UPDATE ON public.biodata_options FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Admin-configurable extra fields ============
CREATE TABLE IF NOT EXISTS public.biodata_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','date','select','boolean','textarea')),
  option_set_id uuid REFERENCES public.biodata_option_sets(id) ON DELETE SET NULL,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.biodata_custom_fields TO authenticated;
GRANT ALL ON public.biodata_custom_fields TO service_role;
ALTER TABLE public.biodata_custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "biodata_custom_fields_read" ON public.biodata_custom_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "biodata_custom_fields_admin" ON public.biodata_custom_fields FOR ALL TO authenticated USING (public.biodata_is_admin()) WITH CHECK (public.biodata_is_admin());
CREATE TRIGGER biodata_custom_fields_updated_at BEFORE UPDATE ON public.biodata_custom_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.biodata_custom_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.biodata_custom_tables TO authenticated;
GRANT ALL ON public.biodata_custom_tables TO service_role;
ALTER TABLE public.biodata_custom_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "biodata_custom_tables_read" ON public.biodata_custom_tables FOR SELECT TO authenticated USING (true);
CREATE POLICY "biodata_custom_tables_admin" ON public.biodata_custom_tables FOR ALL TO authenticated USING (public.biodata_is_admin()) WITH CHECK (public.biodata_is_admin());
CREATE TRIGGER biodata_custom_tables_updated_at BEFORE UPDATE ON public.biodata_custom_tables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.biodata_custom_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.biodata_custom_tables(id) ON DELETE CASCADE,
  label text NOT NULL,
  column_type text NOT NULL DEFAULT 'text' CHECK (column_type IN ('text','number','date','select','boolean')),
  option_set_id uuid REFERENCES public.biodata_option_sets(id) ON DELETE SET NULL,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.biodata_custom_columns TO authenticated;
GRANT ALL ON public.biodata_custom_columns TO service_role;
ALTER TABLE public.biodata_custom_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "biodata_custom_columns_read" ON public.biodata_custom_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY "biodata_custom_columns_admin" ON public.biodata_custom_columns FOR ALL TO authenticated USING (public.biodata_is_admin()) WITH CHECK (public.biodata_is_admin());
CREATE TRIGGER biodata_custom_columns_updated_at BEFORE UPDATE ON public.biodata_custom_columns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Values captured for admin-defined structures ============
CREATE TABLE IF NOT EXISTS public.biodata_custom_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.biodata_custom_fields(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, field_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.biodata_custom_values TO authenticated;
GRANT ALL ON public.biodata_custom_values TO service_role;
ALTER TABLE public.biodata_custom_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "biodata_custom_values_read" ON public.biodata_custom_values FOR SELECT TO authenticated USING (public.biodata_can_view(profile_id));
CREATE POLICY "biodata_custom_values_write" ON public.biodata_custom_values FOR ALL TO authenticated USING (public.biodata_can_edit(profile_id)) WITH CHECK (public.biodata_can_edit(profile_id));
CREATE TRIGGER biodata_custom_values_updated_at BEFORE UPDATE ON public.biodata_custom_values FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.biodata_custom_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.biodata_custom_tables(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 1,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.biodata_custom_rows TO authenticated;
GRANT ALL ON public.biodata_custom_rows TO service_role;
ALTER TABLE public.biodata_custom_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "biodata_custom_rows_read" ON public.biodata_custom_rows FOR SELECT TO authenticated USING (public.biodata_can_view(profile_id));
CREATE POLICY "biodata_custom_rows_write" ON public.biodata_custom_rows FOR ALL TO authenticated USING (public.biodata_can_edit(profile_id)) WITH CHECK (public.biodata_can_edit(profile_id));
CREATE TRIGGER biodata_custom_rows_updated_at BEFORE UPDATE ON public.biodata_custom_rows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Seed the default option lists ============
INSERT INTO public.biodata_option_sets (key, label, description) VALUES
  ('region_of_origin','Regions of origin','Ghana regions offered for region of origin'),
  ('religion','Religions','Religion options'),
  ('uniform_size','Uniform sizes','Uniform size options'),
  ('relationship','Relationships','Next of kin / emergency contact relationships'),
  ('bank','Banks','Banks offered in the salary section'),
  ('qualification','Qualifications','Educational qualifications'),
  ('reason_for_leaving','Reasons for leaving','Reasons for leaving previous employment')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.biodata_options (set_id, value, label, sort_order)
SELECT s.id, v.value, v.value, v.ord
FROM public.biodata_option_sets s
JOIN (VALUES
  ('region_of_origin','Ahafo',1),('region_of_origin','Ashanti',2),('region_of_origin','Bono',3),
  ('region_of_origin','Bono East',4),('region_of_origin','Central',5),('region_of_origin','Eastern',6),
  ('region_of_origin','Greater Accra',7),('region_of_origin','North East',8),('region_of_origin','Northern',9),
  ('region_of_origin','Oti',10),('region_of_origin','Savannah',11),('region_of_origin','Upper East',12),
  ('region_of_origin','Upper West',13),('region_of_origin','Volta',14),('region_of_origin','Western',15),
  ('region_of_origin','Western North',16),
  ('religion','Christianity',1),('religion','Islam',2),('religion','Traditional',3),('religion','Other',4),
  ('uniform_size','S',1),('uniform_size','M',2),('uniform_size','L',3),('uniform_size','XL',4),('uniform_size','XXL',5),
  ('relationship','Spouse',1),('relationship','Father',2),('relationship','Mother',3),('relationship','Brother',4),
  ('relationship','Sister',5),('relationship','Son',6),('relationship','Daughter',7),('relationship','Guardian',8),
  ('relationship','Friend',9),('relationship','Other',10),
  ('bank','GCB Bank',1),('bank','Ecobank Ghana',2),('bank','Absa Bank Ghana',3),('bank','Standard Chartered',4),
  ('bank','Fidelity Bank',5),('bank','CalBank',6),('bank','Agricultural Development Bank',7),
  ('bank','National Investment Bank',8),('bank','Consolidated Bank Ghana',9),('bank','Zenith Bank',10),
  ('bank','Stanbic Bank',11),('bank','Republic Bank',12),('bank','Access Bank',13),('bank','Universal Merchant Bank',14),
  ('bank','Prudential Bank',15),('bank','Societe Generale Ghana',16),('bank','Bank of Africa',17),('bank','Other',18),
  ('qualification','BECE',1),('qualification','WASSCE / SSSCE',2),('qualification','Certificate',3),
  ('qualification','Diploma',4),('qualification','HND',5),('qualification','Bachelor''s Degree',6),
  ('qualification','Master''s Degree',7),('qualification','PhD',8),('qualification','Professional Certificate',9),
  ('reason_for_leaving','Resignation',1),('reason_for_leaving','End of contract',2),('reason_for_leaving','Further studies',3),
  ('reason_for_leaving','Better opportunity',4),('reason_for_leaving','Redundancy',5),('reason_for_leaving','Other',6)
) AS v(set_key, value, ord) ON v.set_key = s.key
ON CONFLICT (set_id, value) DO NOTHING;
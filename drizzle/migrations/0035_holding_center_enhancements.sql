ALTER TABLE public.detention_records ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS health_status text, ADD COLUMN IF NOT EXISTS mugshot_url text, ADD COLUMN IF NOT EXISTS repatriated_at timestamptz;
ALTER TABLE public.detention_bail_records ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TABLE public.offence_catalogue (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, approved boolean NOT NULL DEFAULT true, created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.offence_catalogue TO authenticated; GRANT ALL ON public.offence_catalogue TO service_role;
ALTER TABLE public.offence_catalogue ENABLE ROW LEVEL SECURITY;
CREATE POLICY oc_read ON public.offence_catalogue FOR SELECT TO authenticated USING (public.can_access_detention(auth.uid()));
CREATE POLICY oc_add ON public.offence_catalogue FOR INSERT TO authenticated WITH CHECK (public.can_access_detention(auth.uid()) AND (approved = false OR public.has_role(auth.uid(),'admin')));
CREATE POLICY oc_admin ON public.offence_catalogue FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
INSERT INTO public.offence_catalogue(name) VALUES ('Illegal entry'),('Overstay'),('Document fraud'),('Human smuggling'),('Human trafficking'),('Forged passport'),('Forged visa'),('Working without permit'),('Harbouring illegal immigrant'),('Impersonation'),('Drug trafficking'),('Assault on officer') ON CONFLICT DO NOTHING;

CREATE TABLE public.suspect_offences (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), detention_id uuid NOT NULL REFERENCES public.detention_records(id) ON DELETE CASCADE, offence text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(detention_id, offence));
CREATE TABLE public.detention_sureties (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bail_id uuid NOT NULL REFERENCES public.detention_bail_records(id) ON DELETE CASCADE, full_name text NOT NULL, relationship text, id_type text, id_number text, phone text, address text, occupation text, photo_path text, scan_status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.suspect_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), detention_id uuid NOT NULL REFERENCES public.detention_records(id) ON DELETE CASCADE, kind text NOT NULL DEFAULT 'document', file_path text NOT NULL, file_name text, scan_status text NOT NULL DEFAULT 'pending', uploaded_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.repatriation_details (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), detention_id uuid NOT NULL UNIQUE REFERENCES public.detention_records(id) ON DELETE CASCADE, vehicles text[] NOT NULL DEFAULT '{}', weapons text[] NOT NULL DEFAULT '{}', officer_ids uuid[] NOT NULL DEFAULT '{}', officer_count integer GENERATED ALWAYS AS (cardinality(officer_ids)) STORED, destination text, notes text, created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.approval_chain_config (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow text NOT NULL CHECK (workflow IN ('bail','repatriation')), tier smallint NOT NULL CHECK (tier BETWEEN 1 AND 3), label text NOT NULL, role public.app_role NOT NULL, UNIQUE(workflow, tier));
INSERT INTO public.approval_chain_config(workflow,tier,label,role) VALUES ('bail',1,'Recommender','supervisor'),('bail',2,'Reviewer','2ic'),('bail',3,'Command Approver','oic'),('repatriation',1,'Recommender','supervisor'),('repatriation',2,'Reviewer','2ic'),('repatriation',3,'Command Approver','oic');
CREATE TABLE public.approval_recommendations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow text NOT NULL CHECK (workflow IN ('bail','repatriation')), record_id uuid NOT NULL, tier smallint NOT NULL CHECK (tier BETWEEN 1 AND 3), decision text NOT NULL CHECK (decision IN ('recommend','not_recommend','approve','reject')), comments text, signer_id uuid NOT NULL DEFAULT auth.uid(), signer_name text NOT NULL, signature_hash text NOT NULL, signed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workflow, record_id, tier));

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['suspect_offences','detention_sureties','suspect_documents','repatriation_details'] LOOP
 EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated; GRANT ALL ON public.%I TO service_role; ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY; CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_access_detention(auth.uid())) WITH CHECK (public.can_access_detention(auth.uid()));', t,t,t,t||'_rw',t);
END LOOP; END $$;
GRANT SELECT ON public.approval_chain_config TO authenticated; GRANT INSERT, UPDATE, DELETE ON public.approval_chain_config TO authenticated; GRANT ALL ON public.approval_chain_config TO service_role;
ALTER TABLE public.approval_chain_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY acc_read ON public.approval_chain_config FOR SELECT TO authenticated USING (true);
CREATE POLICY acc_admin ON public.approval_chain_config FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.approval_recommendations TO authenticated; GRANT ALL ON public.approval_recommendations TO service_role;
ALTER TABLE public.approval_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar_read ON public.approval_recommendations FOR SELECT TO authenticated USING (public.can_access_detention(auth.uid()));

CREATE OR REPLACE FUNCTION public.sign_approval(_workflow text, _record_id uuid, _tier smallint, _decision text, _comments text, _signer_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _role app_role; _id uuid;
BEGIN
  SELECT role INTO _role FROM approval_chain_config WHERE workflow=_workflow AND tier=_tier;
  IF _role IS NULL THEN RAISE EXCEPTION 'No approval tier configured'; END IF;
  IF NOT (has_role(auth.uid(), _role) OR has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Not authorised for this tier'; END IF;
  IF _tier > 1 AND NOT EXISTS (SELECT 1 FROM approval_recommendations WHERE workflow=_workflow AND record_id=_record_id AND tier=_tier-1) THEN RAISE EXCEPTION 'Previous tier must sign first'; END IF;
  IF _tier = 3 AND _decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Final tier must approve or reject'; END IF;
  IF _tier < 3 AND _decision NOT IN ('recommend','not_recommend') THEN RAISE EXCEPTION 'Only the Command makes the final decision'; END IF;
  IF coalesce(trim(_signer_name),'') = '' THEN RAISE EXCEPTION 'Signature name required'; END IF;
  INSERT INTO approval_recommendations(workflow,record_id,tier,decision,comments,signer_id,signer_name,signature_hash)
  VALUES (_workflow,_record_id,_tier,_decision,_comments,auth.uid(),trim(_signer_name),
    encode(extensions.digest(_workflow||_record_id||_tier||_decision||coalesce(_comments,'')||auth.uid()||now()::text,'sha256'),'hex'))
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sign_approval(text,uuid,smallint,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sign_approval(text,uuid,smallint,text,text,text) TO authenticated;
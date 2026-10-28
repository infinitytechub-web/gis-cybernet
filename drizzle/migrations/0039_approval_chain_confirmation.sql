ALTER TABLE public.approval_chain_config ADD COLUMN IF NOT EXISTS configured_by uuid, ADD COLUMN IF NOT EXISTS configured_at timestamptz;
CREATE OR REPLACE FUNCTION public.stamp_approval_chain() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.configured_by := auth.uid(); NEW.configured_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_stamp_approval_chain BEFORE INSERT OR UPDATE ON public.approval_chain_config FOR EACH ROW EXECUTE FUNCTION public.stamp_approval_chain();
UPDATE public.approval_chain_config SET configured_at = NULL, configured_by = NULL;
CREATE OR REPLACE FUNCTION public.sign_approval(_workflow text, _record_id uuid, _tier smallint, _decision text, _comments text, _signer_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _role app_role; _conf timestamptz; _id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM approval_chain_config WHERE workflow=_workflow AND configured_at IS NULL) OR (SELECT count(*) FROM approval_chain_config WHERE workflow=_workflow) <> 3 THEN
    RAISE EXCEPTION 'The chain of command has not been confirmed by a Super Admin yet'; END IF;
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
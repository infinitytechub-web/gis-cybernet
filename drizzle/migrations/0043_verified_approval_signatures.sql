CREATE OR REPLACE FUNCTION public.sign_approval(_workflow text, _record_id uuid, _tier smallint, _decision text, _comments text, _signer_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _role app_role; _id uuid; _name text; _password_at numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before signing' USING ERRCODE='42501'; END IF;
 SELECT max((a->>'timestamp')::numeric) INTO _password_at FROM jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a WHERE a->>'method'='password';
 IF _password_at IS NULL OR _password_at < extract(epoch FROM now())-300 OR _password_at > extract(epoch FROM now())+30 THEN RAISE EXCEPTION 'Verify your password again before signing' USING ERRCODE='42501'; END IF;
 IF NOT public.can_access_detention(auth.uid()) THEN RAISE EXCEPTION 'Holding Center access required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.detention_records WHERE id=_record_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active custody record not found'; END IF;
 PERFORM 1 FROM public.approval_chain_config WHERE workflow=_workflow ORDER BY tier FOR SHARE;
 IF EXISTS(SELECT 1 FROM public.approval_chain_config WHERE workflow=_workflow AND configured_at IS NULL) OR (SELECT count(*) FROM public.approval_chain_config WHERE workflow=_workflow)<>3 THEN RAISE EXCEPTION 'Super Admin must confirm the approval chain'; END IF;
 SELECT role INTO _role FROM public.approval_chain_config WHERE workflow=_workflow AND tier=_tier;
 IF _role IS NULL OR NOT (public.has_role(auth.uid(),_role) OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Not authorised for this tier' USING ERRCODE='42501'; END IF;
 IF _tier>1 AND (SELECT count(*) FROM public.approval_recommendations WHERE workflow=_workflow AND record_id=_record_id AND tier<_tier) <> _tier-1 THEN RAISE EXCEPTION 'Previous tiers must sign first'; END IF;
 IF _decision IS NULL OR (_tier=3 AND _decision NOT IN ('approve','reject')) OR (_tier<3 AND _decision NOT IN ('recommend','not_recommend')) THEN RAISE EXCEPTION 'Invalid decision for this tier'; END IF;
 SELECT nullif(btrim(coalesce(first_name,'')||' '||coalesce(last_name,'')),'') INTO _name FROM public.profiles WHERE user_id=auth.uid() AND deleted_at IS NULL;
 IF _name IS NULL THEN RAISE EXCEPTION 'A registered staff name is required'; END IF;
 INSERT INTO public.approval_recommendations(workflow,record_id,tier,decision,comments,signer_id,signer_name,signature_hash,signed_at)
 VALUES(_workflow,_record_id,_tier,_decision,_comments,auth.uid(),_name,encode(extensions.digest(_workflow||_record_id||_tier||_decision||coalesce(_comments,'')||auth.uid()||_name||now()::text,'sha256'),'hex'),now()) RETURNING id INTO _id;
 RETURN _id;
END; $$;
COMMENT ON FUNCTION public.sign_approval(text,uuid,smallint,text,text,text) IS 'Requires fresh password verification; signer name is derived from profiles, never the deprecated _signer_name argument.';
REVOKE ALL ON FUNCTION public.sign_approval(text,uuid,smallint,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sign_approval(text,uuid,smallint,text,text,text) TO authenticated;
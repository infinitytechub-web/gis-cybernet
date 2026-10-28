CREATE OR REPLACE FUNCTION public.save_approval_chain(_tiers jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only Super Admins may change signing authority' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_tiers) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'All six approval tiers are required'; END IF;
 IF jsonb_array_length(_tiers) <> 6 THEN RAISE EXCEPTION 'All six approval tiers are required'; END IF;
 PERFORM 1 FROM public.approval_chain_config ORDER BY workflow,tier FOR UPDATE;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(_tiers)) <> 6 OR (SELECT count(*) FROM public.approval_chain_config c JOIN jsonb_array_elements(_tiers) j ON c.id::text=j.value->>'id') <> 6 THEN RAISE EXCEPTION 'Invalid approval tiers'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_tiers) LOOP
  IF length(trim(coalesce(item->>'label',''))) NOT BETWEEN 1 AND 100 OR NOT EXISTS(SELECT 1 FROM unnest(enum_range(NULL::public.app_role)) r WHERE r::text=item->>'role') THEN RAISE EXCEPTION 'Each tier requires a valid signing role and label'; END IF;
  UPDATE public.approval_chain_config SET label=trim(item->>'label'), role=(item->>'role')::public.app_role WHERE id=(item->>'id')::uuid;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.save_approval_chain(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_approval_chain(jsonb) TO authenticated, service_role;
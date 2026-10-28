CREATE OR REPLACE FUNCTION public.stamp_approval_chain() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN IF auth.uid() IS NOT NULL THEN NEW.configured_by := auth.uid(); NEW.configured_at := now(); END IF; RETURN NEW; END $$;
UPDATE public.approval_chain_config SET configured_at = NULL, configured_by = NULL WHERE configured_by IS NULL;
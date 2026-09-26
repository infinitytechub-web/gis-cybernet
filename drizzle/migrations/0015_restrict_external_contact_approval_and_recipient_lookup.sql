REVOKE UPDATE ON public.interlink_contacts FROM authenticated;
GRANT UPDATE (display_name, command_or_unit, email, scope, notes) ON public.interlink_contacts TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_external_contact_approval_on_email_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF lower(btrim(NEW.email)) IS DISTINCT FROM lower(btrim(OLD.email)) THEN
    NEW.approved := false;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.approval_note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reset_external_contact_approval
BEFORE UPDATE OF email ON public.interlink_contacts
FOR EACH ROW EXECUTE FUNCTION public.reset_external_contact_approval_on_email_change();

CREATE OR REPLACE FUNCTION public.approved_record_email_recipients()
RETURNS TABLE (id uuid, display_name text, email text, recipient_type text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'oic'::public.app_role)
    OR public.has_role(auth.uid(), '2ic'::public.app_role)
    OR public.has_role(auth.uid(), 'staff_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR public.has_role(auth.uid(), 'front_desk'::public.app_role)
    OR public.has_role(auth.uid(), 'processing'::public.app_role)
    OR public.has_role(auth.uid(), 'enforcement'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Record email access denied';
  END IF;

  RETURN QUERY
  SELECT c.id, c.display_name, c.email, 'approved_external'::text
  FROM public.interlink_contacts c
  WHERE c.approved = true
  ORDER BY c.display_name, c.email;
END;
$$;

REVOKE ALL ON FUNCTION public.approved_record_email_recipients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approved_record_email_recipients() TO authenticated, service_role;
ALTER TABLE public.interlink_contacts
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_note text;

COMMENT ON COLUMN public.interlink_contacts.approved IS 'Whether this external email address is approved for record delivery.';
COMMENT ON COLUMN public.interlink_contacts.approved_by IS 'Administrator who last approved this external contact.';
COMMENT ON COLUMN public.interlink_contacts.approved_at IS 'Time this external contact was last approved.';

UPDATE public.interlink_contacts
SET approved = true,
    approved_at = COALESCE(updated_at, created_at)
WHERE approved = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interlink_contacts TO authenticated;
GRANT ALL ON public.interlink_contacts TO service_role;

DROP POLICY IF EXISTS "Command tier writes interlink contacts" ON public.interlink_contacts;
DROP POLICY IF EXISTS "Command tier updates interlink contacts" ON public.interlink_contacts;

CREATE POLICY "Command tier proposes interlink contacts"
ON public.interlink_contacts
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND approved = false
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'oic'::public.app_role)
    OR public.has_role(auth.uid(), '2ic'::public.app_role)
    OR public.has_role(auth.uid(), 'staff_officer'::public.app_role)
  )
);

CREATE POLICY "Admins update interlink contacts"
ON public.interlink_contacts
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.set_interlink_contact_approval(
  _contact_id uuid,
  _approved boolean,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _contact public.interlink_contacts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT * INTO _contact
  FROM public.interlink_contacts
  WHERE id = _contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'External contact not found';
  END IF;

  UPDATE public.interlink_contacts
  SET approved = _approved,
      approved_by = CASE WHEN _approved THEN auth.uid() ELSE NULL END,
      approved_at = CASE WHEN _approved THEN now() ELSE NULL END,
      approval_note = NULLIF(left(trim(COALESCE(_note, '')), 500), ''),
      updated_at = now()
  WHERE id = _contact_id;

  INSERT INTO public.front_desk_audit_log (
    action, entity_type, entity_id, performed_by, details
  ) VALUES (
    CASE WHEN _approved THEN 'external_email_contact_approved' ELSE 'external_email_contact_revoked' END,
    'interlink_contact',
    _contact_id::text,
    auth.uid(),
    jsonb_build_object(
      'email_domain', split_part(lower(_contact.email), '@', 2),
      'display_name', _contact.display_name,
      'note', NULLIF(left(trim(COALESCE(_note, '')), 500), '')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_interlink_contact_approval(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_interlink_contact_approval(uuid, boolean, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approved_record_email_recipients()
RETURNS TABLE (
  id uuid,
  display_name text,
  email text,
  recipient_type text
)
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
  SELECT p.id,
         trim(concat_ws(' ', p.first_name, p.last_name))::text,
         p.email,
         'staff'::text
  FROM public.profiles p
  WHERE p.email IS NOT NULL AND btrim(p.email) <> ''
  UNION ALL
  SELECT c.id,
         c.display_name,
         c.email,
         'approved_external'::text
  FROM public.interlink_contacts c
  WHERE c.approved = true
  ORDER BY 2, 3;
END;
$$;

REVOKE ALL ON FUNCTION public.approved_record_email_recipients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approved_record_email_recipients() TO authenticated, service_role;
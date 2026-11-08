CREATE TABLE public.staff_vault_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('certificate','identity','appointment','medical','training','commendation','other')),
  description text,
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_vault_files_profile_idx ON public.staff_vault_files(profile_id, created_at DESC);

CREATE TABLE public.staff_vault_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid,
  profile_id uuid NOT NULL,
  actor_user_id uuid,
  action text NOT NULL CHECK (action IN ('upload','preview','download','modify','archive','restore')),
  file_title text,
  file_name text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_vault_audit_profile_idx ON public.staff_vault_audit(profile_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.staff_vault_files TO authenticated;
GRANT SELECT ON public.staff_vault_audit TO authenticated;
GRANT ALL ON public.staff_vault_files TO service_role;
GRANT ALL ON public.staff_vault_audit TO service_role;
ALTER TABLE public.staff_vault_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_vault_audit ENABLE ROW LEVEL SECURITY;

-- Owner of a profile
CREATE OR REPLACE FUNCTION public.staff_vault_is_owner(_user_id uuid, _profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=_profile_id AND user_id=_user_id AND deleted_at IS NULL)
$$;

-- Viewer may read another officer's vault only within their own command branch,
-- with a strictly senior rank and an equal or more senior grade. Super Admin sees all.
CREATE OR REPLACE FUNCTION public.staff_vault_can_view(_user_id uuid, _profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.staff_vault_is_owner(_user_id, _profile_id)
    OR public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.profiles v
      JOIN public.ranks vr ON vr.id = v.rank_id
      JOIN public.staff_grades vg ON vg.id = v.grade_id
      JOIN public.profiles t ON t.id = _profile_id AND t.deleted_at IS NULL
      JOIN public.ranks tr ON tr.id = t.rank_id
      JOIN public.staff_grades tg ON tg.id = t.grade_id
      WHERE v.user_id = _user_id AND v.deleted_at IS NULL
        AND v.org_unit_id IS NOT NULL AND t.org_unit_id IS NOT NULL
        AND t.org_unit_id IN (SELECT public.org_unit_descendants(v.org_unit_id))
        AND vr.level > tr.level
        AND vg.sort_order <= tg.sort_order
    )
  )
$$;
REVOKE ALL ON FUNCTION public.staff_vault_is_owner(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_vault_can_view(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_vault_is_owner(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_vault_can_view(uuid,uuid) TO authenticated;

CREATE POLICY "View permitted staff vault files" ON public.staff_vault_files FOR SELECT TO authenticated
  USING (public.staff_vault_can_view(auth.uid(), profile_id));
CREATE POLICY "Officers upload to own vault" ON public.staff_vault_files FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND public.staff_vault_is_owner(auth.uid(), profile_id)
    AND split_part(file_path,'/',1) = profile_id::text AND archived_at IS NULL);
CREATE POLICY "Officers manage own vault files" ON public.staff_vault_files FOR UPDATE TO authenticated
  USING (public.staff_vault_is_owner(auth.uid(), profile_id) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.staff_vault_is_owner(auth.uid(), profile_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "View permitted staff vault audit" ON public.staff_vault_audit FOR SELECT TO authenticated
  USING (public.staff_vault_can_view(auth.uid(), profile_id));

CREATE OR REPLACE FUNCTION public.protect_staff_vault_file()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.file_path IS DISTINCT FROM OLD.file_path OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
    RAISE EXCEPTION 'Owner, storage path and uploader cannot be changed';
  END IF;
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL AND nullif(btrim(coalesce(NEW.archive_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required';
  END IF;
  IF NEW.archived_at IS NULL THEN NEW.archive_reason := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER staff_vault_files_protect BEFORE UPDATE ON public.staff_vault_files FOR EACH ROW EXECUTE FUNCTION public.protect_staff_vault_file();

CREATE OR REPLACE FUNCTION public.audit_staff_vault_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text;
BEGIN
  IF TG_OP='INSERT' THEN v:='upload';
  ELSIF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN v:='archive';
  ELSIF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN v:='restore';
  ELSE v:='modify'; END IF;
  INSERT INTO public.staff_vault_audit(file_id, profile_id, actor_user_id, action, file_title, file_name, detail)
  VALUES (NEW.id, NEW.profile_id, auth.uid(), v, NEW.title, NEW.file_name, CASE WHEN v='archive' THEN NEW.archive_reason END);
  RETURN NEW;
END $$;
CREATE TRIGGER staff_vault_files_audit AFTER INSERT OR UPDATE ON public.staff_vault_files FOR EACH ROW EXECUTE FUNCTION public.audit_staff_vault_change();

CREATE OR REPLACE FUNCTION public.block_staff_vault_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'Staff Vault audit records are immutable'; END $$;
CREATE TRIGGER staff_vault_audit_immutable BEFORE UPDATE OR DELETE ON public.staff_vault_audit FOR EACH ROW EXECUTE FUNCTION public.block_staff_vault_audit_mutation();

CREATE OR REPLACE FUNCTION public.record_staff_vault_access(_file_id uuid, _action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.staff_vault_files%ROWTYPE; a text := lower(btrim(coalesce(_action,'')));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF a NOT IN ('preview','download') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  SELECT * INTO f FROM public.staff_vault_files WHERE id=_file_id;
  IF f.id IS NULL OR NOT public.staff_vault_can_view(auth.uid(), f.profile_id) THEN RAISE EXCEPTION 'Not authorized to open this document'; END IF;
  IF f.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Archived documents cannot be opened'; END IF;
  INSERT INTO public.staff_vault_audit(file_id, profile_id, actor_user_id, action, file_title, file_name)
  VALUES (f.id, f.profile_id, auth.uid(), a, f.title, f.file_name);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_staff_vault_access(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_staff_vault_access(uuid,text) TO authenticated;

-- Officers whose vaults the caller may open (self first).
CREATE OR REPLACE FUNCTION public.staff_vault_people()
RETURNS TABLE(profile_id uuid, name text, staff_id text, rank text, grade text, unit text, is_self boolean, file_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, btrim(concat_ws(' ', t.first_name, t.last_name)), t.staff_id, r.name, g.name, u.name,
         t.user_id = auth.uid(),
         (SELECT count(*) FROM public.staff_vault_files f WHERE f.profile_id=t.id AND f.archived_at IS NULL)
  FROM public.profiles t
  LEFT JOIN public.ranks r ON r.id=t.rank_id
  LEFT JOIN public.staff_grades g ON g.id=t.grade_id
  LEFT JOIN public.org_units u ON u.id=t.org_unit_id
  WHERE auth.uid() IS NOT NULL AND t.deleted_at IS NULL AND public.staff_vault_can_view(auth.uid(), t.id)
  ORDER BY (t.user_id = auth.uid()) DESC, t.last_name, t.first_name;
$$;
REVOKE ALL ON FUNCTION public.staff_vault_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_vault_people() TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_vault_activity(_profile_id uuid)
RETURNS TABLE(id uuid, created_at timestamptz, action text, file_title text, file_name text, detail text, actor_name text, actor_staff_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.staff_vault_can_view(auth.uid(), _profile_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT a.id, a.created_at, a.action, a.file_title, a.file_name, a.detail,
    nullif(btrim(concat_ws(' ', p.first_name, p.last_name)),''), p.staff_id
  FROM public.staff_vault_audit a LEFT JOIN public.profiles p ON p.user_id=a.actor_user_id
  WHERE a.profile_id=_profile_id ORDER BY a.created_at DESC, a.id;
END $$;
REVOKE ALL ON FUNCTION public.staff_vault_activity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_vault_activity(uuid) TO authenticated;

-- Storage: officers upload only into their own profile folder; reads follow the vault rule.
CREATE POLICY "Staff vault own uploads" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='staff-vault' AND public.staff_vault_is_owner(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Staff vault permitted reads" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='staff-vault' AND EXISTS (SELECT 1 FROM public.staff_vault_files f
    WHERE f.file_path=objects.name AND f.archived_at IS NULL AND public.staff_vault_can_view(auth.uid(), f.profile_id)));
CREATE POLICY "Staff vault owner cleanup" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='staff-vault' AND public.staff_vault_is_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.staff_vault_files f WHERE f.file_path=objects.name));
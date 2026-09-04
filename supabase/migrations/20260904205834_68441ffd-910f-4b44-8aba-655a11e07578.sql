-- ── Restricted bio-data access audit trail ──────────────────────────────
CREATE TABLE public.biodata_restricted_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('medical', 'bank')),
  action text NOT NULL CHECK (action IN ('view', 'edit')),
  actor_id uuid,
  actor_label text,
  changed_fields text[],
  user_agent text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.biodata_restricted_access_log TO authenticated;
GRANT ALL ON public.biodata_restricted_access_log TO service_role;

ALTER TABLE public.biodata_restricted_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY biodata_restricted_access_log_read
  ON public.biodata_restricted_access_log
  FOR SELECT TO authenticated
  USING (public.biodata_can_view_restricted(profile_id, section));

CREATE INDEX biodata_restricted_access_log_profile_idx
  ON public.biodata_restricted_access_log (profile_id, created_at DESC);

-- Immutable: no updates or deletes from the Data API
CREATE OR REPLACE FUNCTION public.block_biodata_access_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'The restricted bio-data access log is append-only';
END;
$$;

CREATE TRIGGER biodata_restricted_access_log_immutable
  BEFORE UPDATE OR DELETE ON public.biodata_restricted_access_log
  FOR EACH ROW EXECUTE FUNCTION public.block_biodata_access_log_mutation();

-- Append-only writer: only authorised viewers of the section may log,
-- and the actor is always the caller.
CREATE OR REPLACE FUNCTION public.log_biodata_restricted_access(
  _profile_id uuid,
  _section text,
  _action text,
  _changed_fields text[] DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _section NOT IN ('medical', 'bank') OR _action NOT IN ('view', 'edit') THEN
    RAISE EXCEPTION 'Invalid section or action';
  END IF;
  IF NOT public.biodata_can_view_restricted(_profile_id, _section) THEN
    RAISE EXCEPTION 'Not authorised for this restricted section';
  END IF;

  SELECT trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) || ' (' || coalesce(p.staff_id, '—') || ')'
    INTO _label
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.biodata_restricted_access_log
    (profile_id, section, action, actor_id, actor_label, changed_fields, user_agent)
  VALUES (_profile_id, _section, _action, auth.uid(), _label, _changed_fields, left(coalesce(_user_agent, ''), 300))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_biodata_restricted_access(uuid, text, text, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_biodata_restricted_access(uuid, text, text, text[], text) TO authenticated;

-- ── Master data option sets: ranks, stations, blood groups ──────────────
INSERT INTO public.biodata_option_sets (key, label, description)
VALUES
  ('rank', 'Ranks', 'Ranks available on the bio-data form'),
  ('station', 'Stations / commands', 'Stations and commands for posting fields'),
  ('blood_group', 'Blood groups', 'Blood group values')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.biodata_options (set_id, value, label, sort_order)
SELECT s.id, v.value, v.value, v.ord
FROM public.biodata_option_sets s
CROSS JOIN (VALUES
  ('A+', 1), ('A-', 2), ('B+', 3), ('B-', 4),
  ('AB+', 5), ('AB-', 6), ('O+', 7), ('O-', 8)
) AS v(value, ord)
WHERE s.key = 'blood_group'
ON CONFLICT DO NOTHING;

-- Seed ranks and stations from existing service data
INSERT INTO public.biodata_options (set_id, value, label, sort_order)
SELECT s.id, r.name, r.name, row_number() OVER (ORDER BY r.level DESC NULLS LAST, r.name)
FROM public.biodata_option_sets s
CROSS JOIN public.ranks r
WHERE s.key = 'rank'
ON CONFLICT DO NOTHING;

INSERT INTO public.biodata_options (set_id, value, label, sort_order)
SELECT s.id, u.name, u.name, row_number() OVER (ORDER BY u.name)
FROM public.biodata_option_sets s
CROSS JOIN public.org_units u
WHERE s.key = 'station'
ON CONFLICT DO NOTHING;
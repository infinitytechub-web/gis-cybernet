CREATE TABLE public.staff_access_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id uuid NOT NULL DEFAULT auth.uid(),
  actor_profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail text NULL,
  path text NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_access_log_created_at ON public.staff_access_log (created_at DESC);
CREATE INDEX idx_staff_access_log_target ON public.staff_access_log (target_profile_id, created_at DESC);
CREATE INDEX idx_staff_access_log_actor ON public.staff_access_log (actor_user_id, created_at DESC);

GRANT SELECT, INSERT ON public.staff_access_log TO authenticated;
GRANT ALL ON public.staff_access_log TO service_role;

ALTER TABLE public.staff_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier reads staff access log"
ON public.staff_access_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
);

CREATE POLICY "Users log their own access"
ON public.staff_access_log FOR INSERT TO authenticated
WITH CHECK (actor_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.block_staff_access_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'staff_access_log entries are immutable';
END;
$$;

CREATE TRIGGER staff_access_log_immutable
BEFORE UPDATE OR DELETE ON public.staff_access_log
FOR EACH ROW EXECUTE FUNCTION public.block_staff_access_log_mutation();

CREATE OR REPLACE FUNCTION public.log_staff_access(
  _action text,
  _target_profile_id uuid DEFAULT NULL,
  _detail text DEFAULT NULL,
  _path text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _actor_profile uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _action IS NULL OR btrim(_action) = '' THEN
    RAISE EXCEPTION 'Action is required';
  END IF;

  SELECT p.id INTO _actor_profile
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.staff_access_log (
    actor_user_id, actor_profile_id, target_profile_id, action, detail, path, user_agent
  ) VALUES (
    auth.uid(), _actor_profile, _target_profile_id, lower(btrim(_action)),
    nullif(btrim(coalesce(_detail, '')), ''),
    nullif(btrim(coalesce(_path, '')), ''),
    left(nullif(btrim(coalesce(_user_agent, '')), ''), 400)
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_staff_access(text, uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_staff_access(text, uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_access_log_feed(
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to timestamptz DEFAULT now(),
  _action text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 300
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  action text,
  detail text,
  path text,
  user_agent text,
  actor_name text,
  actor_staff_id text,
  target_name text,
  target_staff_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _q text := nullif(btrim(coalesce(_search, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'oic')
    OR public.has_role(auth.uid(), '2ic')
    OR public.has_role(auth.uid(), 'staff_officer')
  ) THEN
    RAISE EXCEPTION 'Not authorised to read the staff access log';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.created_at,
    l.action,
    l.detail,
    l.path,
    l.user_agent,
    btrim(coalesce(ap.first_name, '') || ' ' || coalesce(ap.last_name, '')) AS actor_name,
    ap.staff_id AS actor_staff_id,
    btrim(coalesce(tp.first_name, '') || ' ' || coalesce(tp.last_name, '')) AS target_name,
    tp.staff_id AS target_staff_id
  FROM public.staff_access_log l
  LEFT JOIN public.profiles ap ON ap.id = l.actor_profile_id
  LEFT JOIN public.profiles tp ON tp.id = l.target_profile_id
  WHERE l.created_at >= _from
    AND l.created_at <= _to
    AND (_action IS NULL OR l.action = lower(btrim(_action)))
    AND (
      _q IS NULL
      OR btrim(coalesce(ap.first_name, '') || ' ' || coalesce(ap.last_name, '')) ILIKE '%' || _q || '%'
      OR btrim(coalesce(tp.first_name, '') || ' ' || coalesce(tp.last_name, '')) ILIKE '%' || _q || '%'
      OR coalesce(ap.staff_id, '') ILIKE '%' || _q || '%'
      OR coalesce(tp.staff_id, '') ILIKE '%' || _q || '%'
      OR coalesce(l.detail, '') ILIKE '%' || _q || '%'
    )
  ORDER BY l.created_at DESC
  LIMIT greatest(1, least(coalesce(_limit, 300), 2000));
END;
$$;

REVOKE ALL ON FUNCTION public.staff_access_log_feed(timestamptz, timestamptz, text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.staff_access_log_feed(timestamptz, timestamptz, text, text, integer) TO authenticated;
-- Private realtime authorization for the presence topic.
-- Every signed-in user must be able to join (to publish their own presence),
-- but the presence payload no longer carries identifying data; identities are
-- resolved server-side through presence_identities() with a role check.
DROP POLICY IF EXISTS "Presence channel subscribers" ON realtime.messages;
CREATE POLICY "Presence channel subscribers"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() = 'online-users-global');

DROP POLICY IF EXISTS "Presence channel publishers" ON realtime.messages;
CREATE POLICY "Presence channel publishers"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (realtime.topic() = 'online-users-global');

-- Resolve presence identities only for authorized viewers.
CREATE OR REPLACE FUNCTION public.presence_identities(_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  staff_id text,
  first_name text,
  last_name text,
  department text,
  rank text,
  photo_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_privileged := has_role(v_uid, 'admin'::app_role)
    OR is_command_tier(v_uid)
    OR has_role(v_uid, 'supervisor'::app_role)
    OR is_shift_leader_tier(v_uid);

  RETURN QUERY
  SELECT p.user_id,
         p.staff_id,
         p.first_name,
         p.last_name,
         COALESCE(d.name, '') AS department,
         COALESCE(r.name, '') AS rank,
         p.photo_url
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.ranks r ON r.id = p.rank_id
  WHERE p.user_id = ANY(_user_ids)
    AND (
      p.user_id = v_uid
      OR (
        v_privileged
        AND (
          has_role(v_uid, 'admin'::app_role)
          OR p.org_unit_id IS NULL
          OR has_org_access(p.org_unit_id)
        )
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.presence_identities(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_identities(uuid[]) TO authenticated;

CREATE TYPE public.announcement_file_audit_action AS ENUM (
  'upload', 'download', 'preview', 'permission_change', 'delete'
);

CREATE TABLE public.announcement_file_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid REFERENCES public.announcement_files(id) ON DELETE SET NULL,
  action public.announcement_file_audit_action NOT NULL,
  actor_user_id uuid,
  staff_id text,
  department_id uuid,
  department_name text,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_anf_audit_file ON public.announcement_file_audit(file_id);
CREATE INDEX idx_anf_audit_actor ON public.announcement_file_audit(actor_user_id);
CREATE INDEX idx_anf_audit_created ON public.announcement_file_audit(created_at DESC);
CREATE INDEX idx_anf_audit_action ON public.announcement_file_audit(action);

ALTER TABLE public.announcement_file_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier can view file audit"
ON public.announcement_file_audit
FOR SELECT
TO authenticated
USING (public.is_command_tier(auth.uid()));

CREATE POLICY "No direct writes to file audit"
ON public.announcement_file_audit
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.log_announcement_file_audit(
  _file_id uuid,
  _action public.announcement_file_audit_action,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_staff_id text;
  v_dept uuid;
  v_dept_name text;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT p.staff_id, p.department_id, d.name
    INTO v_staff_id, v_dept, v_dept_name
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE p.user_id = v_user
  LIMIT 1;

  INSERT INTO public.announcement_file_audit (
    file_id, action, actor_user_id, staff_id,
    department_id, department_name, ip_address, user_agent, metadata
  ) VALUES (
    _file_id, _action, v_user, v_staff_id,
    v_dept, v_dept_name, _ip, _user_agent, COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_announcement_file_audit(uuid, public.announcement_file_audit_action, text, text, jsonb) TO authenticated;

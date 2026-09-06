-- Backfill: every admin also holds command_officer
INSERT INTO public.user_roles (user_id, role)
SELECT ur.user_id, 'command_officer'::app_role
FROM public.user_roles ur
WHERE ur.role = 'admin'::app_role
ON CONFLICT (user_id, role) DO NOTHING;

-- Keep it in sync for future admin grants
CREATE OR REPLACE FUNCTION public.grant_command_officer_to_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin'::app_role THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'command_officer'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_command_officer_to_admin ON public.user_roles;
CREATE TRIGGER trg_grant_command_officer_to_admin
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.grant_command_officer_to_admin();
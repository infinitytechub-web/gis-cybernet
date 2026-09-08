-- Every role appears in the matrix; unlisted roles default to full denial.
INSERT INTO public.directory_permissions (role, level, scope)
SELECT r.role, l.level, 'none'
FROM (SELECT unnest(enum_range(NULL::app_role)) AS role) r
CROSS JOIN (VALUES ('hq'),('regional'),('sector'),('department'),('section'),('unit'),('shift')) AS l(level)
ON CONFLICT (role, level) DO NOTHING;

-- Command Officer sits in the command tier: assigned scope plus subordinates.
UPDATE public.directory_permissions
   SET scope = 'own_subtree', can_view = true, can_create = true, can_edit = true,
       can_delete = false, can_download = true, can_print = true, can_vault = true
 WHERE role = 'command_officer';
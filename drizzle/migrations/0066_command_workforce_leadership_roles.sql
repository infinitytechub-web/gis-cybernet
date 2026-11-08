DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.command_workforce_dashboard(date,integer)'::regprocedure) INTO definition;
 definition := replace(definition, 'NOT public.is_command_tier(uid)', 'NOT (public.is_command_tier(uid) OR public.has_role(uid,''head_of_administration'') OR public.has_role(uid,''chief_staff_officer''))');
 EXECUTE definition;
END
$migration$;
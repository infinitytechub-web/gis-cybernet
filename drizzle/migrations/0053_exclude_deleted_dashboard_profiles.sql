DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.command_dashboard_live(uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'WHERE p.org_unit_id IN (SELECT t.unit_id FROM unit_tree t)','WHERE p.deleted_at IS NULL AND p.org_unit_id IN (SELECT t.unit_id FROM unit_tree t)');
 definition:=replace(definition,'''photo_url'', s.photo_url,','');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.unit_dashboard(uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'WHERE p.org_unit_id = ANY(units)','WHERE p.deleted_at IS NULL AND p.org_unit_id = ANY(units)');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.command_dashboard(integer)'::regprocedure) INTO definition;
 definition:=replace(definition,'WHERE COALESCE(p.status::text, ''active'') = ''active''','WHERE p.deleted_at IS NULL AND p.status::text IN (''active'',''partially_active'')');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.admin_command_overview()'::regprocedure) INTO definition;
 definition:=replace(definition,'WHERE p.org_unit_id = u.id','WHERE p.deleted_at IS NULL AND p.org_unit_id = u.id');
 definition:=replace(definition,'WHERE p2.org_unit_id = u.id','WHERE p2.deleted_at IS NULL AND p2.org_unit_id = u.id');
 EXECUTE definition;
END $$;
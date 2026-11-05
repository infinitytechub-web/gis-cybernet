CREATE OR REPLACE FUNCTION public.staff_mapping_rows()
RETURNS TABLE(profile_id uuid,staff_id text,full_name text,rank_name text,rank_abbr text,department_name text,unit text,status text,shift_group text,photo_url text,org_unit_id uuid,org_unit_name text,station_name text,sector_name text,region_name text,latitude numeric,longitude numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH RECURSIVE chain AS (
 SELECT u.id root_id,u.id node_id,u.name node_name,u.type node_type,u.parent_id node_parent,u.latitude node_lat,u.longitude node_lng,0 depth,ARRAY[u.id] path FROM public.org_units u
 UNION ALL
 SELECT c.root_id,u.id,u.name,u.type,u.parent_id,u.latitude,u.longitude,c.depth+1,c.path||u.id FROM chain c JOIN public.org_units u ON u.id=c.node_parent WHERE NOT u.id=ANY(c.path)
), resolved AS (
 SELECT root_id,(array_agg(node_name ORDER BY depth) FILTER(WHERE node_type IN ('station','unit')))[1] r_station,
 (array_agg(node_name ORDER BY depth) FILTER(WHERE node_type='sector'))[1] r_sector,
 (array_agg(node_name ORDER BY depth) FILTER(WHERE node_type='regional'))[1] r_region,
 (array_agg(node_lat ORDER BY depth) FILTER(WHERE node_lat IS NOT NULL))[1] r_lat,
 (array_agg(node_lng ORDER BY depth) FILTER(WHERE node_lng IS NOT NULL))[1] r_lng FROM chain GROUP BY root_id
)
SELECT p.id,p.staff_id::text,trim(concat_ws(' ',p.first_name,p.last_name))::text,r.name::text,r.abbreviation::text,d.name::text,p.unit::text,p.status::text,p.shift_group::text,p.photo_url::text,p.org_unit_id,u.name::text,res.r_station::text,res.r_sector::text,res.r_region::text,coalesce(res.r_lat,cap.lat)::numeric,coalesce(res.r_lng,cap.lng)::numeric
FROM public.profiles p LEFT JOIN public.ranks r ON r.id=p.rank_id LEFT JOIN public.departments d ON d.id=p.department_id LEFT JOIN public.org_units u ON u.id=p.org_unit_id LEFT JOIN resolved res ON res.root_id=p.org_unit_id
LEFT JOIN LATERAL(SELECT g.lat,g.lng FROM public.ghana_regional_capitals g WHERE res.r_region IS NOT NULL AND replace(lower(res.r_region),' regional command','') LIKE '%'||lower(g.region)||'%' LIMIT 1) cap ON true
WHERE auth.uid() IS NOT NULL AND p.deleted_at IS NULL AND public.so_can_see_profile(auth.uid(),p.id)
 AND (public.has_role(auth.uid(),'admin') OR p.user_id=auth.uid() OR (public.has_profile_oversight_role(auth.uid()) AND public.can_access_staff_profile(auth.uid(),p.id)));
$$;
REVOKE EXECUTE ON FUNCTION public.staff_mapping_rows() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_mapping_rows() TO authenticated;
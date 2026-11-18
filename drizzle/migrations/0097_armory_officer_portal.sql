CREATE OR REPLACE FUNCTION public.armory_my_portal()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me public.profiles; res jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT * INTO me FROM public.profiles WHERE user_id=auth.uid() AND deleted_at IS NULL LIMIT 1;
 IF me.id IS NULL THEN RETURN jsonb_build_object('profile',NULL,'custody','[]'::jsonb,'inspections','[]'::jsonb,'authorizations','[]'::jsonb); END IF;
 SELECT jsonb_build_object(
  'profile', jsonb_build_object('id',me.id,'staff_id',me.staff_id,'name',trim(coalesce(me.first_name,'')||' '||coalesce(me.last_name,'')),'email',me.email,'phone',me.phone,'status',me.status,
     'rank',(SELECT name FROM public.ranks WHERE id=me.rank_id),'grade',(SELECT name FROM public.staff_grades WHERE id=me.grade_id),
     'command',(SELECT name FROM public.org_units WHERE id=me.org_unit_id)),
  'custody', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'reference',c.reference,'title',c.title,'status',c.status,'created_at',c.created_at,'updated_at',c.updated_at,'due_date',c.details->>'due_date','purpose',c.details->>'purpose',
       'weapon',jsonb_build_object('id',w.id,'serial',w.details->>'serial','model',w.details->>'model','type',w.details->>'weapon_type','condition',w.details->>'condition','status',w.status)) ORDER BY c.created_at DESC)
     FROM public.armory_records c LEFT JOIN public.armory_records w ON w.id=c.asset_id
     WHERE c.kind='custody' AND c.profile_id=me.id AND c.status<>'archived'),'[]'::jsonb),
  'inspections', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'reference',i.reference,'title',i.title,'status',i.status,'date',i.details->>'date','next_review',i.details->>'next_review','category',i.details->>'category','serial',w.details->>'serial','model',w.details->>'model') ORDER BY coalesce(i.details->>'next_review',i.details->>'date'))
     FROM public.armory_records i JOIN public.armory_records w ON w.id=i.asset_id
     WHERE i.kind='maintenance' AND i.status NOT IN ('archived','cancelled','rejected')
       AND EXISTS(SELECT 1 FROM public.armory_records c WHERE c.kind='custody' AND c.profile_id=me.id AND c.asset_id=w.id AND c.status IN ('approved','handed_over','acknowledged','discrepancy'))),'[]'::jsonb),
  'authorizations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'reference',a.reference,'title',a.title,'status',a.status,'expiry',a.details->>'expiry') ORDER BY a.created_at DESC)
     FROM public.armory_records a WHERE a.kind IN ('personnel','certification') AND a.profile_id=me.id AND a.status<>'archived'),'[]'::jsonb)
 ) INTO res;
 RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.armory_my_portal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.armory_my_portal() TO authenticated;
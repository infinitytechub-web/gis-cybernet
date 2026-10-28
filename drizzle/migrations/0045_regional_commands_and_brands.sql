ALTER TABLE public.org_units
  ADD COLUMN IF NOT EXISTS activation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS display_order integer,
  ADD COLUMN IF NOT EXISTS brand_color text;
ALTER TABLE public.org_units DROP CONSTRAINT IF EXISTS org_units_activation_status_chk;
ALTER TABLE public.org_units ADD CONSTRAINT org_units_activation_status_chk CHECK (activation_status IN ('active','pending'));

UPDATE public.org_units SET activation_status='active', display_order=1, brand_color='145 63% 30%' WHERE id='95ab6cb7-290f-45fb-ad23-32664e34dacd';
UPDATE public.org_units SET activation_status='active', display_order=10, brand_color='145 55% 35%' WHERE id='4070618a-d8ec-4fe0-9f69-4cce5b0801b6';
UPDATE public.org_units SET display_order=3, brand_color='188 70% 35%' WHERE id='06598185-42bb-4d7b-99d2-406fe2c41a91';
UPDATE public.org_units SET display_order=9, brand_color='275 50% 45%' WHERE id='85d211ab-bed3-4a4c-837e-3a180142d308';
UPDATE public.org_units SET display_order=15, brand_color='215 70% 38%' WHERE id='92c4d0d4-5261-4091-8791-97bcdfbba1e8';

INSERT INTO public.org_units (name, code, type, parent_id, is_active, activation_status, display_order, brand_color)
SELECT v.name, v.code, 'regional', '95ab6cb7-290f-45fb-ad23-32664e34dacd', true, 'pending', v.ord, v.color
FROM (VALUES
 ('Ahafo Regional Command','RC-AHAFO',2,'145 50% 40%'),
 ('Ashanti Regional Command','RC-ASHANTI',4,'275 50% 45%'),
 ('Bono Regional Command','RC-BONO',5,'40 70% 40%'),
 ('Bono East Regional Command','RC-BONOEAST',6,'340 60% 40%'),
 ('Central Regional Command','RC-CENTRAL',7,'220 70% 38%'),
 ('Central East Regional Command','RC-CENTRALEAST',8,'180 55% 35%'),
 ('North East Regional Command','RC-NORTHEAST',11,'220 70% 35%'),
 ('Northern Regional Command','RC-NORTHERN',12,'40 70% 38%'),
 ('Oti Regional Command','RC-OTI',13,'275 50% 42%'),
 ('Savannah Regional Command','RC-SAVANNAH',14,'180 55% 32%'),
 ('Upper East Regional Command','RC-UPPEREAST',16,'130 55% 32%'),
 ('Upper West Regional Command','RC-UPPERWEST',17,'240 50% 45%'),
 ('Volta Regional Command','RC-VOLTA',18,'22 85% 45%'),
 ('Western Regional Command','RC-WESTERN',19,'185 60% 30%'),
 ('Western North Regional Command','RC-WESTERNNORTH',20,'335 60% 42%')
) v(name, code, ord, color)
WHERE NOT EXISTS (SELECT 1 FROM public.org_units o WHERE lower(o.name)=lower(v.name) OR o.code=v.code);

CREATE TABLE public.command_structure_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  org_unit_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.command_structure_audit TO authenticated;
GRANT ALL ON public.command_structure_audit TO service_role;
ALTER TABLE public.command_structure_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read command structure audit" ON public.command_structure_audit
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.command_region_of(_unit uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH RECURSIVE up AS (
    SELECT id, parent_id, type::text AS t, 0 AS d FROM org_units WHERE id=_unit
    UNION ALL
    SELECT o.id, o.parent_id, o.type::text, up.d+1 FROM org_units o JOIN up ON o.id=up.parent_id WHERE up.d < 12
  )
  SELECT id FROM up WHERE t IN ('regional','national') ORDER BY d LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.regional_commands_overview()
RETURNS TABLE(id uuid, name text, type text, activation_status text, display_order int, brand_color text, staff_count bigint, is_own boolean, can_open boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid := auth.uid(); _admin boolean; _own uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _admin := public.has_role(_uid,'admin');
  SELECT public.command_region_of(p.org_unit_id) INTO _own FROM profiles p WHERE p.user_id=_uid AND p.deleted_at IS NULL LIMIT 1;
  RETURN QUERY
  SELECT o.id, o.name, o.type::text, o.activation_status, o.display_order, o.brand_color,
    CASE WHEN _admin OR o.id=_own THEN (SELECT count(*) FROM profiles p WHERE p.deleted_at IS NULL AND public.command_region_of(p.org_unit_id)=o.id) ELSE NULL END,
    coalesce(o.id=_own,false),
    o.activation_status='active' AND (_admin OR coalesce(o.id=_own,false))
  FROM org_units o
  WHERE (o.id='95ab6cb7-290f-45fb-ad23-32664e34dacd'
     OR (o.type='regional' AND o.parent_id='95ab6cb7-290f-45fb-ad23-32664e34dacd'))
    AND (_admin OR o.id=_own)
  ORDER BY o.display_order NULLS LAST, o.name;
END $$;

CREATE OR REPLACE FUNCTION public.my_command_assignment()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _unit uuid; _region uuid; _n int;
BEGIN
  SELECT count(*), max(org_unit_id::text)::uuid INTO _n, _unit FROM profiles WHERE user_id=auth.uid() AND deleted_at IS NULL;
  IF _n > 1 THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF _unit IS NULL THEN RETURN jsonb_build_object('status','unassigned'); END IF;
  _region := public.command_region_of(_unit);
  IF _region IS NULL THEN RETURN jsonb_build_object('status','unmapped','unit_id',_unit); END IF;
  RETURN jsonb_build_object('status','ok','unit_id',_unit,'region_id',_region);
END $$;

CREATE OR REPLACE FUNCTION public.unmapped_staff_assignments()
RETURNS TABLE(profile_id uuid, staff_id text, full_name text, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT p.id, p.staff_id::text, trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),
    CASE WHEN p.org_unit_id IS NULL THEN 'No command assigned' ELSE 'Command not linked to a region' END
  FROM profiles p WHERE p.deleted_at IS NULL AND (p.org_unit_id IS NULL OR public.command_region_of(p.org_unit_id) IS NULL)
  ORDER BY 3 LIMIT 500;
END $$;

CREATE OR REPLACE FUNCTION public.set_command_activation(_unit uuid, _status text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _old text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only Super Admins can change command activation'; END IF;
  IF _status NOT IN ('active','pending') THEN RAISE EXCEPTION 'invalid status'; END IF;
  IF coalesce(trim(_reason),'')='' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT activation_status INTO _old FROM org_units WHERE id=_unit FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'command not found'; END IF;
  UPDATE org_units SET activation_status=_status, updated_at=now() WHERE id=_unit;
  INSERT INTO command_structure_audit(actor_id,action,org_unit_id,details)
  VALUES (auth.uid(),'activation_change',_unit,jsonb_build_object('from',_old,'to',_status,'reason',_reason));
END $$;

CREATE OR REPLACE FUNCTION public.save_command_order(_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only administrators can reorder command cards'; END IF;
  UPDATE org_units o SET display_order = x.ord FROM unnest(_ids) WITH ORDINALITY x(id, ord) WHERE o.id=x.id;
  INSERT INTO command_structure_audit(actor_id,action,details) VALUES (auth.uid(),'card_reorder',jsonb_build_object('order',to_jsonb(_ids)));
END $$;

REVOKE ALL ON FUNCTION public.command_region_of(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.regional_commands_overview() FROM public, anon;
REVOKE ALL ON FUNCTION public.my_command_assignment() FROM public, anon;
REVOKE ALL ON FUNCTION public.unmapped_staff_assignments() FROM public, anon;
REVOKE ALL ON FUNCTION public.set_command_activation(uuid,text,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.save_command_order(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.regional_commands_overview(), public.my_command_assignment(), public.unmapped_staff_assignments(), public.set_command_activation(uuid,text,text), public.save_command_order(uuid[]) TO authenticated;

CREATE TABLE public.app_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  tokens jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_brands_one_active ON public.app_brands ((true)) WHERE is_active;
GRANT SELECT ON public.app_brands TO authenticated, anon;
GRANT ALL ON public.app_brands TO service_role;
ALTER TABLE public.app_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads brands" ON public.app_brands FOR SELECT TO authenticated, anon USING (true);

INSERT INTO public.app_brands(name,tokens,is_active,is_system) VALUES
('Brand 1', '{"primary":"189 100% 27%","secondary":"215 80% 32%","accent":"152 70% 30%","background":"200 25% 97%","surface":"0 0% 100%","text":"210 60% 8%","border":"200 25% 86%","success":"142 70% 35%","warning":"38 92% 45%","danger":"0 85% 45%"}', false, true),
('Brand 2', '{"primary":"152 65% 22%","secondary":"43 74% 45%","accent":"155 55% 45%","background":"150 30% 97%","surface":"0 0% 100%","text":"155 45% 10%","border":"150 25% 85%","success":"145 60% 32%","warning":"40 90% 45%","danger":"0 75% 45%"}', true, true);

CREATE OR REPLACE FUNCTION public.save_brand(_id uuid, _name text, _tokens jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _k text; _new uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only administrators can manage brands'; END IF;
  IF coalesce(trim(_name),'')='' THEN RAISE EXCEPTION 'Brand name required'; END IF;
  FOREACH _k IN ARRAY ARRAY['primary','secondary','accent','background','surface','text','border','success','warning','danger'] LOOP
    IF NOT (_tokens ? _k) OR (_tokens->>_k) !~ '^\d{1,3}(\.\d+)? \d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$' THEN RAISE EXCEPTION 'Invalid colour for %', _k; END IF;
  END LOOP;
  IF _id IS NULL THEN
    INSERT INTO app_brands(name,tokens,created_by) VALUES (trim(_name),_tokens,auth.uid()) RETURNING id INTO _new;
  ELSE
    IF EXISTS (SELECT 1 FROM app_brands WHERE id=_id AND is_system) THEN RAISE EXCEPTION 'Built-in brands cannot be edited; save a copy instead'; END IF;
    UPDATE app_brands SET name=trim(_name), tokens=_tokens, updated_at=now() WHERE id=_id RETURNING id INTO _new;
  END IF;
  INSERT INTO command_structure_audit(actor_id,action,details) VALUES (auth.uid(),'brand_saved',jsonb_build_object('brand_id',_new,'name',_name));
  RETURN _new;
END $$;

CREATE OR REPLACE FUNCTION public.activate_brand(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only administrators can switch brands'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_brands WHERE id=_id) THEN RAISE EXCEPTION 'brand not found'; END IF;
  UPDATE app_brands SET is_active=false WHERE is_active AND id<>_id;
  UPDATE app_brands SET is_active=true, updated_at=now() WHERE id=_id;
  INSERT INTO command_structure_audit(actor_id,action,details) VALUES (auth.uid(),'brand_activated',jsonb_build_object('brand_id',_id));
END $$;

CREATE OR REPLACE FUNCTION public.delete_brand(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM app_brands WHERE id=_id AND (is_system OR is_active)) THEN RAISE EXCEPTION 'Built-in or active brands cannot be deleted'; END IF;
  DELETE FROM app_brands WHERE id=_id;
  INSERT INTO command_structure_audit(actor_id,action,details) VALUES (auth.uid(),'brand_deleted',jsonb_build_object('brand_id',_id));
END $$;
REVOKE ALL ON FUNCTION public.save_brand(uuid,text,jsonb), public.activate_brand(uuid), public.delete_brand(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_brand(uuid,text,jsonb), public.activate_brand(uuid), public.delete_brand(uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_brands;
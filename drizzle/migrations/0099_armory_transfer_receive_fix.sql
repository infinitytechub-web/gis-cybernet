CREATE OR REPLACE FUNCTION public.armory_validate_weapon_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE w public.armory_records;
BEGIN
 IF NEW.kind='weapon' THEN
  IF COALESCE(NEW.details->>'weapon_type','') NOT IN ('Pistol','Revolver','Rifle','Shotgun','Submachine Gun','Machine Gun','Less-Lethal','Other') THEN RAISE EXCEPTION 'Weapon type is required'; END IF;
  IF length(trim(COALESCE(NEW.details->>'model','')))=0 THEN RAISE EXCEPTION 'Weapon model is required'; END IF;
  IF COALESCE(NEW.details->>'condition','') NOT IN ('Serviceable','Needs Maintenance','Unserviceable','Condemned') THEN RAISE EXCEPTION 'Weapon condition is required'; END IF;
 ELSIF NEW.kind IN ('custody','transfer','maintenance') THEN
  IF NEW.asset_id IS NULL THEN RAISE EXCEPTION 'Select a registered weapon'; END IF;
  SELECT * INTO w FROM public.armory_records WHERE id=NEW.asset_id;
  IF w.id IS NULL OR w.kind<>'weapon' THEN RAISE EXCEPTION 'The selected item is not a registered weapon'; END IF;
  IF TG_OP='INSERT' AND w.status='archived' THEN RAISE EXCEPTION 'Archived weapons cannot be used'; END IF;
  IF (TG_OP='INSERT' OR NEW.asset_id IS DISTINCT FROM OLD.asset_id OR NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id)
     AND w.org_unit_id<>NEW.org_unit_id THEN RAISE EXCEPTION 'The weapon is registered to a different command'; END IF;
  IF TG_OP='UPDATE' AND NEW.kind='transfer' AND NEW.status='received' AND w.org_unit_id<>NEW.destination_unit_id THEN RAISE EXCEPTION 'The weapon has not reached the receiving command'; END IF;
  IF NEW.kind='custody' AND TG_OP='INSERT' AND w.details->>'condition' IN ('Unserviceable','Condemned') THEN RAISE EXCEPTION 'Unserviceable or condemned weapons cannot be issued'; END IF;
 END IF;
 RETURN NEW;
END $function$;
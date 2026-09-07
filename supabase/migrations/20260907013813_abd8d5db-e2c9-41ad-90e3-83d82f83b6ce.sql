CREATE OR REPLACE FUNCTION public.apply_profile_change_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  k TEXT;
  v TEXT;
  has_restricted BOOLEAN := false;
  med_fields TEXT[] := ARRAY[]::TEXT[];
  bank_fields TEXT[] := ARRAY[]::TEXT[];
  array_fields TEXT[] := ARRAY['hobbies','special_skills'];
  arr TEXT[];
  allowed TEXT[] := ARRAY[
    'first_name','last_name','other_names','gender','date_of_birth','marital_status',
    'phone','email','ghana_card_number','blood_group','office',
    'training_designation','staff_category','photo_url',
    'place_of_birth','hometown','region_of_origin',
    'current_place_of_stay','residential_address','digital_address','postal_address',
    'residential_phone','height_cm','uniform_size','shoe_size','religion',
    'hobbies','special_skills','number_of_children',
    'previous_last_position','previous_reason_for_leaving'
  ];
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_object_keys(NEW.requested_changes) key
      WHERE key LIKE 'medical.%' OR key LIKE 'bank.%'
    ) INTO has_restricted;

    IF has_restricted AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only an administrator can approve restricted medical or bank changes';
    END IF;

    FOR k, v IN SELECT key, value::text FROM jsonb_each_text(NEW.requested_changes) LOOP
      IF k = ANY(array_fields) THEN
        IF NULLIF(BTRIM(COALESCE(v, '')), '') IS NULL THEN
          arr := NULL;
        ELSE
          SELECT array_agg(t) INTO arr
          FROM (
            SELECT BTRIM(x) AS t
            FROM unnest(string_to_array(v, ',')) AS x
            WHERE BTRIM(x) <> ''
          ) s;
        END IF;
        EXECUTE format('UPDATE public.profiles SET %I = $1, updated_at = now() WHERE id = $2', k)
          USING arr, NEW.profile_id;
      ELSIF k = ANY(allowed) THEN
        EXECUTE format('UPDATE public.profiles SET %I = $1, updated_at = now() WHERE id = $2', k)
          USING NULLIF(v, ''), NEW.profile_id;
      ELSIF k IN ('medical.medical_conditions', 'medical.welfare_notes') THEN
        INSERT INTO public.staff_medical_welfare (profile_id) VALUES (NEW.profile_id)
        ON CONFLICT (profile_id) DO NOTHING;
        EXECUTE format('UPDATE public.staff_medical_welfare SET %I = $1, updated_at = now() WHERE profile_id = $2',
                       SPLIT_PART(k, '.', 2))
          USING NULLIF(v, ''), NEW.profile_id;
        med_fields := med_fields || SPLIT_PART(k, '.', 2);
      ELSIF k IN ('bank.bank_name', 'bank.branch', 'bank.account_number') THEN
        INSERT INTO public.staff_bank_details (profile_id) VALUES (NEW.profile_id)
        ON CONFLICT (profile_id) DO NOTHING;
        EXECUTE format('UPDATE public.staff_bank_details SET %I = $1, updated_at = now() WHERE profile_id = $2',
                       SPLIT_PART(k, '.', 2))
          USING NULLIF(v, ''), NEW.profile_id;
        bank_fields := bank_fields || SPLIT_PART(k, '.', 2);
      END IF;
    END LOOP;

    IF array_length(med_fields, 1) > 0 THEN
      INSERT INTO public.biodata_restricted_access_log (profile_id, section, action, actor_id, changed_fields, details)
      VALUES (NEW.profile_id, 'medical', 'edit', auth.uid(), med_fields,
              jsonb_build_object('source', 'approved_change_request', 'request_id', NEW.id));
    END IF;
    IF array_length(bank_fields, 1) > 0 THEN
      INSERT INTO public.biodata_restricted_access_log (profile_id, section, action, actor_id, changed_fields, details)
      VALUES (NEW.profile_id, 'bank', 'edit', auth.uid(), bank_fields,
              jsonb_build_object('source', 'approved_change_request', 'request_id', NEW.id));
    END IF;

    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
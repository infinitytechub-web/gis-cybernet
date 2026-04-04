
CREATE OR REPLACE FUNCTION public.prevent_user_id_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow setting user_id when it was previously NULL (initial account linking)
  IF OLD.user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Block any other change to user_id
  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Changing user_id on profiles is not allowed';
  END IF;
  RETURN NEW;
END;
$function$;

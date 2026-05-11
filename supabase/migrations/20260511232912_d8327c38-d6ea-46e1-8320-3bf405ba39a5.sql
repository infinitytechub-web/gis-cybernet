CREATE OR REPLACE FUNCTION public.block_sao_mutations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  RAISE EXCEPTION 'shift_assignment_overrides is append-only';
END $function$;
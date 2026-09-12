-- Fix selected finding: fleet message updates must remain scoped to the same
-- vehicle and actor, and sent-message identity/content fields are immutable.
DROP POLICY IF EXISTS "Fleet staff and assigned drivers mark messages read" ON public.fleet_messages;
CREATE POLICY "Fleet staff and assigned drivers mark messages read"
ON public.fleet_messages
FOR UPDATE
TO authenticated
USING (
  public.can_manage_fleet(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.fleet_vehicles v
    JOIN public.profiles p ON p.id = v.assigned_driver_id
    WHERE v.id = fleet_messages.vehicle_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  public.can_manage_fleet(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.fleet_vehicles v
    JOIN public.profiles p ON p.id = v.assigned_driver_id
    WHERE v.id = fleet_messages.vehicle_id
      AND p.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.fleet_messages_immutable_body()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.direction IS DISTINCT FROM OLD.direction
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.sender_label IS DISTINCT FROM OLD.sender_label
     OR NEW.lat IS DISTINCT FROM OLD.lat
     OR NEW.lng IS DISTINCT FROM OLD.lng
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Sent fleet message content and attribution are immutable'
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Fix selected finding: supervisors must never gain broad profile visibility
-- merely because their own department happens to be named OIC.
DROP POLICY IF EXISTS "Supervisors can view department profiles" ON public.profiles;
CREATE POLICY "Supervisors can view department profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND department_id = public.get_user_department_id(auth.uid())
);
CREATE OR REPLACE FUNCTION public.notify_new_requisition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','oic','2ic','procurement_officer']::app_role[],
    'New Purchase Requisition',
    format('Requisition "%s" submitted.', COALESCE(NEW.title, NEW.pr_number)),
    'general',
    NEW.id
  );
  RETURN NEW;
END;
$$;
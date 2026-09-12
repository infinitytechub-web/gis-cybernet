CREATE POLICY "Officers view items issued to themselves"
ON public.inventory_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.inventory_issuance ii
    JOIN public.profiles p ON p.id = ii.profile_id
    WHERE ii.item_id = inventory_items.id
      AND p.user_id = auth.uid()
  )
);

ALTER FUNCTION public.my_store_issuance() SECURITY INVOKER;
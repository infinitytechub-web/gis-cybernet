DROP POLICY IF EXISTS "Authenticated read grades" ON public.staff_grades;
CREATE POLICY "Active staff read grades" ON public.staff_grades FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR (is_active AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.deleted_at IS NULL)));
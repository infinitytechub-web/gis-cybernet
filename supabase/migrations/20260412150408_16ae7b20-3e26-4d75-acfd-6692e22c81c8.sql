-- Drop the permissive SELECT policy that lets all authenticated users read app_settings
DROP POLICY "Authenticated users can view app settings" ON public.app_settings;
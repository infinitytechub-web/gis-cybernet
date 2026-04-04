-- Drop the overly permissive policy
DROP POLICY "Service can insert notifications" ON public.notifications;

-- Replace with a proper policy: users can insert notifications for themselves
CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
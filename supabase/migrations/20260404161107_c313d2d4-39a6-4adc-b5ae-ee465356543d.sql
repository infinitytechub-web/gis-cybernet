
-- Fix 1: Force status='pending' on user INSERT for leave_requests
DROP POLICY IF EXISTS "Users can create own leave requests" ON public.leave_requests;
CREATE POLICY "Users can create own leave requests" ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status = 'pending'
  );

-- Fix 2: Force status='pending' on user INSERT for postings_transfers
DROP POLICY IF EXISTS "Users can create own postings" ON public.postings_transfers;
CREATE POLICY "Users can create own postings" ON public.postings_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status = 'pending'
  );

-- Fix 3: Force status='present' on user INSERT for attendances (prevent setting 'excused' etc.)
DROP POLICY IF EXISTS "Users can create own attendance" ON public.attendances;
CREATE POLICY "Users can create own attendance" ON public.attendances
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status = 'present'
  );

-- Fix 4: Add WITH CHECK to profiles UPDATE policy to prevent user_id tampering
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Fix 5: Make staff-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'staff-photos';

-- Fix 6: Drop public SELECT policy on staff-photos and add authenticated-only policy
DROP POLICY IF EXISTS "Staff photos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view staff photos" ON storage.objects;
CREATE POLICY "Authenticated users can view staff photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'staff-photos');

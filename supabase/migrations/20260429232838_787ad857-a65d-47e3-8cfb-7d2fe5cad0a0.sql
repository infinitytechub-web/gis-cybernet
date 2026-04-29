-- =============================================================
-- LEAVE REQUESTS: allow command tier (admin/oic/2ic/staff_officer)
-- to approve any request across all departments.
-- =============================================================

-- The existing "Command can view all leave requests" SELECT policy
-- already grants oic/2ic/staff_officer read access. Admins use the
-- "Admins can manage leave requests" ALL policy. We add an explicit
-- UPDATE policy so OIC / 2IC / Staff Officer can act on them.
DROP POLICY IF EXISTS "Command tier can update leave requests" ON public.leave_requests;
CREATE POLICY "Command tier can update leave requests"
ON public.leave_requests
FOR UPDATE
TO authenticated
USING (public.is_command_tier(auth.uid()))
WITH CHECK (public.is_command_tier(auth.uid()));


-- =============================================================
-- POSTINGS & TRANSFERS: command tier had no department-wide visibility
-- and no approval rights (only admins + literal supervisors).
-- Add SELECT and UPDATE policies for command tier.
-- =============================================================

DROP POLICY IF EXISTS "Command tier can view all postings" ON public.postings_transfers;
CREATE POLICY "Command tier can view all postings"
ON public.postings_transfers
FOR SELECT
TO authenticated
USING (public.is_command_tier(auth.uid()));

DROP POLICY IF EXISTS "Command tier can update postings" ON public.postings_transfers;
CREATE POLICY "Command tier can update postings"
ON public.postings_transfers
FOR UPDATE
TO authenticated
USING (public.is_command_tier(auth.uid()))
WITH CHECK (public.is_command_tier(auth.uid()));
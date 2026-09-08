-- 1. Widen status values to include the intermediate supervisor-approved stage
ALTER TABLE public.profile_change_requests
  DROP CONSTRAINT IF EXISTS profile_change_requests_status_check;

ALTER TABLE public.profile_change_requests
  ADD CONSTRAINT profile_change_requests_status_check
  CHECK (status IN ('pending','supervisor_approved','approved','rejected','cancelled'));

-- 2. Per-step reviewer trail
ALTER TABLE public.profile_change_requests
  ADD COLUMN IF NOT EXISTS supervisor_id uuid,
  ADD COLUMN IF NOT EXISTS supervisor_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS supervisor_notes text,
  ADD COLUMN IF NOT EXISTS admin_id uuid,
  ADD COLUMN IF NOT EXISTS admin_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- 3. Two-step gate: validates transitions, stamps the step trail, audits each step,
--    and applies approved fields only after final admin approval.
CREATE OR REPLACE FUNCTION public.apply_profile_change_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k TEXT;
  v TEXT;
  v_arr TEXT[];
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_is_command BOOLEAN;
  v_step TEXT := NULL;
  allowed TEXT[] := ARRAY[
    'first_name','last_name','gender','date_of_birth','marital_status',
    'phone','email','ghana_card_number','blood_group','office',
    'training_designation','staff_category','photo_url','address',
    'emergency_contact_name','emergency_contact_phone','next_of_kin'
  ];
  array_fields TEXT[] := ARRAY['hobbies','special_skills'];
BEGIN
  v_is_admin := public.has_role(v_uid, 'admin');
  v_is_command := public.is_command_tier(v_uid);

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Owner cancelling their own pending request needs no review rights.
    IF NEW.status = 'cancelled' AND OLD.user_id = v_uid THEN
      v_step := 'cancelled';

    ELSIF NEW.status = 'supervisor_approved' THEN
      IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'First approval only applies to a pending request';
      END IF;
      IF NOT v_is_command THEN
        RAISE EXCEPTION 'Only command-tier officers can give the first approval';
      END IF;
      NEW.supervisor_id := COALESCE(NEW.supervisor_id, v_uid);
      NEW.supervisor_reviewed_at := COALESCE(NEW.supervisor_reviewed_at, now());
      NEW.supervisor_notes := COALESCE(NEW.supervisor_notes, NEW.reviewer_notes);
      v_step := 'supervisor_approved';

    ELSIF NEW.status = 'approved' THEN
      IF OLD.status <> 'supervisor_approved' THEN
        RAISE EXCEPTION 'A supervisor must approve this request before final approval';
      END IF;
      IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only administrators can give the final approval';
      END IF;
      NEW.admin_id := COALESCE(NEW.admin_id, v_uid);
      NEW.admin_reviewed_at := COALESCE(NEW.admin_reviewed_at, now());
      NEW.admin_notes := COALESCE(NEW.admin_notes, NEW.reviewer_notes);
      NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
      v_step := 'admin_approved';

      FOR k, v IN SELECT key, value FROM jsonb_each_text(NEW.requested_changes) LOOP
        IF k = ANY(array_fields) THEN
          SELECT array_agg(t) INTO v_arr
          FROM (
            SELECT btrim(x) AS t
            FROM unnest(string_to_array(COALESCE(v, ''), ',')) AS x
          ) s
          WHERE t <> '';
          EXECUTE format('UPDATE public.profiles SET %I = $1, updated_at = now() WHERE id = $2', k)
            USING COALESCE(v_arr, ARRAY[]::TEXT[]), NEW.profile_id;
        ELSIF k = ANY(allowed) THEN
          EXECUTE format('UPDATE public.profiles SET %I = $1, updated_at = now() WHERE id = $2', k)
            USING NULLIF(v, ''), NEW.profile_id;
        END IF;
      END LOOP;

    ELSIF NEW.status = 'rejected' THEN
      IF NOT v_is_command THEN
        RAISE EXCEPTION 'Only command-tier officers can reject a request';
      END IF;
      NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
      IF v_is_admin AND OLD.status = 'supervisor_approved' THEN
        NEW.admin_id := COALESCE(NEW.admin_id, v_uid);
        NEW.admin_reviewed_at := COALESCE(NEW.admin_reviewed_at, now());
        NEW.admin_notes := COALESCE(NEW.admin_notes, NEW.reviewer_notes);
      ELSE
        NEW.supervisor_id := COALESCE(NEW.supervisor_id, v_uid);
        NEW.supervisor_reviewed_at := COALESCE(NEW.supervisor_reviewed_at, now());
        NEW.supervisor_notes := COALESCE(NEW.supervisor_notes, NEW.reviewer_notes);
      END IF;
      v_step := 'rejected';

    ELSIF NEW.status = 'pending' THEN
      IF NOT v_is_command THEN
        RAISE EXCEPTION 'Only command-tier officers can return a request to the queue';
      END IF;
      NEW.supervisor_id := NULL;
      NEW.supervisor_reviewed_at := NULL;
      NEW.supervisor_notes := NULL;
      NEW.admin_id := NULL;
      NEW.admin_reviewed_at := NULL;
      NEW.admin_notes := NULL;
      NEW.reviewed_at := NULL;
      v_step := 'returned_to_pending';
    END IF;
  END IF;

  NEW.updated_at := now();

  IF v_step IS NOT NULL THEN
    BEGIN
      INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
      VALUES (
        v_step,
        'profile_change_requests',
        NEW.id,
        v_uid,
        jsonb_build_object(
          'from_status', OLD.status,
          'to_status', NEW.status,
          'profile_id', NEW.profile_id,
          'fields', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb)
                     FROM jsonb_object_keys(COALESCE(NEW.requested_changes, '{}'::jsonb)) AS key),
          'notes', NEW.reviewer_notes
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'profile change audit failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_profile_change_request ON public.profile_change_requests;
CREATE TRIGGER trg_apply_profile_change_request
BEFORE UPDATE ON public.profile_change_requests
FOR EACH ROW EXECUTE FUNCTION public.apply_profile_change_request();

-- 4. Staff notifications for the new intermediate stage
CREATE OR REPLACE FUNCTION public.notify_profile_change_request_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_fields TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('supervisor_approved','approved','rejected','pending') THEN

    SELECT string_agg(k, ', ')
      INTO v_fields
      FROM jsonb_object_keys(COALESCE(NEW.requested_changes, '{}'::jsonb)) AS k;

    IF NEW.status = 'supervisor_approved' THEN
      v_title := 'Profile change passed first approval';
      v_message := 'Your profile change request was approved by a supervisor and now awaits administrator approval'
        || COALESCE(' (fields: ' || v_fields || ')', '') || '.';
    ELSIF NEW.status = 'approved' THEN
      v_title := 'Profile change approved';
      v_message := 'Your profile change request received final administrator approval and was applied'
        || COALESCE(' (fields: ' || v_fields || ')', '') || '.';
    ELSIF NEW.status = 'rejected' THEN
      v_title := 'Profile change rejected';
      v_message := 'Your profile change request was rejected'
        || COALESCE(' (fields: ' || v_fields || ')', '')
        || COALESCE('. Reviewer notes: ' || NEW.reviewer_notes, '') || '.';
    ELSE
      v_title := 'Profile change marked pending';
      v_message := 'Your profile change request was returned to the review queue'
        || COALESCE('. Reviewer notes: ' || NEW.reviewer_notes, '') || '.';
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type, reference_id)
    VALUES (NEW.user_id, v_title, v_message, 'general', NEW.id);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_profile_change_request_review failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 5. RLS: owner may still cancel; command tier reviews; only admins may set final approval
DROP POLICY IF EXISTS "owner can cancel own pending request" ON public.profile_change_requests;
CREATE POLICY "owner can cancel own pending request"
ON public.profile_change_requests FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid() AND status IN ('pending','cancelled'));

DROP POLICY IF EXISTS "command tier can review change requests" ON public.profile_change_requests;
CREATE POLICY "command tier can review change requests"
ON public.profile_change_requests FOR UPDATE
TO authenticated
USING (public.is_command_tier(auth.uid()))
WITH CHECK (
  public.is_command_tier(auth.uid())
  AND (status <> 'approved' OR public.has_role(auth.uid(), 'admin'))
);
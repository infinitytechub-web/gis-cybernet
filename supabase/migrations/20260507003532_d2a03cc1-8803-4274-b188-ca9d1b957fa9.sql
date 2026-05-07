
-- Tighten excuse_duty_forms RLS
DROP POLICY IF EXISTS "Staff submit own excuse duty" ON public.excuse_duty_forms;
CREATE POLICY "Staff submit own excuse duty"
  ON public.excuse_duty_forms FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND review_comment IS NULL
    AND staff_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff update own pending excuse duty" ON public.excuse_duty_forms;
CREATE POLICY "Staff update own pending excuse duty"
  ON public.excuse_duty_forms FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'pending')
  WITH CHECK (
    submitted_by = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

-- Trigger: prevent self-approval and enforce reviewer = current user
CREATE OR REPLACE FUNCTION public.enforce_excuse_duty_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    IF NOT public.is_command_tier(auth.uid()) THEN
      RAISE EXCEPTION 'Only command tier can approve or reject excuse duty forms';
    END IF;
    IF NEW.submitted_by = auth.uid() THEN
      RAISE EXCEPTION 'Reviewer cannot be the submitter (self-approval blocked)';
    END IF;
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_excuse_duty_review ON public.excuse_duty_forms;
CREATE TRIGGER trg_enforce_excuse_duty_review
  BEFORE UPDATE ON public.excuse_duty_forms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_excuse_duty_review();

-- Enable realtime for IPSE Night Guard sync + Health Lab tables
ALTER TABLE public.shift_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.medical_records REPLICA IDENTITY FULL;
ALTER TABLE public.medical_appointments REPLICA IDENTITY FULL;
ALTER TABLE public.medical_inventory REPLICA IDENTITY FULL;
ALTER TABLE public.health_reports REPLICA IDENTITY FULL;
ALTER TABLE public.excuse_duty_forms REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_assignments;     EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.medical_records;       EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.medical_appointments;  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.medical_inventory;     EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.health_reports;        EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.excuse_duty_forms;     EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

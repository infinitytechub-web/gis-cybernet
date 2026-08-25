-- ── Build / deployment releases ────────────────────────────────────────────
CREATE TABLE public.app_build_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  version_id text NOT NULL,
  build_date date NOT NULL,
  seq integer NOT NULL,
  app_version text,
  build_time timestamptz NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  registered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (build_date, seq)
);

GRANT SELECT ON public.app_build_releases TO authenticated;
GRANT ALL ON public.app_build_releases TO service_role;

ALTER TABLE public.app_build_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier can view deployment history"
ON public.app_build_releases FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_command_tier(auth.uid()));

CREATE TRIGGER update_app_build_releases_updated_at
BEFORE UPDATE ON public.app_build_releases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomically claim the next daily sequence for a build fingerprint.
CREATE OR REPLACE FUNCTION public.register_app_build(
  p_fingerprint text,
  p_build_time timestamptz DEFAULT now(),
  p_app_version text DEFAULT NULL,
  p_prefix text DEFAULT 'ITI'
)
RETURNS public.app_build_releases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.app_build_releases;
  v_date date;
  v_seq integer;
  v_prefix text := COALESCE(NULLIF(regexp_replace(COALESCE(p_prefix, 'ITI'), '[^A-Za-z0-9]', '', 'g'), ''), 'ITI');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_fingerprint IS NULL OR length(trim(p_fingerprint)) = 0 THEN
    RAISE EXCEPTION 'Build fingerprint is required';
  END IF;

  SELECT * INTO v_row FROM public.app_build_releases WHERE fingerprint = p_fingerprint;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  v_date := (COALESCE(p_build_time, now()))::date;
  PERFORM pg_advisory_xact_lock(hashtext('app_build_releases:' || v_date::text));

  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq
  FROM public.app_build_releases WHERE build_date = v_date;

  INSERT INTO public.app_build_releases
    (fingerprint, version_id, build_date, seq, app_version, build_time, registered_by)
  VALUES (
    p_fingerprint,
    v_prefix
      || to_char(v_date, 'DDMMYYYY')
      || '-'
      || lpad(v_seq::text, 2, '0'),
    v_date,
    v_seq,
    p_app_version,
    COALESCE(p_build_time, now()),
    auth.uid()
  )
  ON CONFLICT (fingerprint) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.app_build_releases WHERE fingerprint = p_fingerprint;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.register_app_build(text, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_app_build(text, timestamptz, text, text) TO authenticated;

-- ── Payment requests ───────────────────────────────────────────────────────
CREATE TABLE public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_name text NOT NULL,
  phone text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'mobile_money',
  reference text,
  purpose text,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own payment requests"
ON public.payment_requests FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.is_command_tier(auth.uid()));

CREATE POLICY "Staff create own payment requests"
ON public.payment_requests FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Command tier update payment requests"
ON public.payment_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_command_tier(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_command_tier(auth.uid()));

CREATE POLICY "Command tier delete payment requests"
ON public.payment_requests FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_command_tier(auth.uid()));

CREATE TRIGGER update_payment_requests_updated_at
BEFORE UPDATE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER gh_phone_guard_payment_requests
BEFORE INSERT OR UPDATE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.gh_phone_guard_contact_columns('phone');

-- ── Loan applications ──────────────────────────────────────────────────────
CREATE TABLE public.loan_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_name text NOT NULL,
  phone text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  repayment_months integer NOT NULL DEFAULT 12 CHECK (repayment_months BETWEEN 1 AND 120),
  purpose text,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_applications TO authenticated;
GRANT ALL ON public.loan_applications TO service_role;

ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own loan applications"
ON public.loan_applications FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.is_command_tier(auth.uid()));

CREATE POLICY "Staff create own loan applications"
ON public.loan_applications FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Command tier update loan applications"
ON public.loan_applications FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_command_tier(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_command_tier(auth.uid()));

CREATE POLICY "Command tier delete loan applications"
ON public.loan_applications FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_command_tier(auth.uid()));

CREATE TRIGGER update_loan_applications_updated_at
BEFORE UPDATE ON public.loan_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER gh_phone_guard_loan_applications
BEFORE INSERT OR UPDATE ON public.loan_applications
FOR EACH ROW EXECUTE FUNCTION public.gh_phone_guard_contact_columns('phone');
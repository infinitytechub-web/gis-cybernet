-- ============================================================
-- 1. Command-tier management helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_manage_command_tier(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin','oic','2ic')
  )
$$;

-- Highest authority level held by a user (lower number = higher authority)
CREATE OR REPLACE FUNCTION public.command_authority_level(_user_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MIN(CASE role::text
    WHEN 'admin' THEN 0
    WHEN 'oic' THEN 1
    WHEN '2ic' THEN 2
    ELSE 50 END), 99)
  FROM public.user_roles WHERE user_id = _user_id
$$;

-- ============================================================
-- 2. Command tier capability grants
-- ============================================================
CREATE TABLE IF NOT EXISTS public.command_tier_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  capability text NOT NULL,
  reason text,
  granted_by uuid NOT NULL,
  granted_by_name text,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ctg_active_unique
  ON public.command_tier_grants (user_id, capability) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ctg_user ON public.command_tier_grants (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.command_tier_grants TO authenticated;
GRANT ALL ON public.command_tier_grants TO service_role;

ALTER TABLE public.command_tier_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Holders and command tier can view grants"
  ON public.command_tier_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_command_tier(auth.uid()));

CREATE POLICY "Authorized officers can create grants"
  ON public.command_tier_grants FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_command_tier(auth.uid()) AND granted_by = auth.uid());

CREATE POLICY "Authorized officers can update grants"
  ON public.command_tier_grants FOR UPDATE TO authenticated
  USING (public.can_manage_command_tier(auth.uid()))
  WITH CHECK (public.can_manage_command_tier(auth.uid()));

CREATE POLICY "Admins can delete grants"
  ON public.command_tier_grants FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_ctg_upd BEFORE UPDATE ON public.command_tier_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_audit_ctg AFTER INSERT OR UPDATE OR DELETE ON public.command_tier_grants
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

-- Capability check: command tier by role OR an explicit, active grant
CREATE OR REPLACE FUNCTION public.has_command_capability(_user_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_command_tier(_user_id) OR EXISTS (
    SELECT 1 FROM public.command_tier_grants g
    WHERE g.user_id = _user_id
      AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now())
      AND (g.capability = _capability OR g.capability = '*')
  )
$$;

-- ============================================================
-- 3. Delegated command-tier role assignment (admin, OIC, 2IC)
-- ============================================================
DROP POLICY IF EXISTS "Only admins can insert user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can update user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can delete user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;

CREATE POLICY "Authorized officers can insert user roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_command_tier(auth.uid()));
CREATE POLICY "Authorized officers can update user roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.can_manage_command_tier(auth.uid()))
  WITH CHECK (public.can_manage_command_tier(auth.uid()));
CREATE POLICY "Authorized officers can delete user roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.can_manage_command_tier(auth.uid()));

-- Escalation guard: nobody may grant/remove a level above their own, and only
-- admins may change their own roles.
CREATE OR REPLACE FUNCTION public.guard_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  actor_level int;
  target_level int;
  target_user uuid;
  target_role text;
BEGIN
  -- Service role / internal calls (no JWT) bypass.
  IF actor IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF public.has_role(actor, 'admin'::app_role) THEN RETURN COALESCE(NEW, OLD); END IF;

  actor_level := public.command_authority_level(actor);
  target_user := COALESCE(NEW.user_id, OLD.user_id);
  target_role := COALESCE(NEW.role, OLD.role)::text;
  target_level := CASE target_role
    WHEN 'admin' THEN 0 WHEN 'oic' THEN 1 WHEN '2ic' THEN 2 ELSE 50 END;

  IF actor_level > 2 THEN
    RAISE EXCEPTION 'Not authorized to manage role assignments';
  END IF;
  IF target_level < actor_level THEN
    RAISE EXCEPTION 'Not authorized to manage the % role', target_role;
  END IF;
  IF target_user = actor THEN
    RAISE EXCEPTION 'Officers cannot change their own role assignments';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_role_escalation ON public.user_roles;
CREATE TRIGGER trg_guard_role_escalation
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_role_escalation();

-- ============================================================
-- 4. Standard Bail records
-- ============================================================
CREATE TABLE IF NOT EXISTS public.detention_bail_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text,
  detention_id uuid REFERENCES public.detention_records(id) ON DELETE SET NULL,
  -- bailee
  bailee_first_name text NOT NULL,
  bailee_last_name text NOT NULL,
  bailee_gender text,
  bailee_nationality text,
  bailee_id_type text,
  bailee_id_number text,
  bailee_phone text,
  bailee_address text,
  -- bail particulars
  offence text NOT NULL,
  bail_type text NOT NULL DEFAULT 'self_recognizance',
  bail_amount numeric(14,2),
  currency text NOT NULL DEFAULT 'GHS',
  conditions text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  report_back_at timestamptz,
  report_station text,
  -- surety
  surety_name text,
  surety_relationship text,
  surety_id_type text,
  surety_id_number text,
  surety_phone text,
  surety_address text,
  surety_occupation text,
  -- authorization block
  authorized_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  authorized_by_name text,
  authorized_by_rank text,
  authorized_signature_name text,
  authorized_signature_url text,
  authorized_at timestamptz,
  authorization_status text NOT NULL DEFAULT 'pending',
  authorization_remarks text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bail_status_check CHECK (authorization_status IN ('pending','authorized','declined')),
  CONSTRAINT bail_type_check CHECK (bail_type IN ('self_recognizance','surety','cash','property','court_ordered')),
  CONSTRAINT bail_amount_check CHECK (bail_amount IS NULL OR bail_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_bail_detention ON public.detention_bail_records (detention_id);
CREATE INDEX IF NOT EXISTS idx_bail_granted ON public.detention_bail_records (granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_bail_status ON public.detention_bail_records (authorization_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.detention_bail_records TO authenticated;
GRANT ALL ON public.detention_bail_records TO service_role;

ALTER TABLE public.detention_bail_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Detention staff can view bail records"
  ON public.detention_bail_records FOR SELECT TO authenticated
  USING (
    public.is_command_tier(auth.uid())
    OR public.has_command_capability(auth.uid(), 'detention')
    OR created_by = auth.uid()
  );

CREATE POLICY "Detention staff can create bail records"
  ON public.detention_bail_records FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.is_command_tier(auth.uid()) OR public.has_command_capability(auth.uid(), 'detention'))
  );

CREATE POLICY "Creator or command tier can update bail records"
  ON public.detention_bail_records FOR UPDATE TO authenticated
  USING (public.is_command_tier(auth.uid()) OR created_by = auth.uid())
  WITH CHECK (public.is_command_tier(auth.uid()) OR created_by = auth.uid());

CREATE POLICY "Command tier can delete bail records"
  ON public.detention_bail_records FOR DELETE TO authenticated
  USING (public.is_command_tier(auth.uid()));

CREATE TRIGGER trg_bail_upd BEFORE UPDATE ON public.detention_bail_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_audit_bail AFTER INSERT OR UPDATE OR DELETE ON public.detention_bail_records
  FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

-- Only command officers may fill or change the authorization block.
CREATE OR REPLACE FUNCTION public.guard_bail_authorization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  touched boolean;
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    touched := NEW.authorized_by IS NOT NULL
      OR NEW.authorized_by_name IS NOT NULL
      OR NEW.authorized_signature_name IS NOT NULL
      OR NEW.authorized_signature_url IS NOT NULL
      OR NEW.authorized_at IS NOT NULL
      OR NEW.authorization_status <> 'pending';
  ELSE
    touched := NEW.authorized_by IS DISTINCT FROM OLD.authorized_by
      OR NEW.authorized_by_name IS DISTINCT FROM OLD.authorized_by_name
      OR NEW.authorized_by_rank IS DISTINCT FROM OLD.authorized_by_rank
      OR NEW.authorized_signature_name IS DISTINCT FROM OLD.authorized_signature_name
      OR NEW.authorized_signature_url IS DISTINCT FROM OLD.authorized_signature_url
      OR NEW.authorized_at IS DISTINCT FROM OLD.authorized_at
      OR NEW.authorization_status IS DISTINCT FROM OLD.authorization_status;
  END IF;

  IF touched AND NOT public.is_command_tier(actor) THEN
    RAISE EXCEPTION 'Only authorized command officers may set the bail authorization details';
  END IF;

  IF NEW.authorization_status = 'authorized' AND NEW.authorized_at IS NULL THEN
    NEW.authorized_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bail_authorization ON public.detention_bail_records;
CREATE TRIGGER trg_bail_authorization
  BEFORE INSERT OR UPDATE ON public.detention_bail_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_bail_authorization();
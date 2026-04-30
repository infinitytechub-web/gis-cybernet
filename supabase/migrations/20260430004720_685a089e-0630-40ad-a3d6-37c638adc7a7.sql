
-- Interlink: external command/partner contact directory
CREATE TABLE public.interlink_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  command_or_unit text,
  email text NOT NULL,
  scope text NOT NULL DEFAULT 'extranet' CHECK (scope IN ('intranet','internet','extranet')),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interlink_contacts_email_chk CHECK (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);
CREATE UNIQUE INDEX interlink_contacts_email_uniq ON public.interlink_contacts (lower(email));
CREATE INDEX interlink_contacts_scope_idx ON public.interlink_contacts(scope);

ALTER TABLE public.interlink_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier reads interlink contacts" ON public.interlink_contacts
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'oic'::app_role) OR
    has_role(auth.uid(),'2ic'::app_role) OR
    has_role(auth.uid(),'staff_officer'::app_role)
  );

CREATE POLICY "Command tier writes interlink contacts" ON public.interlink_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      has_role(auth.uid(),'admin'::app_role) OR
      has_role(auth.uid(),'oic'::app_role) OR
      has_role(auth.uid(),'2ic'::app_role) OR
      has_role(auth.uid(),'staff_officer'::app_role)
    )
  );

CREATE POLICY "Command tier updates interlink contacts" ON public.interlink_contacts
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'oic'::app_role) OR
    has_role(auth.uid(),'2ic'::app_role) OR
    has_role(auth.uid(),'staff_officer'::app_role)
  );

CREATE POLICY "Admin deletes interlink contacts" ON public.interlink_contacts
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

-- Saved distribution lists
CREATE TABLE public.interlink_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  scope text NOT NULL DEFAULT 'extranet' CHECK (scope IN ('intranet','internet','extranet')),
  member_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX interlink_lists_name_idx ON public.interlink_lists(name);

ALTER TABLE public.interlink_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier reads interlink lists" ON public.interlink_lists
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'oic'::app_role) OR
    has_role(auth.uid(),'2ic'::app_role) OR
    has_role(auth.uid(),'staff_officer'::app_role)
  );

CREATE POLICY "Command tier writes interlink lists" ON public.interlink_lists
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      has_role(auth.uid(),'admin'::app_role) OR
      has_role(auth.uid(),'oic'::app_role) OR
      has_role(auth.uid(),'2ic'::app_role) OR
      has_role(auth.uid(),'staff_officer'::app_role)
    )
  );

CREATE POLICY "Command tier updates interlink lists" ON public.interlink_lists
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'oic'::app_role) OR
    has_role(auth.uid(),'2ic'::app_role) OR
    has_role(auth.uid(),'staff_officer'::app_role)
  );

CREATE POLICY "Admin deletes interlink lists" ON public.interlink_lists
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

-- Dispatch audit trail
CREATE TABLE public.interlink_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('intranet','internet','extranet','mixed')),
  subject text NOT NULL,
  message text,
  recipient_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  recipient_count integer NOT NULL DEFAULT 0,
  attachment_names text[] NOT NULL DEFAULT ARRAY[]::text[],
  attachment_count integer NOT NULL DEFAULT 0,
  total_attachment_bytes integer NOT NULL DEFAULT 0,
  report_kind text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','partial','failed')),
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX interlink_dispatches_created_idx ON public.interlink_dispatches(created_at DESC);
CREATE INDEX interlink_dispatches_performer_idx ON public.interlink_dispatches(performed_by);

ALTER TABLE public.interlink_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier reads interlink dispatches" ON public.interlink_dispatches
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'oic'::app_role) OR
    has_role(auth.uid(),'2ic'::app_role) OR
    has_role(auth.uid(),'staff_officer'::app_role)
  );

CREATE POLICY "Command tier inserts own interlink dispatches" ON public.interlink_dispatches
  FOR INSERT TO authenticated
  WITH CHECK (
    performed_by = auth.uid() AND (
      has_role(auth.uid(),'admin'::app_role) OR
      has_role(auth.uid(),'oic'::app_role) OR
      has_role(auth.uid(),'2ic'::app_role) OR
      has_role(auth.uid(),'staff_officer'::app_role)
    )
  );

CREATE POLICY "Performer updates own interlink dispatch" ON public.interlink_dispatches
  FOR UPDATE TO authenticated
  USING (
    performed_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role)
  );

-- updated_at triggers
CREATE TRIGGER interlink_contacts_updated_at BEFORE UPDATE ON public.interlink_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER interlink_lists_updated_at BEFORE UPDATE ON public.interlink_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER TABLE public.interlink_dispatches REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.interlink_dispatches;

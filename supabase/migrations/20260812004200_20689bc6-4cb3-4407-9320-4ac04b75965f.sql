-- 1. Versioned templates, one active version per authorization status.
CREATE TABLE public.detention_bail_print_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_status text NOT NULL,
  version integer NOT NULL,
  label text NOT NULL,
  html text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (authorization_status, version)
);
CREATE UNIQUE INDEX detention_bail_print_templates_active_idx
  ON public.detention_bail_print_templates (authorization_status) WHERE is_active;

GRANT SELECT ON public.detention_bail_print_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.detention_bail_print_templates TO authenticated;
GRANT ALL ON public.detention_bail_print_templates TO service_role;
ALTER TABLE public.detention_bail_print_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Detention staff read bail templates"
ON public.detention_bail_print_templates FOR SELECT TO authenticated
USING (public.can_access_detention(auth.uid()));

CREATE POLICY "Command manage bail templates"
ON public.detention_bail_print_templates FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role));

CREATE TRIGGER trg_bail_templates_updated_at
BEFORE UPDATE ON public.detention_bail_print_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Immutable rendered documents (one row per generated print).
CREATE TABLE public.detention_bail_print_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bail_record_id uuid NOT NULL REFERENCES public.detention_bail_records(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.detention_bail_print_templates(id),
  template_version integer NOT NULL,
  authorization_status text NOT NULL,
  record_updated_at timestamptz,
  data_snapshot jsonb NOT NULL,
  rendered_html text NOT NULL,
  printed_by uuid,
  printed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX detention_bail_print_documents_record_idx
  ON public.detention_bail_print_documents (bail_record_id, printed_at DESC);

GRANT SELECT, INSERT ON public.detention_bail_print_documents TO authenticated;
GRANT ALL ON public.detention_bail_print_documents TO service_role;
ALTER TABLE public.detention_bail_print_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Detention staff read bail print documents"
ON public.detention_bail_print_documents FOR SELECT TO authenticated
USING (public.can_access_detention(auth.uid()));

CREATE POLICY "Detention staff record bail prints"
ON public.detention_bail_print_documents FOR INSERT TO authenticated
WITH CHECK (public.can_access_detention(auth.uid()) AND printed_by = auth.uid());

-- Printed documents are an archival record: never editable or deletable.
CREATE OR REPLACE FUNCTION public.block_bail_print_document_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Printed bail documents are immutable';
END;
$$;

CREATE TRIGGER trg_block_bail_print_document_mutation
BEFORE UPDATE OR DELETE ON public.detention_bail_print_documents
FOR EACH ROW EXECUTE FUNCTION public.block_bail_print_document_mutation();

-- 3. Seed version 1 of each status template. Placeholders are {{field}} tokens
-- filled from the stored bail record; {{#if x}}...{{/if}} blocks drop when empty.
INSERT INTO public.detention_bail_print_templates (authorization_status, version, label, html, notes)
VALUES
('pending', 1, 'Standard Bail Form — Pending authorization (v1)', $tpl$
<div class="doc">
  <div class="watermark">PENDING AUTHORIZATION</div>
  <h1>STANDARD BAIL FORM</h1>
  <p class="meta">Reference: {{reference}} · Granted: {{granted_at}} · Status: <strong>PENDING AUTHORIZATION</strong></p>
  <p class="notice">This form is NOT yet authorized. It is invalid for release until an authorizing officer signs below.</p>
  {{bailee_section}}
  {{terms_section}}
  {{surety_section}}
  <h2>Authorization</h2>
  <table>
    <tr><th>Status</th><td>PENDING</td></tr>
    <tr><th>Officer</th><td>{{authorized_officer}}</td></tr>
    <tr><th>Remarks</th><td>{{authorization_remarks}}</td></tr>
    <tr><th>Notes</th><td>{{notes}}</td></tr>
  </table>
  <div class="signatures">
    <div>_____________________________<br/>Bailee signature</div>
    <div>_____________________________<br/>Authorizing officer</div>
  </div>
  {{footer}}
</div>
$tpl$, 'Initial version'),
('authorized', 1, 'Standard Bail Form — Authorized (v1)', $tpl$
<div class="doc">
  <h1>STANDARD BAIL FORM</h1>
  <p class="meta">Reference: {{reference}} · Granted: {{granted_at}} · Status: <strong>AUTHORIZED</strong></p>
  <p class="notice authorized">Bail authorized. The bailee is released on the terms recorded below and must report as directed.</p>
  {{bailee_section}}
  {{terms_section}}
  {{surety_section}}
  <h2>Authorization</h2>
  <table>
    <tr><th>Status</th><td>AUTHORIZED</td></tr>
    <tr><th>Authorized by</th><td>{{authorized_officer}}</td></tr>
    <tr><th>Authorized at</th><td>{{authorized_at}}</td></tr>
    <tr><th>Remarks</th><td>{{authorization_remarks}}</td></tr>
    <tr><th>Notes</th><td>{{notes}}</td></tr>
  </table>
  <div class="signatures">
    <div>_____________________________<br/>Bailee signature</div>
    <div>_____________________________<br/>Surety signature{{surety_signature_suffix}}</div>
    <div>_____________________________<br/>Authorizing officer{{authorized_signature_suffix}}</div>
  </div>
  {{footer}}
</div>
$tpl$, 'Initial version'),
('declined', 1, 'Standard Bail Form — Declined (v1)', $tpl$
<div class="doc">
  <div class="watermark declined">DECLINED</div>
  <h1>STANDARD BAIL FORM</h1>
  <p class="meta">Reference: {{reference}} · Granted: {{granted_at}} · Status: <strong>DECLINED</strong></p>
  <p class="notice declined">Bail was DECLINED. The detainee remains in lawful custody. This form is retained for the record only.</p>
  {{bailee_section}}
  {{terms_section}}
  <h2>Decision</h2>
  <table>
    <tr><th>Status</th><td>DECLINED</td></tr>
    <tr><th>Decided by</th><td>{{authorized_officer}}</td></tr>
    <tr><th>Decided at</th><td>{{authorized_at}}</td></tr>
    <tr><th>Reason / remarks</th><td>{{authorization_remarks}}</td></tr>
    <tr><th>Notes</th><td>{{notes}}</td></tr>
  </table>
  <div class="signatures">
    <div>_____________________________<br/>Deciding officer{{authorized_signature_suffix}}</div>
  </div>
  {{footer}}
</div>
$tpl$, 'Initial version');
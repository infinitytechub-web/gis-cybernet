/**
 * Versioned Standard Bail print templates.
 *
 * Printing never builds ad-hoc markup any more: the active template for the
 * record's authorization status is fetched from the database, filled with a
 * snapshot of the stored record, and the rendered document is persisted in
 * `detention_bail_print_documents`. Re-printing an unchanged record replays the
 * stored HTML, so the paper output always matches the stored data/formatting.
 */
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { genderLabel, relationshipDisplay } from "@/components/detention/detention-options";

export type BailRecord = Record<string, any>;

export interface BailPrintTemplate {
  id: string;
  authorization_status: string;
  version: number;
  label: string;
  html: string;
}

const BAIL_TYPE_LABELS: Record<string, string> = {
  self_recognizance: "Self recognizance",
  cash: "Cash bail",
  surety: "Surety bail",
  property: "Property bond",
};

const PRINT_CSS = `
body{font-family:system-ui,Arial,sans-serif;padding:28px;color:#111}
h1{font-size:18px;margin:0 0 2px}
h2{font-size:13px;margin:12px 0 4px;border-bottom:1px solid #ccc;padding-bottom:2px}
p.meta{margin:0 0 12px;font-size:12px}
p.notice{font-size:11px;border:1px solid #999;padding:6px 8px;margin:0 0 12px}
p.notice.authorized{border-color:#15803d}
p.notice.declined{border-color:#b91c1c}
table{font-size:12px;width:100%;border-collapse:collapse}
th{text-align:left;padding:4px 10px 4px 0;width:220px;vertical-align:top;font-weight:600}
td{padding:4px 0;vertical-align:top}
.signatures{margin-top:36px;font-size:12px;display:flex;gap:48px;flex-wrap:wrap}
.doc{position:relative}
.watermark{position:fixed;top:42%;left:12%;font-size:64px;color:rgba(0,0,0,.07);transform:rotate(-24deg);pointer-events:none;letter-spacing:4px}
.footer{margin-top:28px;font-size:10px;text-align:center;color:#444}
@media print{@page{size:A4;margin:14mm}}
`;

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const dash = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? esc(s) : "—";
};

const dt = (v: unknown) => (v ? format(new Date(String(v)), "dd/MM/yyyy HH:mm") : "—");

const rows = (pairs: Array<[string, string]>) =>
  pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join("");

export function bailStatusKey(record: BailRecord): string {
  const s = String(record?.authorization_status ?? "pending").toLowerCase();
  return ["pending", "authorized", "declined"].includes(s) ? s : "pending";
}

/** Flat, pre-escaped value map used to fill `{{token}}` placeholders. */
export function buildBailPlaceholders(r: BailRecord): Record<string, string> {
  const name = `${r.bailee_first_name ?? ""} ${r.bailee_last_name ?? ""}`.trim();
  const amount = r.bail_amount
    ? `${esc(r.currency ?? "GHS")} ${Number(r.bail_amount).toLocaleString()}`
    : "—";

  const bailee = `<h2>Bailee</h2><table>${rows([
    ["Name", dash(name)],
    ["Gender / Nationality", `${dash(genderLabel(r.bailee_gender))} / ${dash(r.bailee_nationality)}`],
    ["Phone", dash(r.bailee_phone)],
    ["Address", dash(r.bailee_address)],
    ["Identification", `${dash(r.bailee_id_type)} ${esc(r.bailee_id_number ?? "")}`.trim()],
    ["Offence", dash(r.offence)],
  ])}</table>`;

  const terms = `<h2>Bail terms</h2><table>${rows([
    ["Type", dash(BAIL_TYPE_LABELS[r.bail_type] ?? r.bail_type)],
    ["Amount", amount],
    ["Conditions", dash(r.conditions)],
    ["Report station", dash(r.report_station)],
    ["Report back", esc(dt(r.report_back_at))],
  ])}</table>`;

  const surety = `<h2>Surety</h2><table>${rows([
    ["Name", dash(r.surety_name)],
    [
      "Relationship / Occupation",
      `${dash(relationshipDisplay(r.surety_relationship, r.surety_relationship_other))} / ${dash(r.surety_occupation)}`,
    ],
    ["Phone", dash(r.surety_phone)],
    ["Address", dash(r.surety_address)],
    ["Identification", `${dash(r.surety_id_type)} ${esc(r.surety_id_number ?? "")}`.trim()],
  ])}</table>`;

  return {
    reference: dash(r.reference),
    bailee_name: dash(name),
    granted_at: esc(dt(r.granted_at)),
    authorized_at: esc(dt(r.authorized_at)),
    authorized_officer: dash(`${r.authorized_by_rank ?? ""} ${r.authorized_by_name ?? ""}`.trim()),
    authorization_remarks: dash(r.authorization_remarks),
    notes: dash(r.notes),
    authorized_signature_suffix: r.authorized_signature_name ? ` (${esc(r.authorized_signature_name)})` : "",
    surety_signature_suffix: r.surety_name ? ` (${esc(r.surety_name)})` : "",
    bailee_section: bailee,
    terms_section: terms,
    surety_section: surety,
    footer: `<p class="footer">CONFIDENTIAL — Cybernet HRM System · printed ${esc(
      format(new Date(), "dd/MM/yyyy HH:mm"),
    )}</p>`,
  };
}

/** Replaces `{{token}}` placeholders; unknown tokens render as an em dash. */
export function renderBailTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : "—",
  );
}

export function wrapBailDocument(body: string, title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${body}</body></html>`;
}

export async function fetchActiveBailTemplate(status: string): Promise<BailPrintTemplate> {
  const { data, error } = await supabase
    .from("detention_bail_print_templates" as any)
    .select("id,authorization_status,version,label,html")
    .eq("authorization_status", status)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No active print template for status "${status}"`);
  return data as unknown as BailPrintTemplate;
}

/** Fields captured in the immutable snapshot stored with each printed document. */
const SNAPSHOT_SKIP = new Set(["created_by"]);

function snapshotOf(r: BailRecord) {
  const out: Record<string, any> = {};
  Object.keys(r)
    .sort()
    .forEach((k) => {
      if (!SNAPSHOT_SKIP.has(k)) out[k] = r[k];
    });
  return out;
}

export interface PreparedBailDocument {
  html: string;
  version: number;
  status: string;
  reused: boolean;
}

/**
 * Returns the printable document for a bail record, generating and storing a
 * new versioned document when none matches the record's current state.
 */
export async function prepareBailPrintDocument(
  record: BailRecord,
  printedBy: string | null | undefined,
): Promise<PreparedBailDocument> {
  const status = bailStatusKey(record);
  const template = await fetchActiveBailTemplate(status);

  // Replay an existing document when the record and template are unchanged.
  const existing = await supabase
    .from("detention_bail_print_documents" as any)
    .select("rendered_html,template_version")
    .eq("bail_record_id", record.id)
    .eq("authorization_status", status)
    .eq("template_version", template.version)
    .eq("record_updated_at", record.updated_at ?? null)
    .order("printed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing.error && existing.data) {
    const row = existing.data as any;
    return { html: row.rendered_html, version: row.template_version, status, reused: true };
  }

  const title = `Standard Bail Form — ${record.bailee_first_name ?? ""} ${record.bailee_last_name ?? ""}`.trim();
  const html = wrapBailDocument(
    renderBailTemplate(template.html, buildBailPlaceholders(record)),
    title,
  );

  const { error } = await supabase.from("detention_bail_print_documents" as any).insert({
    bail_record_id: record.id,
    template_id: template.id,
    template_version: template.version,
    authorization_status: status,
    record_updated_at: record.updated_at ?? null,
    data_snapshot: snapshotOf(record),
    rendered_html: html,
    printed_by: printedBy ?? null,
  } as any);
  if (error) throw error;

  return { html, version: template.version, status, reused: false };
}

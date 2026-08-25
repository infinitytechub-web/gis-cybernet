/**
 * Export helpers for the approval audit trail.
 *
 * - Streams the full filtered result-set from the `search_approval_audit`
 *   RPC in capped pages (max 200/server, 50/client default) so the browser
 *   never tries to load thousands of rows in one shot.
 * - Hard ceiling on total rows exported (`MAX_EXPORT_ROWS`) — prevents
 *   accidental denial-of-service from a single export click.
 * - Output formats: CSV (Blob, RFC-4180 quoted) and PDF (jsPDF + autoTable).
 *
 * The exported data is exactly the same as what's visible in the on-screen
 * timeline — same RLS, same filters, same pagination guarantee.
 */
import { supabase } from "@/integrations/supabase/client";
import { downloadBlob, downloadCSVString } from "@/lib/download-utils";
import { format } from "date-fns";

export type AuditEntityType = "leave_request" | "posting_transfer";

export interface AuditFilters {
  actions?: string[] | null;
  actorRoles?: string[] | null;
  from?: Date | null;
  to?: Date | null;
}

export interface AuditExportRow {
  id: string;
  action: string;
  actor_role: string | null;
  previous_status: string | null;
  new_status: string | null;
  changed_fields: Record<string, { old: unknown; new: unknown }> | null;
  notes: string | null;
  created_at: string;
  actor_first_name: string | null;
  actor_last_name: string | null;
  actor_rank_abbrev: string | null;
}

const PAGE_SIZE = 200;          // matches server-side cap
const MAX_EXPORT_ROWS = 5000;   // safety ceiling; well above any realistic single-record history

/**
 * Fetch every matching audit row, page by page, using keyset pagination.
 * Stops once the server returns a short page or MAX_EXPORT_ROWS is reached.
 */
export async function fetchAllAuditRows(
  entityType: AuditEntityType,
  entityId: string,
  filters: AuditFilters,
): Promise<AuditExportRow[]> {
  const all: AuditExportRow[] = [];
  let cursorCreated: string | null = null;
  let cursorId: string | null = null;

  // Limit the loop iterations defensively
  for (let i = 0; i < Math.ceil(MAX_EXPORT_ROWS / PAGE_SIZE); i++) {
    const { data, error } = await (supabase as any).rpc("search_approval_audit", {
      _entity_type: entityType,
      _entity_id: entityId,
      _actions: filters.actions && filters.actions.length ? filters.actions : null,
      _actor_roles: filters.actorRoles && filters.actorRoles.length ? filters.actorRoles : null,
      _from: filters.from ? filters.from.toISOString() : null,
      _to: filters.to ? filters.to.toISOString() : null,
      _cursor_created: cursorCreated,
      _cursor_id: cursorId,
      _limit: PAGE_SIZE,
    });
    if (error) throw error;

    const page = (data ?? []) as AuditExportRow[];
    all.push(...page);

    if (page.length < PAGE_SIZE) break;
    if (all.length >= MAX_EXPORT_ROWS) break;

    const last = page[page.length - 1];
    cursorCreated = last.created_at;
    cursorId = last.id;
  }

  return all.slice(0, MAX_EXPORT_ROWS);
}

function actorLabel(row: AuditExportRow): string {
  if (!row.actor_first_name && !row.actor_last_name) return "Unknown";
  const rank = row.actor_rank_abbrev ? `${row.actor_rank_abbrev} ` : "";
  return `${rank}${row.actor_first_name ?? ""} ${row.actor_last_name ?? ""}`.trim();
}

function changedFieldsSummary(row: AuditExportRow): string {
  const fields = row.changed_fields ?? {};
  return Object.entries(fields)
    .map(([k, v]) => `${k}: ${formatPrimitive(v.old)} → ${formatPrimitive(v.new)}`)
    .join("; ");
}

function formatPrimitive(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/** RFC-4180 CSV cell quoting + formula-injection sanitisation. */
import { csvCell } from "@/lib/csv-safe";

export async function exportAuditAsCSV(
  entityType: AuditEntityType,
  entityId: string,
  filters: AuditFilters,
  filenameBase = "approval-audit",
): Promise<{ count: number; truncated: boolean }> {
  const rows = await fetchAllAuditRows(entityType, entityId, filters);
  const truncated = rows.length >= MAX_EXPORT_ROWS;

  const headers = [
    "Timestamp",
    "Action",
    "Actor",
    "Actor Role",
    "Previous Status",
    "New Status",
    "Changed Fields",
    "Notes",
  ];
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
        r.action,
        actorLabel(r),
        r.actor_role ?? "",
        r.previous_status ?? "",
        r.new_status ?? "",
        changedFieldsSummary(r),
        r.notes ?? "",
      ].map(csvCell).join(","),
    );
  }

  // Add UTF-8 BOM so Excel opens it correctly
  const csv = "\uFEFF" + lines.join("\r\n");
  const filename = `${filenameBase}-${entityId.slice(0, 8)}-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
  downloadCSVString(csv, filename);
  return { count: rows.length, truncated };
}

export async function exportAuditAsPDF(
  entityType: AuditEntityType,
  entityId: string,
  filters: AuditFilters,
  filenameBase = "approval-audit",
): Promise<{ count: number; truncated: boolean }> {
  const rows = await fetchAllAuditRows(entityType, entityId, filters);
  const truncated = rows.length >= MAX_EXPORT_ROWS;

  // Lazy-load to keep the audit panel's initial bundle slim
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as any).default ?? autoTableMod;

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const title = entityType === "leave_request" ? "Leave / Pass Approval Audit Trail" : "Posting / Transfer Approval Audit Trail";
  doc.setFontSize(14);
  doc.text(title, 40, 40);

  // Filter summary header
  doc.setFontSize(9);
  const summaryParts: string[] = [];
  if (filters.actions?.length) summaryParts.push(`Actions: ${filters.actions.join(", ")}`);
  if (filters.actorRoles?.length) summaryParts.push(`Roles: ${filters.actorRoles.join(", ")}`);
  if (filters.from) summaryParts.push(`From: ${format(filters.from, "yyyy-MM-dd")}`);
  if (filters.to) summaryParts.push(`To: ${format(filters.to, "yyyy-MM-dd")}`);
  summaryParts.push(`Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`);
  doc.text(summaryParts.join("  ·  "), 40, 58);

  autoTable(doc, {
    startY: 75,
    head: [["When", "Action", "Actor", "Role", "Status", "Changes", "Notes"]],
    body: rows.map((r) => [
      format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
      r.action,
      actorLabel(r),
      (r.actor_role ?? "").toUpperCase(),
      r.previous_status && r.new_status && r.previous_status !== r.new_status
        ? `${r.previous_status} → ${r.new_status}`
        : (r.new_status ?? r.previous_status ?? ""),
      changedFieldsSummary(r),
      r.notes ?? "",
    ]),
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [22, 78, 47], textColor: 255 }, // deep green per brand
    columnStyles: {
      0: { cellWidth: 95 },
      1: { cellWidth: 70 },
      2: { cellWidth: 110 },
      3: { cellWidth: 55 },
      4: { cellWidth: 90 },
      5: { cellWidth: 200 },
      6: { cellWidth: "auto" },
    },
    didDrawPage: () => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.text(`CONFIDENTIAL · Page ${currentPage} of ${pageCount}`, 40, doc.internal.pageSize.getHeight() - 20);
    },
  });

  const filename = `${filenameBase}-${entityId.slice(0, 8)}-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`;
  const blob = doc.output("blob");
  downloadBlob(blob, filename);
  return { count: rows.length, truncated };
}

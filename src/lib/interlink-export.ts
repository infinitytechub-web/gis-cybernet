/**
 * Export helpers for the Interlink module — used by both the dispatches
 * audit log and the immutable approval-action log.
 *
 * Output formats: CSV (RFC-4180), Excel (.xlsx via SheetJS), and PDF
 * (jsPDF + autoTable). Operates strictly on already-fetched rows so the
 * exported set matches what's visible on screen and obeys the same RLS.
 */
import { downloadBlob, downloadCSVString } from "@/lib/download-utils";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCSV(headers: string[], rows: (string | number | null | undefined)[][]) {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

function ts() {
  return format(new Date(), "yyyyMMdd-HHmm");
}

// ─── Dispatch rows ────────────────────────────────────────────────────────────

export interface DispatchExportRow {
  created_at: string;
  subject: string;
  scope: string;
  report_kind: string | null;
  source: string | null;
  workflow_state: string | null;
  status: string;
  recipient_count: number;
  attachment_count: number;
  total_attachment_bytes: number;
  sent_count: number;
  failed_count: number;
  performer_label?: string;
}

const DISPATCH_HEADERS = [
  "Timestamp", "Subject", "Scope", "Report kind", "Source", "Workflow state",
  "Status", "Recipients", "Attachments", "Size (KB)", "Sent", "Failed", "Performed by",
];

function dispatchRowValues(r: DispatchExportRow) {
  return [
    format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
    r.subject,
    r.scope,
    r.report_kind ?? "",
    r.source ?? "manual",
    r.workflow_state ?? "",
    r.status,
    r.recipient_count,
    r.attachment_count,
    Math.round(r.total_attachment_bytes / 1024),
    r.sent_count,
    r.failed_count,
    r.performer_label ?? "",
  ];
}

export function exportDispatchesCSV(rows: DispatchExportRow[]) {
  const csv = buildCSV(DISPATCH_HEADERS, rows.map(dispatchRowValues));
  downloadCSVString(`interlink_dispatches_${ts()}.csv`, csv);
  return { count: rows.length };
}

export function exportDispatchesXLSX(rows: DispatchExportRow[]) {
  const data = [DISPATCH_HEADERS, ...rows.map(dispatchRowValues)];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 19 }, { wch: 36 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
                  { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 6 }, { wch: 6 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dispatches");
  XLSX.writeFile(wb, `interlink_dispatches_${ts()}.xlsx`);
  return { count: rows.length };
}

export function exportDispatchesJSON(rows: DispatchExportRow[]) {
  const payload = {
    exported_at: new Date().toISOString(),
    record_count: rows.length,
    type: "interlink_dispatches",
    rows,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, `interlink_dispatches_${ts()}.json`);
  return { count: rows.length };
}

export function exportDispatchesPDF(rows: DispatchExportRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text("Interlink Dispatch Log", 40, 40);
  doc.setFontSize(9);
  doc.text(`Generated ${format(new Date(), "dd/MM/yyyy HH:mm:ss")} • ${rows.length} record${rows.length === 1 ? "" : "s"}`, 40, 56);
  autoTable(doc, {
    startY: 70,
    head: [DISPATCH_HEADERS],
    body: rows.map((r) => dispatchRowValues(r).map((v) => String(v ?? ""))),
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.text("CONFIDENTIAL — Cybernet HRM System",
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 14, { align: "center" });
    },
  });
  doc.save(`interlink_dispatches_${ts()}.pdf`);
  return { count: rows.length };
}

// ─── Approval-action rows (immutable log) ─────────────────────────────────────

export interface ApprovalExportRow {
  created_at: string;
  dispatch_id: string;
  dispatch_subject?: string | null;
  action: string;
  performer_label?: string;
  performer_role: string | null;
  from_state: string | null;
  to_state: string | null;
  comment: string | null;
  entry_hash: string | null;
}

const APPROVAL_HEADERS = [
  "Timestamp", "Dispatch", "Subject", "Action", "Performed by", "Role",
  "From state", "To state", "Comment", "Hash",
];

function approvalRowValues(r: ApprovalExportRow) {
  return [
    format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
    r.dispatch_id.slice(0, 8),
    r.dispatch_subject ?? "",
    r.action,
    r.performer_label ?? "",
    r.performer_role ?? "",
    r.from_state ?? "",
    r.to_state ?? "",
    r.comment ?? "",
    r.entry_hash?.slice(0, 16) ?? "",
  ];
}

export function exportApprovalsCSV(rows: ApprovalExportRow[]) {
  const csv = buildCSV(APPROVAL_HEADERS, rows.map(approvalRowValues));
  downloadCSVString(`interlink_approvals_${ts()}.csv`, csv);
  return { count: rows.length };
}

export function exportApprovalsXLSX(rows: ApprovalExportRow[]) {
  const data = [APPROVAL_HEADERS, ...rows.map(approvalRowValues)];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 19 }, { wch: 10 }, { wch: 36 }, { wch: 18 }, { wch: 24 }, { wch: 16 },
                  { wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Approval log");
  XLSX.writeFile(wb, `interlink_approvals_${ts()}.xlsx`);
  return { count: rows.length };
}

export function exportApprovalsPDF(rows: ApprovalExportRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text("Interlink Approval Audit (immutable)", 40, 40);
  doc.setFontSize(9);
  doc.text(`Generated ${format(new Date(), "dd/MM/yyyy HH:mm:ss")} • ${rows.length} action${rows.length === 1 ? "" : "s"}`, 40, 56);
  autoTable(doc, {
    startY: 70,
    head: [APPROVAL_HEADERS],
    body: rows.map((r) => approvalRowValues(r).map((v) => String(v ?? ""))),
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.text("CONFIDENTIAL — Hash-chained audit log",
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 14, { align: "center" });
    },
  });
  doc.save(`interlink_approvals_${ts()}.pdf`);
  return { count: rows.length };
}

export function exportApprovalsJSON(rows: ApprovalExportRow[]) {
  const payload = {
    exported_at: new Date().toISOString(),
    record_count: rows.length,
    type: "interlink_approval_actions",
    notice: "Immutable hash-chained log — entry_hash truncated for display in CSV/PDF; JSON contains full hash.",
    rows,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, `interlink_approvals_${ts()}.json`);
  return { count: rows.length };
}

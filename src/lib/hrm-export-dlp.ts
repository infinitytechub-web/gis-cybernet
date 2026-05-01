// src/lib/hrm-export-dlp.ts
// Permission-gated, watermarked, audited HRM exports.
// Wrap any HRM PDF/CSV download with this helper.

import { supabase } from "@/integrations/supabase/client";
import { downloadBlob } from "@/lib/download-utils";

export interface HRMExportSettings {
  id: string;
  watermark_pdf: boolean;
  watermark_csv: boolean;
  block_non_command: boolean;
  classification_label: string;
}

export async function getHrmExportSettings(): Promise<HRMExportSettings | null> {
  const { data } = await supabase.from("hrm_export_settings").select("*").limit(1).maybeSingle();
  return (data as HRMExportSettings) ?? null;
}

export async function canExportHrm(kind: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_export_hrm", { _kind: kind });
  if (error) return false;
  return data === true;
}

async function logExport(opts: {
  kind: string;
  format: "pdf" | "csv" | "xlsx" | "json";
  subject: string;
  rowCount: number;
  watermarked: boolean;
  details?: Record<string, unknown>;
}) {
  const { error } = await supabase.rpc("log_hrm_export", {
    _kind: opts.kind,
    _format: opts.format,
    _subject: opts.subject,
    _row_count: opts.rowCount,
    _watermarked: opts.watermarked,
    _details: (opts.details ?? {}) as any,
  });
  if (error) throw error;
}

/**
 * Permission-gated CSV export with optional watermark header rows.
 * Returns false if the user is not allowed.
 */
export async function exportHrmCsv(opts: {
  kind: string;
  filename: string;
  headers: string[];
  rows: (string | number | null)[][];
  subject: string;
}): Promise<boolean> {
  if (!(await canExportHrm(opts.kind))) {
    throw new Error("You do not have permission to export this HRM data.");
  }
  const settings = await getHrmExportSettings();
  const watermark = !!settings?.watermark_csv;

  const lines: string[] = [];
  if (watermark) {
    lines.push(`# ${settings?.classification_label ?? "CONFIDENTIAL"}`);
    lines.push(`# Exported: ${new Date().toISOString()}`);
    lines.push(`# Subject: ${opts.subject}`);
    lines.push("");
  }
  lines.push(opts.headers.map(csvCell).join(","));
  for (const r of opts.rows) lines.push(r.map(csvCell).join(","));

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, opts.filename);

  await logExport({
    kind: opts.kind,
    format: "csv",
    subject: opts.subject,
    rowCount: opts.rows.length,
    watermarked: watermark,
  });
  return true;
}

/**
 * Permission-gated PDF wrapper. Caller passes a function that builds a jsPDF doc;
 * we apply diagonal watermark + classification footer when enabled.
 */
export async function exportHrmPdf(opts: {
  kind: string;
  filename: string;
  subject: string;
  rowCount: number;
  buildDoc: (doc: any, watermark: boolean, classification: string) => Promise<void> | void;
}): Promise<boolean> {
  if (!(await canExportHrm(opts.kind))) {
    throw new Error("You do not have permission to export this HRM data.");
  }
  const settings = await getHrmExportSettings();
  const watermark = !!settings?.watermark_pdf;
  const label = settings?.classification_label ?? "CONFIDENTIAL — GIS Internal";

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  await opts.buildDoc(doc, watermark, label);

  if (watermark) {
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      doc.saveGraphicsState?.();
      doc.setTextColor(220, 60, 60);
      doc.setFontSize(56);
      // diagonal watermark
      doc.text(label, w / 2, h / 2, { align: "center", angle: 35 });
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(8);
      doc.text(`Exported by user ${(await supabase.auth.getUser()).data.user?.email ?? ""} • ${new Date().toLocaleString()}`,
        w / 2, h - 6, { align: "center" });
      doc.restoreGraphicsState?.();
    }
  }

  doc.save(opts.filename);

  await logExport({
    kind: opts.kind,
    format: "pdf",
    subject: opts.subject,
    rowCount: opts.rowCount,
    watermarked: watermark,
  });
  return true;
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

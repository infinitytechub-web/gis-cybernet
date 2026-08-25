// CSV / PDF export helpers for security scan runs.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { downloadBlob } from "@/lib/download-utils";

export interface ExportFinding {
  check: string;
  severity: string;
  title: string;
  detail?: string;
  package?: string;
  currentVersion?: string;
  fixedVersion?: string;
  advisoryId?: string;
  advisoryUrl?: string;
}
export interface ExportRun {
  id: string;
  trigger_kind: string;
  status: string;
  total_checks: number;
  passed_count: number;
  warn_count: number;
  error_count: number;
  started_at: string;
  finished_at?: string | null;
  findings?: ExportFinding[];
}

import { csvCell } from "@/lib/csv-safe";

export function exportRunAsCsv(run: ExportRun, history: ExportRun[]) {
  const lines: string[] = [];
  lines.push("# Security Scan Report");
  lines.push(`# Run ID,${run.id}`);
  lines.push(`# Started,${run.started_at}`);
  lines.push(`# Trigger,${run.trigger_kind}`);
  lines.push(`# Status,${run.status}`);
  lines.push(
    `# Totals,${run.total_checks} checks; ${run.error_count} errors; ${run.warn_count} warnings; ${run.passed_count} info`,
  );
  lines.push("");
  lines.push("Severity,Check,Package,Current,Fixed In,Advisory,Advisory URL,Title,Recommendation");
  for (const f of run.findings ?? []) {
    lines.push(
      [
        csvCell(f.severity),
        csvCell(f.check),
        csvCell(f.package ?? ""),
        csvCell(f.currentVersion ?? ""),
        csvCell(f.fixedVersion ?? ""),
        csvCell(f.advisoryId ?? ""),
        csvCell(f.advisoryUrl ?? ""),
        csvCell(f.title),
        csvCell(f.detail ?? ""),
      ].join(","),
    );
  }
  lines.push("");
  lines.push("# Recent scan history");
  lines.push("Started,Trigger,Status,Checks,Errors,Warnings,Info");
  for (const h of history) {
    lines.push(
      [
        csvCell(h.started_at),
        csvCell(h.trigger_kind),
        csvCell(h.status),
        h.total_checks,
        h.error_count,
        h.warn_count,
        h.passed_count,
      ].join(","),
    );
  }
  const stamp = format(new Date(run.started_at), "yyyyMMdd-HHmm");
  downloadBlob(
    new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    `security-scan-${stamp}.csv`,
  );
}

export function exportRunAsPdf(run: ExportRun, history: ExportRun[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Security Scan Report", margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const meta: [string, string][] = [
    ["Run ID", run.id],
    ["Started", format(new Date(run.started_at), "dd/MM/yyyy HH:mm:ss")],
    ["Trigger", run.trigger_kind],
    ["Status", run.status],
    [
      "Totals",
      `${run.total_checks} checks · ${run.error_count} errors · ${run.warn_count} warnings · ${run.passed_count} info`,
    ],
  ];
  for (const [k, v] of meta) {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + 70, y);
    y += 14;
  }

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Findings", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Severity", "Package", "Current", "Fixed In", "Advisory", "Title / Recommendation"]],
    body: (run.findings ?? []).map((f) => {
      const advisoryLine = f.advisoryId
        ? `${f.advisoryId}${f.advisoryUrl ? `\n${f.advisoryUrl}` : ""}`
        : f.advisoryUrl ?? "";
      const titleBlock = [f.title, f.detail].filter(Boolean).join("\n");
      return [
        f.severity.toUpperCase(),
        f.package ?? "—",
        f.currentVersion ?? "—",
        f.fixedVersion ?? "—",
        advisoryLine || "—",
        titleBlock,
      ];
    }),
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [22, 101, 52], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 70 },
      2: { cellWidth: 55 },
      3: { cellWidth: 55 },
      4: { cellWidth: 110 },
    },
    margin: { left: margin, right: margin },
    didDrawCell: (data) => {
      // Make advisory URL clickable in column 4 (body rows only)
      if (data.section === "body" && data.column.index === 4) {
        const finding = (run.findings ?? [])[data.row.index];
        if (finding?.advisoryUrl) {
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, {
            url: finding.advisoryUrl,
          });
        }
      }
    },
  });

  let afterY = (doc as any).lastAutoTable?.finalY ?? y;
  if (afterY > 720) {
    doc.addPage();
    afterY = margin;
  }
  afterY += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Recent scan history", margin, afterY);

  autoTable(doc, {
    startY: afterY + 6,
    head: [["Started", "Trigger", "Status", "Checks", "Errors", "Warnings", "Info"]],
    body: history.map((h) => [
      format(new Date(h.started_at), "dd/MM/yyyy HH:mm"),
      h.trigger_kind,
      h.status,
      String(h.total_checks),
      String(h.error_count),
      String(h.warn_count),
      String(h.passed_count),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [22, 101, 52], textColor: 255 },
    margin: { left: margin, right: margin },
  });

  // Footer with page numbers / classification.
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `CONFIDENTIAL — Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 18,
      { align: "center" },
    );
  }

  const stamp = format(new Date(run.started_at), "yyyyMMdd-HHmm");
  doc.save(`security-scan-${stamp}.pdf`);
}

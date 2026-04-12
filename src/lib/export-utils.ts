import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { downloadCSVString, downloadBlob } from "@/lib/download-utils";

export type ExportFormat = "pdf" | "csv" | "excel" | "word";

interface ExportOptions {
  title: string;
  filename: string;
  headers: string[];
  rows: string[][];
  subtitle?: string;
}

function generatePDF({ title, filename, headers, rows, subtitle }: ExportOptions) {
  const doc = new jsPDF({ orientation: rows[0]?.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(16);
  doc.setTextColor(0, 102, 153);
  doc.text("GIS Amasaman Sector Command", 14, 15);
  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(title, 14, 23);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(subtitle, 14, 29);
  }
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: subtitle ? 34 : 28,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [0, 102, 153], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [240, 248, 255] },
    margin: { left: 14, right: 14 },
  });
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    const ph = doc.internal.pageSize.height;
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Page ${i} of ${pageCount}`, 14, ph - 8);
    doc.text("Powered by Infinity Techub Intelligence", doc.internal.pageSize.width - 14, ph - 8, { align: "right" });
  }
  doc.save(`${filename}.pdf`);
}

function generateCSV({ filename, headers, rows }: ExportOptions) {
  const csv = [
    headers.join(","),
    ...rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  downloadCSVString(csv, `${filename}.csv`);
}

function generateExcel({ filename, headers, rows, title }: ExportOptions) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function generateWord({ filename, title, headers, rows, subtitle }: ExportOptions) {
  const tableRows = rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td style="border:1px solid #ccc;padding:4px 8px;font-size:10pt">${c ?? ""}</td>`).join("")}</tr>`
    )
    .join("");
  const headerRow = `<tr>${headers.map((h) => `<th style="border:1px solid #006699;padding:4px 8px;background:#006699;color:#fff;font-size:10pt">${h}</th>`).join("")}</tr>`;

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; }
      table { border-collapse: collapse; width: 100%; }
      tr:nth-child(even) td { background: #f0f8ff; }
    </style></head>
    <body>
      <h2 style="color:#006699;margin:0">GIS Amasaman Sector Command</h2>
      <h3 style="color:#3c3c3c;margin:4px 0">${title}</h3>
      ${subtitle ? `<p style="color:#787878;font-size:9pt;margin:2px 0">${subtitle}</p>` : ""}
      <table>${headerRow}${tableRows}</table>
      <p style="font-size:7pt;color:#969696;margin-top:12px">Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Powered by Infinity Techub Intelligence</p>
    </body></html>`;

  const blob = new Blob([html], { type: "application/msword" });
  downloadBlob(blob, `${filename}.doc`);
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: "PDF",
  csv: "CSV",
  excel: "Excel",
  word: "Word",
};

export function getFormatLabel(fmt: ExportFormat) {
  return FORMAT_LABELS[fmt];
}

export function exportReport(fmt: ExportFormat, options: ExportOptions) {
  switch (fmt) {
    case "pdf":
      generatePDF(options);
      break;
    case "csv":
      generateCSV(options);
      break;
    case "excel":
      generateExcel(options);
      break;
    case "word":
      generateWord(options);
      break;
  }
}

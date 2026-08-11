// Heavy libs (jspdf, jspdf-autotable, xlsx) are dynamically imported inside
// generate* functions so they stay out of the initial page chunk for every
// route that statically imports `exportReport`. They only load when the
// user actually clicks Export.
import { format } from "date-fns";
import { downloadCSVString, downloadBlob } from "@/lib/download-utils";

export type ExportFormat = "pdf" | "csv" | "excel" | "word";

export interface ExportMetaField {
  label: string;
  value: string;
}

export interface ExportEmbeddedImage {
  /** PNG/JPEG data URL of the image. */
  dataUrl: string;
  /** Native pixel width — used to preserve aspect ratio in the PDF. */
  width: number;
  /** Native pixel height — used to preserve aspect ratio in the PDF. */
  height: number;
  /** Caption rendered below the image in the PDF. Optional. */
  caption?: string;
  /** Image format for jsPDF. Defaults to "PNG". */
  format?: "PNG" | "JPEG";
}

/**
 * Diagonal watermark stamped across every PDF page (snapshot + table). Used
 * for tamper-deterrence on intel exports — surfaces the authorising
 * officer's role and department on every page.
 */
export interface ExportWatermark {
  /** The watermark text. Rendered diagonally, repeated across the page. */
  text: string;
  /** Optional secondary text rendered below the main line. */
  secondary?: string;
}

/**
 * QR code rendered in the PDF footer (and inlined into print HTML by callers).
 * Encodes a verification URL pointing at the authorisation audit entry.
 */
export interface ExportQrCode {
  /** PNG data URL of the QR image. */
  dataUrl: string;
  /** Caption shown next to the QR (e.g., "Scan to verify authorisation"). */
  caption?: string;
}

interface ExportOptions {
  title: string;
  filename: string;
  headers: string[];
  rows: string[][];
  subtitle?: string;
  /**
   * Optional structured header rendered above the table in every export
   * format. Use to surface report context such as period, active filters,
   * and the generated-at timestamp.
   */
  meta?: ExportMetaField[];
  /**
   * Optional image embedded above the table in the PDF export (e.g., an
   * offline coordinate snapshot for Search & Track results). Other formats
   * gracefully ignore this field.
   */
  image?: ExportEmbeddedImage;
  /**
   * Optional diagonal watermark stamped across every PDF page. Other formats
   * gracefully ignore this field.
   */
  watermark?: ExportWatermark;
  /**
   * Optional tamper-evident QR code rendered in the PDF footer. Other formats
   * gracefully ignore this field.
   */
  qr?: ExportQrCode;
}

async function generatePDF({ title, filename, headers, rows, subtitle, meta, image, watermark, qr }: ExportOptions) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: rows[0]?.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(16);
  doc.setTextColor(0, 102, 153);
  doc.text("Cybernet HRM System", 14, 15);
  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(title, 14, 23);

  let cursorY = 28;
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(subtitle, 14, cursorY + 1);
    cursorY += 6;
  }
  if (meta && meta.length > 0) {
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    cursorY += 2;
    for (const m of meta) {
      doc.setFont(undefined, "bold");
      doc.text(`${m.label}:`, 14, cursorY);
      const labelWidth = doc.getTextWidth(`${m.label}:`) + 2;
      doc.setFont(undefined, "normal");
      doc.text(m.value, 14 + labelWidth, cursorY);
      cursorY += 4.5;
    }
    cursorY += 1;
  }

  // Optional embedded image (e.g., offline coordinate snapshot). Scaled to fit
  // a reasonable width while preserving the source aspect ratio.
  if (image && image.dataUrl) {
    try {
      const pageWidth = doc.internal.pageSize.getWidth();
      const maxWidthMm = Math.min(pageWidth - 28, 120);
      const aspect = image.height && image.width ? image.height / image.width : 0.6;
      const drawWidth = maxWidthMm;
      const drawHeight = drawWidth * aspect;
      cursorY += 2;
      doc.addImage(image.dataUrl, image.format ?? "PNG", 14, cursorY, drawWidth, drawHeight);
      cursorY += drawHeight + 2;
      if (image.caption) {
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(image.caption, 14, cursorY);
        cursorY += 4;
      }
      cursorY += 2;
    } catch {
      // Silently skip — table still renders below.
    }
  }

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: cursorY + 2,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [0, 102, 153], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [240, 248, 255] },
    margin: { left: 14, right: 14 },
  });
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Diagonal watermark — drawn BEFORE footer so footer text stays legible.
    if (watermark?.text) {
      try {
        doc.saveGraphicsState();
        const anyDoc = doc as any;
        if (typeof anyDoc.GState === "function" && typeof anyDoc.setGState === "function") {
          anyDoc.setGState(new anyDoc.GState({ opacity: 0.08 }));
        }
        doc.setTextColor(40, 40, 40);
        doc.setFont(undefined, "bold");
        doc.setFontSize(46);
        doc.text(watermark.text, pageWidth / 2, pageHeight / 2, { align: "center", angle: 45 });
        if (watermark.secondary) {
          doc.setFontSize(18);
          doc.text(watermark.secondary, pageWidth / 2, pageHeight / 2 + 18, { align: "center", angle: 45 });
        }
        doc.setFont(undefined, "normal");
        doc.restoreGraphicsState();
      } catch {
        // Watermark is best-effort — never block the export.
      }
    }

    // Footer band: timestamp on left, attribution + optional QR on right.
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Page ${i} of ${pageCount}`, 14, pageHeight - 8);
    doc.text("Powered by Infinity Techub Intelligence", pageWidth - 14, pageHeight - 8, { align: "right" });

    if (qr?.dataUrl) {
      try {
        const qrSize = 22; // mm — small enough to nestle in the footer
        const qrX = pageWidth - 14 - qrSize;
        const qrY = pageHeight - 14 - qrSize;
        doc.addImage(qr.dataUrl, "PNG", qrX, qrY, qrSize, qrSize);
        if (qr.caption) {
          doc.setFontSize(6);
          doc.setTextColor(110, 110, 110);
          doc.text(qr.caption, qrX - 2, qrY + qrSize / 2, { align: "right", maxWidth: 50 });
        }
      } catch {
        // Skip silently — footer text already identifies the export.
      }
    }
  }
  doc.save(`${filename}.pdf`);
}

function generateCSV({ filename, headers, rows, title, subtitle, meta }: ExportOptions) {
  const escape = (c: string) => `"${(c ?? "").replace(/"/g, '""')}"`;
  const lines: string[] = [];
  lines.push(escape("Cybernet HRM System"));
  lines.push(escape(title));
  if (subtitle) lines.push(escape(subtitle));
  if (meta && meta.length > 0) {
    for (const m of meta) lines.push([escape(m.label), escape(m.value)].join(","));
  }
  lines.push(escape(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`));
  lines.push("");
  lines.push(headers.map(escape).join(","));
  rows.forEach((r) => lines.push(r.map(escape).join(",")));
  downloadCSVString(lines.join("\n"), `${filename}.csv`);
}

async function generateExcel({ filename, headers, rows, title, subtitle, meta }: ExportOptions) {
  const XLSX = await import("xlsx");
  const aoa: string[][] = [];
  aoa.push(["Cybernet HRM System"]);
  aoa.push([title]);
  if (subtitle) aoa.push([subtitle]);
  if (meta && meta.length > 0) {
    for (const m of meta) aoa.push([m.label, m.value]);
  }
  aoa.push([`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`]);
  aoa.push([]);
  aoa.push(headers);
  rows.forEach((r) => aoa.push(r));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 28 }, { wch: 60 }, ...headers.slice(2).map(() => ({ wch: 18 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function generateWord({ filename, title, headers, rows, subtitle, meta }: ExportOptions) {
  const tableRows = rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td style="border:1px solid #ccc;padding:4px 8px;font-size:10pt">${c ?? ""}</td>`).join("")}</tr>`
    )
    .join("");
  const headerRow = `<tr>${headers.map((h) => `<th style="border:1px solid #006699;padding:4px 8px;background:#006699;color:#fff;font-size:10pt">${h}</th>`).join("")}</tr>`;

  const metaHtml = meta && meta.length > 0
    ? `<table style="border-collapse:collapse;margin:8px 0 12px 0;font-size:10pt">
        ${meta.map((m) => `<tr>
          <td style="padding:2px 12px 2px 0;color:#475569;font-weight:bold;vertical-align:top">${m.label}</td>
          <td style="padding:2px 0;color:#0f172a">${m.value}</td>
        </tr>`).join("")}
      </table>`
    : "";

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; }
      table.data { border-collapse: collapse; width: 100%; }
      table.data tr:nth-child(even) td { background: #f0f8ff; }
    </style></head>
    <body>
      <h2 style="color:#006699;margin:0">Cybernet HRM System</h2>
      <h3 style="color:#3c3c3c;margin:4px 0">${title}</h3>
      ${subtitle ? `<p style="color:#787878;font-size:9pt;margin:2px 0">${subtitle}</p>` : ""}
      ${metaHtml}
      <table class="data">${headerRow}${tableRows}</table>
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

export async function exportReport(fmt: ExportFormat, options: ExportOptions) {
  switch (fmt) {
    case "pdf":
      await generatePDF(options);
      break;
    case "csv":
      generateCSV(options);
      break;
    case "excel":
      await generateExcel(options);
      break;
    case "word":
      generateWord(options);
      break;
  }
}

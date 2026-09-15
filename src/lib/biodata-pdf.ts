/**
 * PRINTABLE BIO-DATA & SERVICE RECORD (sections A–L) — PDF renderer.
 *
 * Renders the shared record structure built by `buildBioDataRecord`, so the
 * PDF, Word, Excel and CSV copies always contain exactly the same information.
 * Restricted sections (medical & welfare, bank / salary) are only present when
 * the database allows the reader; every included restricted section is recorded
 * in the access log by the shared helper.
 */
import { format } from "date-fns";
import {
  buildBioDataRecord,
  logBioDataRestrictedSections,
  bioDataFileBase,
  txt,
  type BioDataRecord,
} from "@/lib/biodata-record";

/** Renders an assembled record to an A4 PDF and saves it. */
export async function renderBioDataPdf(record: BioDataRecord, fileBase: string): Promise<void> {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as any).default ?? autoTableMod;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 46;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("PERSONNEL BIO-DATA & SERVICE RECORD", pageWidth / 2, y, { align: "center" });
  y += 16;
  doc.setFontSize(9);
  doc.setTextColor(150, 30, 30);
  doc.text("CONFIDENTIAL — FOR OFFICIAL USE ONLY", pageWidth / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `${record.fullName || "Unnamed"}   ·   Staff ID: ${record.staffId}   ·   Printed ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
    pageWidth / 2, y, { align: "center" },
  );
  y += 12;

  const keepTogether = (rowCount: number) => {
    const needed = 40 + Math.min(rowCount || 1, 3) * 16;
    if (y + needed > pageHeight - 60) {
      doc.addPage();
      y = 40;
    }
  };

  for (const s of record.sections) {
    const label = `${s.letter}. ${s.title}${s.note ? ` — ${s.note}` : ""}`;
    if (s.kind === "pairs") {
      keepTogether(s.pairs.length);
      autoTable(doc, {
        startY: y + 10,
        head: [[label, ""]],
        body: s.pairs.map(([k, v]) => [String(k), txt(v)]),
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [23, 64, 45], textColor: 255, fontSize: 9 },
        columnStyles: { 0: { cellWidth: 180, fontStyle: "bold" }, 1: { cellWidth: "auto" } },
        margin: { left: 36, right: 36 },
      });
    } else {
      keepTogether(s.rows.length);
      autoTable(doc, {
        startY: y + 10,
        head: [
          [{ content: label, colSpan: Math.max(s.head.length, 1), styles: { halign: "left" } }],
          s.head,
        ],
        body: s.rows.length ? s.rows : [s.head.map(() => "—")],
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [23, 64, 45], textColor: 255, fontSize: 9 },
        margin: { left: 36, right: 36 },
      });
    }
    y = (doc as any).lastAutoTable.finalY;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `CONFIDENTIAL — FOR OFFICIAL USE ONLY   ·   ${record.fullName} (${record.staffId})   ·   Page ${i} of ${pages}`,
      pageWidth / 2, pageHeight - 18, { align: "center" },
    );
  }

  doc.save(`${fileBase}.pdf`);
}

/** Backwards-compatible entry point: fetch + render + log in one call. */
export async function exportBioDataPdf(profileId: string): Promise<void> {
  const record = await buildBioDataRecord(profileId);
  await renderBioDataPdf(record, bioDataFileBase(record));
  logBioDataRestrictedSections(profileId, record, "pdf");
}

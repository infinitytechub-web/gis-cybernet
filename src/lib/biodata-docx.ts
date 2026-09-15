/**
 * PERSONNEL BIO-DATA & SERVICE RECORD — Word (.docx) builder.
 *
 * Renders the shared record structure (sections A–L) as an Office Open XML
 * document so the record can be filed or forwarded in a format every office
 * suite reads. Heavy library loaded on demand by the caller.
 */
import { format } from "date-fns";
import type { BioDataRecord, BioDataSection } from "@/lib/biodata-record";
import { txt } from "@/lib/biodata-record";

const CONTENT_WIDTH = 9360; // US Letter, 1" margins

export async function buildBioDataDocxBlob(record: BioDataRecord): Promise<Blob> {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, ShadingType, AlignmentType, Footer, PageNumber,
  } = await import("docx");

  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 80, bottom: 80, left: 120, right: 120 };

  const cell = (text: string, width: number, opts?: { bold?: boolean; fill?: string }) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      borders,
      margins,
      shading: opts?.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
      children: [new Paragraph({ children: [new TextRun({ text, bold: opts?.bold })] })],
    });

  const heading = (s: BioDataSection) =>
    new Paragraph({
      spacing: { before: 240, after: 100 },
      children: [
        new TextRun({
          text: `${s.letter}. ${s.title}${s.note ? ` — ${s.note}` : ""}`,
          bold: true,
          size: 24,
          color: "17402D",
        }),
      ],
    });

  const blocks: any[] = [];

  for (const s of record.sections) {
    blocks.push(heading(s));
    if (s.kind === "pairs") {
      const labelW = 3200;
      const valueW = CONTENT_WIDTH - labelW;
      blocks.push(
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [labelW, valueW],
          rows: (s.pairs.length ? s.pairs : ([["—", "—"]] as any))
            .map(([k, v]: any, i: number) =>
              new TableRow({
                children: [
                  cell(String(k), labelW, { bold: true, fill: i % 2 === 0 ? "F1F5F9" : undefined }),
                  cell(txt(v), valueW),
                ],
              }),
            ),
        }),
      );
    } else {
      const cols = Math.max(s.head.length, 1);
      const w = Math.floor(CONTENT_WIDTH / cols);
      const widths = Array.from({ length: cols }, (_, i) =>
        i === cols - 1 ? CONTENT_WIDTH - w * (cols - 1) : w);
      const body = s.rows.length ? s.rows : [s.head.map(() => "—")];
      blocks.push(
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: widths,
          rows: [
            new TableRow({
              tableHeader: true,
              children: s.head.map((h, i) => cell(h, widths[i], { bold: true, fill: "E2E8E4" })),
            }),
            ...body.map((r) =>
              new TableRow({ children: widths.map((wd, i) => cell(txt(r[i]), wd)) })),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `CONFIDENTIAL — FOR OFFICIAL USE ONLY · ${record.fullName} (${record.staffId}) · Page `,
                    size: 14,
                    color: "64748B",
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "64748B" }),
                  new TextRun({ text: " of ", size: 14, color: "64748B" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: "64748B" }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "PERSONNEL BIO-DATA & SERVICE RECORD", bold: true, size: 28 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "CONFIDENTIAL — FOR OFFICIAL USE ONLY", bold: true, size: 18, color: "961E1E" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `${record.fullName || "Unnamed"} · Staff ID: ${record.staffId} · Printed ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
                size: 18,
                color: "64748B",
              }),
            ],
          }),
          ...blocks,
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

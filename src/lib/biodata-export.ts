/**
 * One entry point for downloading a personnel bio-data record in any of the
 * internationally recognised office formats. The record is fetched once by the
 * shared builder; only the library for the chosen format is loaded, so opening
 * a staff form ships none of jspdf / docx / xlsx.
 */
import {
  buildBioDataRecord,
  bioDataFileBase,
  logBioDataRestrictedSections,
} from "@/lib/biodata-record";
import { downloadBlob, downloadCSVString } from "@/lib/download-utils";

export type BioDataFormat = "pdf" | "word" | "excel" | "csv";

export const BIODATA_FORMAT_LABELS: Record<BioDataFormat, string> = {
  pdf: "PDF (.pdf)",
  word: "Word (.docx)",
  excel: "Excel (.xlsx)",
  csv: "CSV (.csv)",
};

export async function downloadBioDataRecord(
  profileId: string,
  fmt: BioDataFormat,
): Promise<void> {
  const record = await buildBioDataRecord(profileId);
  const base = bioDataFileBase(record);

  if (fmt === "pdf") {
    const { renderBioDataPdf } = await import("@/lib/biodata-pdf");
    await renderBioDataPdf(record, base);
  } else if (fmt === "word") {
    const { buildBioDataDocxBlob } = await import("@/lib/biodata-docx");
    downloadBlob(await buildBioDataDocxBlob(record), `${base}.docx`);
  } else if (fmt === "excel") {
    const { buildBioDataXlsxBlob } = await import("@/lib/biodata-xlsx");
    downloadBlob(await buildBioDataXlsxBlob(record), `${base}.xlsx`);
  } else {
    const { buildBioDataCsv } = await import("@/lib/biodata-csv");
    downloadCSVString(buildBioDataCsv(record), `${base}.csv`);
  }

  logBioDataRestrictedSections(profileId, record, fmt);
}

import { describe, it, expect, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { buildBioDataRecord } from "@/lib/biodata-record";
import { buildBioDataCsv } from "@/lib/biodata-csv";
import { buildBioDataDocxBlob } from "@/lib/biodata-docx";
import { buildBioDataXlsxBlob } from "@/lib/biodata-xlsx";
import { renderBioDataPdf } from "@/lib/biodata-pdf";
import { formatPeriodDate } from "@/lib/date-format";
import JSZip from "jszip";
import * as XLSX from "xlsx";

const pdfOutput = vi.hoisted(() => ({ text: "" }));
vi.mock("jspdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jspdf")>();
  return { ...actual, default: class extends actual.default {
    constructor(...args: ConstructorParameters<typeof actual.default>) {
      super(...args);
      Object.defineProperty(this, "save", { value: () => { pdfOutput.text = this.output(); return this; } });
    }
  } };
});

const fixture: Record<string, unknown> = {
  profiles: { first_name: "TEST", last_name: "OFFICER", staff_id: "TEST-DATES", date_of_birth: "1990-01-02", date_of_appointment: "2020-11-23", date_joined_service: "2019-03-14", form_completed_on: "2026-11-23" },
  staff_education: [{ institution: "Test school", from_date: "2006-09-14", to_date: "2010" }],
  staff_employment_history: [{ employer: "Test employer", from_date: "2011-01-02", to_date: "Present" }],
  biodata_custom_fields: [{ id: "date-field", section: "B", label: "Review date", field_type: "date" }],
  biodata_custom_values: [{ field_id: "date-field", value: "2026-12-04" }],
  biodata_custom_tables: [{ id: "date-table", section: "B", label: "Training", biodata_custom_columns: [{ id: "training-date", label: "Training date", column_type: "date" }] }],
  biodata_custom_rows: [{ table_id: "date-table", values: { "training-date": "2026-11-14" } }],
  postings_transfers: [{ effective_date: "2026-10-03" }],
  staff_biodata_verifications: [{ kind: "declaration", signed_on: "2026-11-23" }],
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    const query: any = { then: (resolve: any) => Promise.resolve({ data: fixture[table] ?? [], error: null }).then(resolve) };
    for (const method of ["select", "eq", "order", "maybeSingle"]) query[method] = () => query;
    return query;
  } },
}));

describe("personnel dates in generated downloads and printouts", () => {
  const expected = ["02/01/1990", "23/11/2020", "14/03/2019", "14/09/2006", "02/01/2011", "04/12/2026", "14/11/2026", "03/10/2026", "23/11/2026"];
  const assertDates = (text: string) => {
    for (const date of expected) expect(text).toContain(date);
    expect(text).not.toMatch(/\b(?:1990-01-02|2006-09-14|2026-11-23)\b/);
  };

  it("formats the shared record and CSV without changing stored dates", async () => {
    assertDates(buildBioDataCsv(await buildBioDataRecord("test-profile")));
    expect((fixture.profiles as any).date_of_birth).toBe("1990-01-02");
  });

  it("preserves year-only and ongoing education/employment periods", () => {
    expect(formatPeriodDate("2010")).toBe("2010");
    expect(formatPeriodDate("Present")).toBe("Present");
    expect(formatPeriodDate("2011-01-02")).toBe("02/01/2011");
  });

  it("writes DD/MM/YYYY text into actual Word documents", async () => {
    vi.stubGlobal("Blob", NodeBlob);
    try {
      const blob = await buildBioDataDocxBlob(await buildBioDataRecord("test-profile"));
      const archive = await JSZip.loadAsync(await blob.arrayBuffer());
      const document = archive.file("word/document.xml");
      if (!document) throw new Error("Word document is missing its content");
      assertDates(await document.async("string"));
    } finally { vi.unstubAllGlobals(); }
  });

  it("writes DD/MM/YYYY strings into actual Excel cells", async () => {
    vi.stubGlobal("Blob", NodeBlob);
    try {
      const blob = await buildBioDataXlsxBlob(await buildBioDataRecord("test-profile"));
      const workbook = XLSX.read(await blob.arrayBuffer(), { type: "array" });
      const text = workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join("\n");
      assertDates(text);
    } finally { vi.unstubAllGlobals(); }
  });

  it("renders DD/MM/YYYY in the printable PDF", async () => {
    await renderBioDataPdf(await buildBioDataRecord("test-profile"), "test-dates");
    assertDates(pdfOutput.text);
  });
});
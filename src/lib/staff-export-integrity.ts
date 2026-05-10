/**
 * Automated integrity checks for all Staff / Employees export & download routes.
 *
 * Each check exercises the real generator used by the app, intercepts the file
 * before it leaves the browser, and verifies:
 *   • the produced Blob has the expected MIME type (or magic-byte signature)
 *   • the size is within a sane minimum/maximum window for that artifact
 *
 * No actual download is triggered — anchor clicks and object-URL revokes are
 * stubbed for the duration of the run.
 */
import jsPDF from "jspdf";
import { generateLeaveLetter, generatePostingLetter } from "@/lib/branded-letter-pdf";
import { downloadExcuseDutyPDF, downloadExcuseDutyDOCX, type ExcuseDutyData } from "@/lib/excuse-duty-templates";
import { exportReport } from "@/lib/export-utils";

export type IntegrityStatus = "pass" | "warn" | "fail";

export interface IntegrityCheck {
  route: string;          // human-friendly route / action
  artifact: string;       // file kind, e.g. "PDF", "DOCX", "CSV"
  expectedMime: string;   // MIME we expect the Blob to advertise
  filename?: string;      // captured filename (if available)
  actualMime?: string;
  size?: number;          // bytes
  status: IntegrityStatus;
  message: string;
  durationMs: number;
}

const MIN_BYTES: Record<string, number> = {
  pdf: 1024,    // jsPDF empty doc ≈ 1KB
  docx: 1500,   // docx zip overhead
  csv: 16,
  xlsx: 1500,
  doc: 200,     // HTML masquerading as .doc
};

const MAX_BYTES = 25 * 1024 * 1024; // 25MB ceiling — anything larger is suspicious

const SIGNATURES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46],            // %PDF
  docx: [0x50, 0x4b, 0x03, 0x04],           // PK\x03\x04 (zip)
  xlsx: [0x50, 0x4b, 0x03, 0x04],
};

async function hasSignature(blob: Blob, kind: keyof typeof SIGNATURES): Promise<boolean> {
  const sig = SIGNATURES[kind];
  if (!sig) return true;
  const buf = new Uint8Array(await blob.slice(0, sig.length).arrayBuffer());
  return sig.every((b, i) => buf[i] === b);
}

interface Captured {
  blob: Blob;
  filename?: string;
}

/**
 * Run `fn` with download interception. Returns every Blob the code attempted
 * to save during the call. Restores all monkey-patches on exit (even on throw).
 */
async function captureDownloads(fn: () => void | Promise<void>): Promise<Captured[]> {
  const captured: Captured[] = [];
  const blobByUrl = new Map<string, Blob>();

  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  const origClick = HTMLAnchorElement.prototype.click;
  // jsPDF's `save` ultimately uses `<a>.click()` + URL.createObjectURL, so the
  // same patches catch it.

  URL.createObjectURL = ((obj: Blob | MediaSource) => {
    const url = `blob:integrity-check/${captured.length}-${Math.random().toString(36).slice(2)}`;
    if (obj instanceof Blob) blobByUrl.set(url, obj);
    return url;
  }) as typeof URL.createObjectURL;

  URL.revokeObjectURL = (url: string) => { blobByUrl.delete(url); };

  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const href = this.getAttribute("href") || "";
    const blob = blobByUrl.get(href);
    if (blob) captured.push({ blob, filename: this.getAttribute("download") || undefined });
    // do NOT call original — we don't want the browser to actually download
  };

  try {
    await fn();
    // Allow micro-tasks/setTimeouts inside generators to flush.
    await new Promise(r => setTimeout(r, 30));
  } finally {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    HTMLAnchorElement.prototype.click = origClick;
  }

  return captured;
}

function verify(
  route: string,
  artifact: string,
  expectedMime: string,
  blob: Blob | undefined,
  filename: string | undefined,
  startedAt: number,
  sigKind?: keyof typeof SIGNATURES,
): Promise<IntegrityCheck> {
  return (async () => {
    const durationMs = Math.round(performance.now() - startedAt);
    if (!blob) {
      return { route, artifact, expectedMime, status: "fail", message: "No file was produced.", durationMs };
    }
    const size = blob.size;
    const actualMime = blob.type || "(unset)";
    const minBytes = MIN_BYTES[artifact.toLowerCase()] ?? 64;

    const issues: string[] = [];
    if (expectedMime && blob.type && !blob.type.toLowerCase().includes(expectedMime.split("/")[1])) {
      issues.push(`MIME mismatch (got "${actualMime}", expected "${expectedMime}")`);
    }
    if (size < minBytes) issues.push(`File too small: ${size}B < ${minBytes}B floor`);
    if (size > MAX_BYTES) issues.push(`File too large: ${size}B > ${MAX_BYTES}B ceiling`);
    if (sigKind) {
      const ok = await hasSignature(blob, sigKind);
      if (!ok) issues.push(`Magic-byte signature for ${sigKind.toUpperCase()} missing`);
    }

    return {
      route, artifact, expectedMime,
      filename, actualMime, size, durationMs,
      status: issues.length === 0 ? "pass" : "fail",
      message: issues.length === 0 ? "OK" : issues.join("; "),
    };
  })();
}

const SAMPLE_EXCUSE: ExcuseDutyData = {
  staff_name: "Integrity Test", rank: "Inspector", staff_id: "TEST-001",
  directorate: "Cybernet", office: "QA Lab",
  start_date: new Date().toISOString(), end_date: new Date().toISOString(),
  doctor_name: "Dr Test", facility: "GIS Clinic",
  diagnosis: "Sample", reason: "Self-test", recommendation: "N/A",
  status: "approved", reviewer_name: "Reviewer", reviewer_rank: "OIC",
  reviewed_at: new Date().toISOString(),
  authorised_by: "Authoriser", authorised_rank: "2IC",
  authorised_at: new Date().toISOString(),
};

const SAMPLE_ROWS: string[][] = Array.from({ length: 5 }, (_, i) => [
  `TEST-${i + 1}`, "Test Officer", "Inspector", "Cybernet", "Active",
]);

const SAMPLE_EXPORT = {
  title: "Staff Export — Integrity Check",
  filename: "integrity_staff_export",
  headers: ["Staff ID", "Name", "Rank", "Department", "Status"],
  rows: SAMPLE_ROWS,
};

/** Run the full Staff/Employees export integrity sweep. */
export async function runStaffExportIntegrityChecks(): Promise<IntegrityCheck[]> {
  const results: IntegrityCheck[] = [];

  const cases: Array<{
    route: string; artifact: string; expectedMime: string;
    sig?: keyof typeof SIGNATURES;
    run: () => void | Promise<void>;
  }> = [
    {
      route: "Excuse Duty Form › Export PDF (filled)",
      artifact: "pdf", expectedMime: "application/pdf", sig: "pdf",
      run: () => downloadExcuseDutyPDF(SAMPLE_EXCUSE, false),
    },
    {
      route: "Excuse Duty Form › Blank PDF template",
      artifact: "pdf", expectedMime: "application/pdf", sig: "pdf",
      run: () => downloadExcuseDutyPDF({}, true),
    },
    {
      route: "Excuse Duty Form › Export Word (filled)",
      artifact: "docx",
      expectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sig: "docx",
      run: () => downloadExcuseDutyDOCX(SAMPLE_EXCUSE, false),
    },
    {
      route: "Excuse Duty Form › Blank Word template",
      artifact: "docx",
      expectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sig: "docx",
      run: () => downloadExcuseDutyDOCX({}, true),
    },
    {
      route: "Staff Portal › Leave letter PDF",
      artifact: "pdf", expectedMime: "application/pdf", sig: "pdf",
      run: () => {
        const doc = generateLeaveLetter({
          staffName: "Integrity Test", staffId: "TEST-001", rank: "Inspector",
          department: "Cybernet", type: "Annual",
          startDate: new Date().toISOString(), endDate: new Date().toISOString(),
          days: 1, status: "approved", approverName: "QA Officer",
        });
        doc.save("leave-test.pdf");
      },
    },
    {
      route: "Staff Portal › Posting letter PDF",
      artifact: "pdf", expectedMime: "application/pdf", sig: "pdf",
      run: () => {
        const doc = generatePostingLetter({
          staffName: "Integrity Test", staffId: "TEST-001", rank: "Inspector",
          fromDepartment: "Cybernet", toDepartment: "MISD",
          effectiveDate: new Date().toISOString(),
          status: "approved", approverName: "QA Officer",
        });
        doc.save("posting-test.pdf");
      },
    },
    {
      route: "Staff Directory › Export PDF",
      artifact: "pdf", expectedMime: "application/pdf", sig: "pdf",
      run: () => exportReport("pdf", SAMPLE_EXPORT),
    },
    {
      route: "Staff Directory › Export CSV",
      artifact: "csv", expectedMime: "text/csv",
      run: () => exportReport("csv", SAMPLE_EXPORT),
    },
    {
      route: "Staff Directory › Export Excel (.xlsx)",
      artifact: "xlsx",
      expectedMime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sig: "xlsx",
      run: () => exportReport("excel", SAMPLE_EXPORT),
    },
    {
      route: "Staff Directory › Export Word (.doc)",
      artifact: "doc", expectedMime: "application/msword",
      run: () => exportReport("word", SAMPLE_EXPORT),
    },
    {
      // Sanity probe: a hand-rolled jsPDF blob (covers ad-hoc PDFs across the app).
      route: "Sanity › jsPDF blob handshake",
      artifact: "pdf", expectedMime: "application/pdf", sig: "pdf",
      run: () => {
        const d = new jsPDF();
        d.text("Integrity sanity probe", 10, 10);
        d.save("sanity.pdf");
      },
    },
  ];

  for (const c of cases) {
    const startedAt = performance.now();
    try {
      const blobs = await captureDownloads(c.run);
      const first = blobs[0];
      results.push(await verify(c.route, c.artifact, c.expectedMime, first?.blob, first?.filename, startedAt, c.sig));
    } catch (e) {
      results.push({
        route: c.route, artifact: c.artifact, expectedMime: c.expectedMime,
        status: "fail",
        message: `Generator threw: ${(e as Error).message}`,
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
  }

  return results;
}

export function summarize(checks: IntegrityCheck[]) {
  return {
    total: checks.length,
    pass: checks.filter(c => c.status === "pass").length,
    warn: checks.filter(c => c.status === "warn").length,
    fail: checks.filter(c => c.status === "fail").length,
  };
}

// Regression test: large PDF buffers must base64-encode without overflowing
// the JS call stack. Mirrors the chunked encoder used in index.ts.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2";

function encodeBase64Chunked(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))),
    );
  }
  return btoa(binary);
}

Deno.test("chunked base64 encodes a large synthetic buffer without stack overflow", () => {
  // 5 MB — far above the ~125k arg limit that breaks String.fromCharCode(...arr)
  const big = new Uint8Array(5 * 1024 * 1024);
  for (let i = 0; i < big.length; i++) big[i] = i & 0xff;

  const b64 = encodeBase64Chunked(big);
  assert(b64.length > 0, "base64 output should be non-empty");
  // Round-trip a slice to confirm validity
  const decoded = atob(b64.slice(0, 10000));
  assert(decoded.length > 0);
});

Deno.test("naive spread approach overflows — confirms the regression", () => {
  const big = new Uint8Array(2 * 1024 * 1024);
  let threw = false;
  try {
    // This is what previously crashed the edge function
    btoa(String.fromCharCode(...big));
  } catch (_e) {
    threw = true;
  }
  assert(threw, "spread of large Uint8Array should throw RangeError");
});

Deno.test("large attendance-style PDF encodes cleanly via chunked encoder", () => {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(12);
  doc.text("Attendance Compliance — Stress Test", 14, 15);

  // Generate ~3000 rows to produce a sizeable PDF
  const rows: string[][] = [];
  for (let i = 0; i < 3000; i++) {
    rows.push([
      `IMP-${String(i).padStart(5, "0")}`,
      `Last${i}, First${i}`,
      "CYBER & MISD",
      "Main Office",
      ["A", "B", "C", "D"][i % 4],
      "20", "18", "1", "1", "0", "90.0%",
    ]);
  }

  autoTable(doc, {
    head: [["Staff ID", "Name", "Department", "Office", "Shift",
      "Working", "Present", "Absent", "Late", "Leave", "Compliance %"]],
    body: rows,
    startY: 20,
    styles: { fontSize: 7, cellPadding: 2 },
  });

  const pdfBytes = new Uint8Array(doc.output("arraybuffer"));
  assert(pdfBytes.length > 100_000, `expected sizeable PDF, got ${pdfBytes.length} bytes`);

  const b64 = encodeBase64Chunked(pdfBytes);
  // Valid base64 length is a multiple of 4
  assertEquals(b64.length % 4, 0);
  // Must start with "%PDF" magic when decoded
  const head = atob(b64.slice(0, 8));
  assertEquals(head.slice(0, 4), "%PDF");
});

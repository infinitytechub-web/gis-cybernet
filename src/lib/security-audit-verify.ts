// src/lib/security-audit-verify.ts
// Client-side verifier for previously exported security_audit_log files.
// Recomputes the SHA-256 hash chain and compares against the embedded header.

export type AuditRow = {
  seq: number | string;
  id: string;
  category: string;
  action: string;
  severity: string;
  actor_id?: string | null;
  subject?: string | null;
  details?: any;
  prev_hash?: string | null;
  row_hash: string;
  created_at: string;
  ip_address?: string | null;
  actor_label?: string | null;
};

export type ExportHeader = {
  exported_at?: string;
  row_count?: number;
  head_seq?: number | null;
  head_hash?: string | null;
  head_created_at?: string | null;
};

export type VerifyReport = {
  ok: boolean;
  format: "json" | "csv";
  header: ExportHeader;
  rowCount: number;
  computedHeadHash: string | null;
  computedHeadSeq: number | null;
  rowCountMatches: boolean;
  headHashMatches: boolean;
  brokenSeq: number | null;
  brokenReason: string | null;
  firstFiveSeqs: number[];
};

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Mirror of public.security_audit_set_hash():
//   coalesce(prev,'') | id | category | action | severity |
//   coalesce(actor_id,'') | coalesce(subject,'') |
//   coalesce(details::text,'{}') | created_at::text
function buildPayload(prev: string, r: AuditRow): string {
  const details =
    r.details == null
      ? "{}"
      : typeof r.details === "string"
        ? r.details
        : JSON.stringify(r.details);
  return [
    prev || "",
    String(r.id),
    r.category,
    r.action,
    r.severity,
    r.actor_id ?? "",
    r.subject ?? "",
    details || "{}",
    r.created_at,
  ].join("|");
}

// --- CSV parsing (handles quoted fields, escaped quotes, embedded newlines) ---
function parseCsv(text: string): { meta: string[]; header: string[]; rows: string[][] } {
  const meta: string[] = [];
  const lines: string[] = [];
  let i = 0;
  // Pull out leading "# ..." metadata comment lines and blank separator
  while (i < text.length) {
    const eol = text.indexOf("\n", i);
    const line = (eol === -1 ? text.slice(i) : text.slice(i, eol)).replace(/\r$/, "");
    if (line.startsWith("#")) {
      meta.push(line);
      i = eol === -1 ? text.length : eol + 1;
    } else if (line.trim() === "" && meta.length > 0) {
      i = eol === -1 ? text.length : eol + 1;
      break;
    } else {
      break;
    }
  }
  const body = text.slice(i);

  // RFC4180-ish parser
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let p = 0; p < body.length; p++) {
    const c = body[p];
    if (inQuotes) {
      if (c === '"') {
        if (body[p + 1] === '"') { field += '"'; p++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && body[p + 1] === "\n") p++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") records.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); records.push(row); }

  const header = records.shift() ?? [];
  return { meta, header, rows: records };
}

function parseHeaderMetaFromCsv(meta: string[]): ExportHeader {
  const out: ExportHeader = {};
  for (const raw of meta) {
    const line = raw.replace(/^#\s*/, "");
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    const v = line.slice(idx + 1).trim();
    if (k === "exported at") out.exported_at = v;
    else if (k === "row count") out.row_count = Number(v);
    else if (k === "head seq") out.head_seq = v ? Number(v) : null;
    else if (k === "head hash") out.head_hash = v || null;
    else if (k === "head created at") out.head_created_at = v || null;
  }
  return out;
}

function csvValueToString(s: string): string {
  // Exports JSON.stringify each cell -> values are typically wrapped in quotes.
  // Try JSON.parse first; fall back to raw string.
  try {
    if (s.startsWith('"') || s === "null") return JSON.parse(s) ?? "";
  } catch { /* ignore */ }
  return s;
}

function csvRowsToObjects(header: string[], rows: string[][]): AuditRow[] {
  return rows.map((r) => {
    const o: any = {};
    header.forEach((h, idx) => { o[h] = csvValueToString(r[idx] ?? ""); });
    if (o.seq != null && o.seq !== "") o.seq = Number(o.seq);
    return o as AuditRow;
  });
}

export async function verifyExportedAudit(file: File): Promise<VerifyReport> {
  const text = await file.text();
  const isJson = file.name.toLowerCase().endsWith(".json") || text.trimStart().startsWith("{");

  let header: ExportHeader = {};
  let dataRows: AuditRow[] = [];
  let format: "json" | "csv";

  if (isJson) {
    format = "json";
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      dataRows = parsed as AuditRow[];
    } else {
      header = (parsed.header ?? {}) as ExportHeader;
      dataRows = (parsed.rows ?? []) as AuditRow[];
    }
  } else {
    format = "csv";
    const { meta, header: cols, rows } = parseCsv(text);
    header = parseHeaderMetaFromCsv(meta);
    dataRows = csvRowsToObjects(cols, rows);
  }

  // Sort by seq ascending so the chain reproduces in insertion order.
  dataRows.sort((a, b) => Number(a.seq) - Number(b.seq));

  let prev = "";
  let brokenSeq: number | null = null;
  let brokenReason: string | null = null;

  for (const r of dataRows) {
    // prev_hash continuity (only enforced if prev_hash column is present)
    if (r.prev_hash !== undefined && r.prev_hash !== null) {
      const expectedPrev = prev || "";
      const actualPrev = r.prev_hash || "";
      if (expectedPrev !== actualPrev) {
        brokenSeq = Number(r.seq);
        brokenReason = `prev_hash mismatch (expected ${expectedPrev.slice(0, 12) || "∅"}, got ${actualPrev.slice(0, 12) || "∅"})`;
        break;
      }
    }
    const expectedHash = await sha256Hex(buildPayload(prev, r));
    if (expectedHash !== r.row_hash) {
      brokenSeq = Number(r.seq);
      brokenReason = `row_hash mismatch (expected ${expectedHash.slice(0, 12)}, got ${(r.row_hash || "").slice(0, 12)})`;
      break;
    }
    prev = r.row_hash;
  }

  const computedHeadHash = brokenSeq === null && dataRows.length > 0 ? prev : null;
  const computedHeadSeq = dataRows.length > 0 ? Number(dataRows[dataRows.length - 1].seq) : null;
  const headHashMatches =
    !!header.head_hash && !!computedHeadHash && header.head_hash === computedHeadHash;
  const rowCountMatches =
    typeof header.row_count !== "number" ? true : header.row_count === dataRows.length;

  return {
    ok: brokenSeq === null && rowCountMatches && (header.head_hash ? headHashMatches : true),
    format,
    header,
    rowCount: dataRows.length,
    computedHeadHash,
    computedHeadSeq,
    rowCountMatches,
    headHashMatches,
    brokenSeq,
    brokenReason,
    firstFiveSeqs: dataRows.slice(0, 5).map((r) => Number(r.seq)),
  };
}

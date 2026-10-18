export type ComparisonRow = { row_no: number; first_name: string; last_name: string; staff_id_raw: string; intake: string; rank: string; unit: string };
export type ExistingStaff = { id: string; first_name: string | null; last_name: string | null; staff_id: string | null; intake: string | null };
export const MAX_REVIEW_ROWS = 25;
export const nameKey = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();
export function idKey(value: string | null) {
  const key = (value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return !key || /^(X+|0+|NA|NONE|NULL|NIL|UNKNOWN|PENDING|NOTAVAILABLE)$/.test(key) ? "" : key;
}
export function validateRows(value: unknown): ComparisonRow[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_REVIEW_ROWS) throw new Error("Select between 1 and 25 import rows.");
  const seen = new Set<number>();
  return value.map((r) => {
    if (!r || !Number.isInteger(r.row_no) || r.row_no < 1 || seen.has(r.row_no)) throw new Error("Import row numbers must be positive and unique.");
    seen.add(r.row_no);
    const row: ComparisonRow = { row_no: r.row_no, first_name: "", last_name: "", staff_id_raw: "", intake: "", rank: "", unit: "" };
    for (const field of ["first_name", "last_name", "staff_id_raw", "intake", "rank", "unit"] as const) {
      if (typeof r[field] !== "string" || r[field].length > 150) throw new Error("Invalid or oversized staff comparison field.");
      row[field] = r[field].trim();
    }
    if (!row.first_name && !row.last_name) throw new Error("Each import row needs a staff name.");
    return row;
  });
}
function grams(value: string) {
  const s = ` ${nameKey(value)} `;
  return new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
}
export function similarity(a: string, b: string) {
  const x = grams(a), y = grams(b);
  const common = [...x].filter((g) => y.has(g)).length;
  return x.size + y.size ? 2 * common / (x.size + y.size) : 0;
}
export function buildComparison(rows: ComparisonRow[], staff: ExistingStaff[]) {
  return rows.map((row) => {
    const name = nameKey(`${row.first_name} ${row.last_name}`);
    const sid = idKey(row.staff_id_raw);
    const ranked = staff.map((p) => {
      const fullName = nameKey(`${p.first_name ?? ""} ${p.last_name ?? ""}`);
      const score = sid && sid === idKey(p.staff_id) ? 2 : Math.max(similarity(name, fullName), similarity(name, `${p.last_name ?? ""} ${p.first_name ?? ""}`));
      return { p, score };
    }).filter(({ score }) => score >= 0.45).sort((a, b) => b.score - a.score);
    return { row, candidates: ranked.slice(0, 5).map(({ p }) => p), candidatesTruncated: ranked.length > 5 };
  });
}
export type Finding = { row_no: number; candidate_key: string | null; assessment: "likely_duplicate" | "mismatch" | "possible_match" | "no_likely_match"; confidence: "high" | "medium" | "low"; reason: string };
export function validateFindings(findings: Finding[], groups: ReturnType<typeof buildComparison>) {
  if (!Array.isArray(findings) || findings.length !== groups.length) throw new Error("AI review did not return every selected row.");
  const seen = new Set<number>();
  for (const finding of findings) {
    if (!finding || !["likely_duplicate", "mismatch", "possible_match", "no_likely_match"].includes(finding.assessment) || !["high", "medium", "low"].includes(finding.confidence) || typeof finding.reason !== "string") throw new Error("AI review returned invalid evidence.");
    const group = groups.find((g) => g.row.row_no === finding.row_no);
    if (!group || seen.has(finding.row_no)) throw new Error("AI returned an unknown or repeated import row.");
    seen.add(finding.row_no);
    const keys = group.candidates.map((_, i) => `R${group.row.row_no}C${i + 1}`);
    if (finding.candidate_key !== null && !keys.includes(finding.candidate_key)) throw new Error("AI returned an unverified staff match.");
    if (finding.assessment !== "no_likely_match" && finding.candidate_key === null) throw new Error("AI match has no existing staff candidate.");
    if (finding.reason.length > 1200) throw new Error("AI explanation exceeds the review limit.");
  }
  return findings;
}
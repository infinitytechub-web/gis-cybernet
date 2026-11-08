export interface QuickUserRow {
  id: string; first_name: string | null; last_name: string | null; staff_id: string | null;
  unit: string | null; rank_name: string | null; rank_abbreviation: string | null; photo_url: string | null;
}
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** Case/space-insensitive match on name, staff ID, rank or unit. Empty query returns nothing. */
export function filterQuickUsers(rows: QuickUserRow[], query: string): QuickUserRow[] {
  const q = norm(query);
  if (q.length < 2) return [];
  return rows.filter(r => norm([r.first_name, r.last_name, r.staff_id, r.rank_name, r.rank_abbreviation, r.unit].filter(Boolean).join(" ")).includes(q));
}
/** Partial mask unless the viewer may see full IDs (GIS•••••21 style). */
export function maskQuickId(id: string | null, full: boolean): string {
  if (!id) return "—";
  if (full || id.length <= 5) return id;
  return id.slice(0, 3) + "•".repeat(Math.max(1, id.length - 5)) + id.slice(-2);
}

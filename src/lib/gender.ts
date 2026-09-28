/** Standardize gender input (M, Male, F, Female — any case) to "Male" / "Female". */
export function normalizeGender(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "m" || s === "male") return "Male";
  if (s === "f" || s === "female") return "Female";
  return String(v ?? "").trim();
}

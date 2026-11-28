export const GPS_EXPORT_ROLES = new Set(["admin", "oic", "2ic", "staff_officer"]);
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^gps-auth-exports/(${UUID})/(${UUID}|global)/(\\d{13})/(${UUID})_([a-zA-Z0-9._-]{1,120}\\.csv)$`);

export function parseExportPath(value: unknown, now = Date.now()) {
  if (typeof value !== "string") return null;
  const match = PATH.exec(value);
  if (!match || Number(match[3]) <= now) return null;
  return { ownerId: match[1], unitId: match[2], expiresAt: Number(match[3]), filename: match[5] };
}

export function exportAccessAllowed(roles: string[], inScope: boolean) {
  return roles.some((role) => GPS_EXPORT_ROLES.has(role)) && inScope;
}

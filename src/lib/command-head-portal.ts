import type { CommandWorkforce } from "@/lib/command-workforce";

export type PortalUnit = { id: string; parent_id: string | null; name: string };
export type PortalScope = { profileIds: string[]; unitIds: string[] };

/** Narrow caller-visible records to the server-derived posting branch, including empty units. */
export function commandPortalScope(workforce: CommandWorkforce, units: PortalUnit[]): PortalScope {
  if (!workforce.assigned || !workforce.command?.id) return { profileIds: [], unitIds: [] };
  const ids = new Set([workforce.command.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const unit of units) {
      if (unit.parent_id && ids.has(unit.parent_id) && !ids.has(unit.id)) {
        ids.add(unit.id);
        changed = true;
      }
    }
  }
  return { profileIds: workforce.staff.map(row => row.id), unitIds: [...ids].sort() };
}

export function transferInPortalScope(
  row: { profile_id: string; from_org_unit_id: string | null; to_org_unit_id: string | null },
  scope: PortalScope,
) {
  return scope.profileIds.includes(row.profile_id) ||
    (!!row.from_org_unit_id && scope.unitIds.includes(row.from_org_unit_id)) ||
    (!!row.to_org_unit_id && scope.unitIds.includes(row.to_org_unit_id));
}
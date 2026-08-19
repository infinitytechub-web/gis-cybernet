/**
 * UNIT ROSTER — one row per command unit: who commands it, their rank, their
 * posting and how to reach them, plus the unit's strength.
 *
 * Derived entirely from data already loaded by the staff roster (profiles +
 * roles) and the org hierarchy, so the module adds no extra round trips and
 * stays consistent with what the Unit Dashboard shows for the same unit.
 */
import { useMemo } from "react";
import { useOrgUnits } from "@/hooks/useOrgScope";
import { useStaffRoster, type RosterMember } from "@/hooks/useStaffRoster";
import { orgUnitPath, type OrgUnitType } from "@/lib/org-hierarchy";
import type { AppRole } from "@/lib/types";

/** Command precedence used to pick a unit's commander from its posted staff. */
export const COMMANDER_PRECEDENCE: AppRole[] = [
  "oic",
  "2ic",
  "chief_staff_officer",
  "head_of_administration",
  "staff_officer",
  "command_officer",
  "supervisor",
  "deputy_supervisor",
  "shift_leader",
];

export interface UnitRosterRow {
  unit_id: string;
  unit_name: string;
  unit_code: string | null;
  unit_type: OrgUnitType;
  unit_path: string;
  parent_name: string | null;
  is_active: boolean;
  /** Commander (highest command role posted to the unit), if any. */
  commander: RosterMember | null;
  commander_role: AppRole | null;
  /** Everyone posted directly to this unit. */
  strength: number;
  /** Strength including every unit beneath this one. */
  branch_strength: number;
  deputies: RosterMember[];
}

function precedenceOf(member: RosterMember): number {
  let best = Number.POSITIVE_INFINITY;
  for (const role of member.roles) {
    const idx = COMMANDER_PRECEDENCE.indexOf(role);
    if (idx >= 0 && idx < best) best = idx;
  }
  return best;
}

export function useUnitRoster() {
  const unitsQuery = useOrgUnits();
  const units = unitsQuery.data ?? [];
  const rosterQuery = useStaffRoster();


  const rows = useMemo<UnitRosterRow[]>(() => {
    const roster = rosterQuery.data ?? [];
    if (units.length === 0) return [];

    const byUnit = new Map<string, RosterMember[]>();
    for (const m of roster) {
      if (!m.org_unit_id) continue;
      const list = byUnit.get(m.org_unit_id) ?? [];
      list.push(m);
      byUnit.set(m.org_unit_id, list);
    }

    // Descendant ids per unit, for branch strength.
    const childrenOf = new Map<string, string[]>();
    for (const u of units) {
      if (!u.parent_id) continue;
      const list = childrenOf.get(u.parent_id) ?? [];
      list.push(u.id);
      childrenOf.set(u.parent_id, list);
    }
    const subtreeCount = (id: string): number => {
      let total = byUnit.get(id)?.length ?? 0;
      for (const child of childrenOf.get(id) ?? []) total += subtreeCount(child);
      return total;
    };

    const unitName = new Map(units.map((u) => [u.id, u.name]));

    return units
      .map<UnitRosterRow>((u) => {
        const members = [...(byUnit.get(u.id) ?? [])].sort((a, b) => precedenceOf(a) - precedenceOf(b));
        const ranked = members.filter((m) => Number.isFinite(precedenceOf(m)));
        const commander = ranked[0] ?? null;
        const commanderRole =
          commander?.roles
            .filter((r) => COMMANDER_PRECEDENCE.includes(r))
            .sort((a, b) => COMMANDER_PRECEDENCE.indexOf(a) - COMMANDER_PRECEDENCE.indexOf(b))[0] ?? null;

        return {
          unit_id: u.id,
          unit_name: u.name,
          unit_code: u.code ?? null,
          unit_type: u.type as OrgUnitType,
          unit_path: orgUnitPath(units, u.id),
          parent_name: u.parent_id ? unitName.get(u.parent_id) ?? null : null,
          is_active: u.is_active !== false,
          commander,
          commander_role: commanderRole,
          strength: members.length,
          branch_strength: subtreeCount(u.id),
          deputies: ranked.slice(1, 4),
        };
      })
      .sort((a, b) => a.unit_path.localeCompare(b.unit_path));
  }, [units, rosterQuery.data]);

  return {
    rows,
    loading: unitsQuery.isLoading || rosterQuery.isLoading,
    error: rosterQuery.error as Error | null,
    refetch: rosterQuery.refetch,
  };
}

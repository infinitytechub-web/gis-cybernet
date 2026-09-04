/**
 * HIERARCHICAL RBAC — Regional Command → Sector → District → Station → Unit.
 *
 * The command hierarchy is stored in `org_units` (self-referencing tree) and
 * staff are attached to it in two ways:
 *   • `profiles.org_unit_id`      — their posting (home node).
 *   • `org_unit_assignments`      — extra oversight nodes, optionally with
 *                                   `can_manage` (authority over the branch).
 *
 * A user's **scope** is every node at or below any of those nodes. The same
 * rule is implemented server-side in `user_org_scope` / `has_org_access` /
 * `can_manage_org_unit` and enforced by RLS + edge functions, so the UI gate
 * here can never grant more than the backend allows.
 */

export type OrgUnitType =
  | "directorate"
  | "national"
  | "management"
  | "regional"
  | "command"
  | "sector"
  | "department"
  | "section"
  | "district"
  | "station"
  | "unit"
  | "control";

/**
 * Display order / depth ranking, highest authority first. This is the exact
 * establishment order:
 *   Directorate (HQ) → Management Members → Regional Commands →
 *   Commandant / Commanding Officer commands → Sector Commands →
 *   Departments → Sections → Units → Controls.
 */
export const ORG_UNIT_TYPES: OrgUnitType[] = [
  "directorate",
  "national",
  "management",
  "regional",
  "command",
  "sector",
  "district",
  "department",
  "section",
  "station",
  "unit",
  "control",
];

export const ORG_UNIT_TYPE_LABELS: Record<OrgUnitType, string> = {
  directorate: "The Directorate (HQ)",
  national: "National Headquarters",
  management: "Management Members",
  regional: "Regional Command",
  command: "Commandant / Commanding Officer",
  sector: "Sector Command",
  district: "District Command",
  department: "Department",
  section: "Section",
  station: "Station",
  unit: "Unit",
  control: "Control",
};

export interface OrgUnit {
  id: string;
  name: string;
  code: string;
  type: OrgUnitType;
  parent_id: string | null;
  is_active: boolean;
}

export interface OrgUnitAssignment {
  id: string;
  user_id: string;
  org_unit_id: string;
  can_manage: boolean;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface OrgTreeNode extends OrgUnit {
  depth: number;
  children: OrgTreeNode[];
}

/** Build the forest of org units, ordered by level then name. */
export function buildOrgTree(units: OrgUnit[]): OrgTreeNode[] {
  const byId = new Map<string, OrgTreeNode>();
  for (const u of units) byId.set(u.id, { ...u, depth: 0, children: [] });

  const roots: OrgTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortRec = (nodes: OrgTreeNode[], depth: number) => {
    nodes.sort(
      (a, b) =>
        ORG_UNIT_TYPES.indexOf(a.type) - ORG_UNIT_TYPES.indexOf(b.type) ||
        a.name.localeCompare(b.name),
    );
    for (const n of nodes) {
      n.depth = depth;
      sortRec(n.children, depth + 1);
    }
  };
  sortRec(roots, 0);
  return roots;
}

/** Flatten a tree depth-first (useful for tables and indented selects). */
export function flattenOrgTree(nodes: OrgTreeNode[]): OrgTreeNode[] {
  const out: OrgTreeNode[] = [];
  const walk = (list: OrgTreeNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Ids of `rootId` and everything beneath it. */
export function descendantIds(units: OrgUnit[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const u of units) {
    if (!u.parent_id) continue;
    const list = childrenOf.get(u.parent_id) ?? [];
    list.push(u.id);
    childrenOf.set(u.parent_id, list);
  }
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.includes(id)) continue;
    out.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return out;
}

/** Ids of `nodeId` and every command above it, nearest first. */
export function ancestorIds(units: OrgUnit[], nodeId: string): string[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const out: string[] = [];
  let cur = byId.get(nodeId);
  while (cur) {
    out.push(cur.id);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return out;
}

/** Full command path, e.g. "Greater Accra Regional Command › Amasaman …". */
export function orgUnitPath(units: OrgUnit[], nodeId: string): string {
  const byId = new Map(units.map((u) => [u.id, u]));
  return ancestorIds(units, nodeId)
    .reverse()
    .map((id) => byId.get(id)?.name ?? "—")
    .join(" › ");
}

export interface OrgScopeInput {
  isAdmin: boolean;
  /** Posting on the signed-in user's profile. */
  homeUnitId: string | null;
  /** Active (non-revoked, non-expired) assignments for the signed-in user. */
  assignments: Pick<OrgUnitAssignment, "org_unit_id" | "can_manage">[];
  units: OrgUnit[];
}

export interface OrgScope {
  /** Every unit id the user may read data for. Empty + isAdmin = everything. */
  scopeIds: Set<string>;
  /** Every unit id the user may administer (create/edit/assign). */
  manageIds: Set<string>;
  isAdmin: boolean;
  /** True when the user has no place in the hierarchy at all. */
  unscoped: boolean;
  hasAccess: (unitId: string | null | undefined) => boolean;
  canManage: (unitId: string | null | undefined) => boolean;
}

/** Resolve the effective scope — mirrors `user_org_scope` in the database. */
export function resolveOrgScope(input: OrgScopeInput): OrgScope {
  const { isAdmin, homeUnitId, assignments, units } = input;

  const scopeIds = new Set<string>();
  const manageIds = new Set<string>();

  const addBranch = (rootId: string, manage: boolean) => {
    for (const id of descendantIds(units, rootId)) {
      scopeIds.add(id);
      if (manage) manageIds.add(id);
    }
  };

  if (homeUnitId) addBranch(homeUnitId, false);
  for (const a of assignments) addBranch(a.org_unit_id, a.can_manage);

  const unscoped = !isAdmin && scopeIds.size === 0;

  return {
    scopeIds,
    manageIds,
    isAdmin,
    unscoped,
    // A record with no posting is not org-restricted (rollout-safe, matches the
    // `org_unit_id IS NULL` branches of the RLS policies).
    hasAccess: (unitId) => isAdmin || !unitId || scopeIds.has(unitId),
    canManage: (unitId) => isAdmin || (!!unitId && manageIds.has(unitId)),
  };
}

/** Filter any org-tagged row set down to the caller's scope. */
export function filterByOrgScope<T extends { org_unit_id?: string | null }>(
  rows: T[],
  scope: OrgScope,
): T[] {
  if (scope.isAdmin) return rows;
  return rows.filter((r) => scope.hasAccess(r.org_unit_id));
}

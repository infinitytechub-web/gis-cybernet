/**
 * SYSTEM-WIDE RBAC — single source of truth.
 *
 * Every route/module in the application is registered here with the exact set
 * of roles that may open it. Route guards, page-level gates and every
 * navigation surface (sidebar, mobile bar, overflow menu, Admin Console tiles)
 * resolve access through `canAccessModule` so they can never disagree.
 *
 * Access is decided, in order:
 *   1. System Administrator  → always allowed.
 *   2. Admin-tuned overrides → `permission_matrix_overrides` (feature + role).
 *                              `none` denies, any other level allows entry.
 *   3. Static role list      → the module's `roles` array.
 *   4. Delegated capability  → an active `command_tier_grants` row for the
 *                              module key (or the `*` wildcard).
 *
 * NOTE: this layer is the UX/navigation gate. Row Level Security and the
 * authority checks inside edge functions are what actually stop a crafted API
 * request — both layers are required and both are covered.
 */

import type { AppRole } from "@/lib/types";
import { COMMAND_TIER_ROLES } from "@/lib/role-labels";

export type ModuleTier = "all-staff" | "module" | "command" | "admin";

export interface ModuleDef {
  /** Stable key — also the capability name used for delegated grants. */
  key: string;
  /** Human label shown on the Access Denied screen. */
  label: string;
  /**
   * Matching `feature_name` in `permission_matrix_overrides`, when the module
   * appears in the System Settings permission matrix.
   */
  feature?: string;
  tier: ModuleTier;
  /** Roles allowed to open the module. `"all"` = every authenticated user. */
  roles: AppRole[] | "all";
  /** Route paths owned by this module (supports `:param` segments). */
  paths: string[];
}

const COMMAND: AppRole[] = [...COMMAND_TIER_ROLES];
const ADMIN_ONLY: AppRole[] = ["admin"];
const ADMIN_OIC_2IC: AppRole[] = ["admin", "oic", "2ic"];

/** Shift-leadership tier — day-to-day workforce supervision. */
const SHIFT_LEADERSHIP: AppRole[] = [
  "shift_supervisor",
  "deputy_shift_supervisor",
  "shift_leader",
  "deputy_shift_leader",
  "deputy_supervisor",
  "deputy",
];

const IPSE_TIER: AppRole[] = ["ipse_supervisor", "ipse_deputy_supervisor"];
const PROCESSING_TIER: AppRole[] = ["head_of_processing", "deputy_head_of_processing"];

export const MODULES: ModuleDef[] = [
  // ── Open to every authenticated staff member ────────────────────────────
  { key: "dashboard", label: "Dashboard", feature: "Dashboard", tier: "all-staff", roles: "all", paths: ["/dashboard", "/"] },
  { key: "my-profile", label: "My Profile", tier: "all-staff", roles: "all", paths: ["/my-profile"] },
  { key: "my-portal", label: "My Portal", tier: "all-staff", roles: "all", paths: ["/my-portal"] },
  { key: "my-shift", label: "My Shift Tracker", tier: "all-staff", roles: "all", paths: ["/my-shift"] },
  { key: "staff-directory", label: "Staff Directory", feature: "Staff Directory", tier: "all-staff", roles: "all", paths: ["/directory"] },
  { key: "excuse-duty", label: "Excuse Duty Form", tier: "all-staff", roles: "all", paths: ["/excuse-duty", "/excuse-duty/mine"] },
  { key: "leave", label: "Leave / Pass Requests", feature: "Leave Requests", tier: "all-staff", roles: "all", paths: ["/leave"] },
  { key: "attendance", label: "Attendance", feature: "Attendance", tier: "all-staff", roles: "all", paths: ["/attendance"] },
  { key: "holidays", label: "Holidays", tier: "all-staff", roles: "all", paths: ["/holidays"] },
  { key: "announcements", label: "Announcements", feature: "Announcements", tier: "all-staff", roles: "all", paths: ["/announcements"] },
  { key: "quarantine", label: "Quarantine Inbox", tier: "all-staff", roles: "all", paths: ["/quarantine"] },
  { key: "appraisals", label: "Staff Appraisals", tier: "all-staff", roles: "all", paths: ["/appraisals", "/appraisals/officer/:staffProfileId"] },
  { key: "verify-export", label: "Verify Export", tier: "all-staff", roles: "all", paths: ["/verify-export"] },
  { key: "change-password", label: "Change Password", tier: "all-staff", roles: "all", paths: ["/change-password"] },

  // ── Personnel & workforce (departmental information) ────────────────────
  {
    key: "staff", label: "Staff / Employees", feature: "Staff / Employees", tier: "module",
    roles: [...COMMAND, ...SHIFT_LEADERSHIP, ...IPSE_TIER, ...PROCESSING_TIER, "special_duties"],
    paths: ["/staff", "/staff/:id"],
  },
  { key: "departments", label: "Departments", feature: "Departments", tier: "module", roles: [...COMMAND, ...IPSE_TIER], paths: ["/departments"] },
  { key: "roles-designations", label: "Roles / Designations", feature: "Roles / Ranks", tier: "module", roles: [...COMMAND, ...IPSE_TIER], paths: ["/roles"] },
  { key: "shifts", label: "Office Shifts", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP], paths: ["/shifts"] },
  { key: "roster", label: "Duty Roster", feature: "Duty Roster", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP], paths: ["/roster"] },
  { key: "guard-schedule", label: "Guard Schedule", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP], paths: ["/guard-schedule"] },
  { key: "postings", label: "Postings & Transfers", feature: "Postings & Transfers", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP], paths: ["/postings", "/postings/history"] },
  { key: "compliance", label: "Compliance", feature: "Compliance", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP], paths: ["/compliance"] },
  { key: "appraisal-coverage", label: "Appraisal Coverage Report", tier: "command", roles: COMMAND, paths: ["/appraisals/coverage"] },

  // ── Immigration operations (unit / section dashboards) ──────────────────
  { key: "front-desk", label: "Front Desk", tier: "module", roles: [...COMMAND, ...PROCESSING_TIER, "front_desk"], paths: ["/front-desk"] },
  { key: "processing", label: "Processing", tier: "module", roles: [...COMMAND, ...PROCESSING_TIER, "front_desk"], paths: ["/processing"] },
  { key: "operations", label: "Operations", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP, "special_duties"], paths: ["/operations"] },
  { key: "enforcement", label: "Enforcement", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP, "special_duties"], paths: ["/enforcement"] },
  { key: "detention", label: "Holding & Detention Center", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP, "special_duties"], paths: ["/holding"] },
  { key: "ipse", label: "IPSE", tier: "module", roles: [...COMMAND, ...IPSE_TIER], paths: ["/ipse"] },
  { key: "misd", label: "MISD / CYBER", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP], paths: ["/misd"] },
  { key: "health-lab", label: "Health Lab+", tier: "module", roles: [...COMMAND, "medical_officer"], paths: ["/health-lab"] },
  { key: "stores", label: "Stores & Inventory", tier: "module", roles: [...COMMAND, "storekeeper"], paths: ["/stores"] },
  { key: "procurement", label: "Procurement Unit", tier: "module", roles: [...COMMAND, "procurement_officer"], paths: ["/procurement"] },

  // ── Reporting & analytics ───────────────────────────────────────────────
  { key: "reports", label: "Reports", feature: "Reports", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP], paths: ["/reports"] },
  { key: "analytics", label: "Analytics", tier: "command", roles: COMMAND, paths: ["/analytics"] },
  { key: "scheduled-files", label: "Scheduled Files", tier: "command", roles: COMMAND, paths: ["/scheduled-files"] },
  { key: "route-history", label: "Route History", tier: "command", roles: COMMAND, paths: ["/route-history"] },
  { key: "staff-export-integrity", label: "Staff Export Integrity", tier: "command", roles: COMMAND, paths: ["/staff-export-integrity"] },

  // ── Approvals & command workspaces ──────────────────────────────────────
  { key: "staff-request-approvals", label: "Staff Approvals", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP], paths: ["/staff-approvals"] },
  { key: "shift-rotation-approvals", label: "Shift Rotation Approvals", tier: "command", roles: COMMAND, paths: ["/shift-rotation-approvals"] },
  { key: "shift-connections", label: "Shift Connections", tier: "command", roles: COMMAND, paths: ["/attendance/connections"] },
  { key: "command-vault", label: "Command Vault", tier: "command", roles: COMMAND, paths: ["/command-vault", "/command-vault/gps"] },
  { key: "interlink", label: "Interlink", tier: "command", roles: COMMAND, paths: ["/interlink"] },
  { key: "commands", label: "Commands Administration", tier: "command", roles: COMMAND, paths: ["/commands", "/command/:slug"] },

  // ── Staff administration ────────────────────────────────────────────────
  { key: "staff-approvals-pending", label: "Pending Staff Approvals", tier: "command", roles: COMMAND, paths: ["/staff-approvals/pending"] },
  { key: "staff_admin", label: "Account Approvals", tier: "admin", roles: ADMIN_ONLY, paths: ["/staff-approvals/accounts"] },
  { key: "profile-change-approvals", label: "Profile Change Approvals", tier: "command", roles: COMMAND, paths: ["/staff-approvals/profile-changes"] },
  { key: "roster-import", label: "Roster Import", tier: "command", roles: COMMAND, paths: ["/roster/import"] },
  { key: "guard-schedule-import", label: "Guard PDF Import", tier: "command", roles: COMMAND, paths: ["/guard-schedule/import"] },
  { key: "staff-mapping-import", label: "Staff Mapping Import", tier: "admin", roles: ADMIN_ONLY, paths: ["/staff-mapping-import"] },
  { key: "role-assignments", label: "Role Assignments", tier: "command", roles: ADMIN_OIC_2IC, paths: ["/role-assignments"] },
  { key: "command-roles", label: "Command Roles & Grants", tier: "command", roles: ADMIN_OIC_2IC, paths: ["/command-roles"] },

  // ── Administration, security & audit ────────────────────────────────────
  { key: "admin-console", label: "Admin Console", tier: "command", roles: COMMAND, paths: ["/admin"] },
  { key: "admin-access-matrix", label: "Admin Access Matrix", tier: "command", roles: COMMAND, paths: ["/admin-access-matrix"] },
  { key: "admin-shift-rotations", label: "Shift Rotations Administration", tier: "command", roles: COMMAND, paths: ["/admin/shift-rotations"] },
  { key: "audit-log", label: "Audit Log Dashboard", tier: "command", roles: COMMAND, paths: ["/audit-log"] },
  { key: "command-role-audit", label: "Command Role Audit", tier: "command", roles: COMMAND, paths: ["/command-role-audit"] },
  { key: "shift-window-audit", label: "Shift Rules Audit", tier: "command", roles: COMMAND, paths: ["/shift-window-audit"] },
  { key: "rum-analytics", label: "RUM Analytics", tier: "command", roles: COMMAND, paths: ["/rum-analytics"] },
  { key: "sensitive-access-log", label: "Sensitive Access Log", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/sensitive-access-log"] },
  { key: "ip-blocks", label: "IP & Device Blocks", tier: "admin", roles: ADMIN_ONLY, paths: ["/ip-blocks"] },
  { key: "recycle-bin", label: "Recycle Bin", tier: "admin", roles: ["admin", "oic"], paths: ["/recycle-bin"] },
  { key: "retention-policy", label: "Retention Policy", tier: "admin", roles: ADMIN_ONLY, paths: ["/announcements/retention", "/retention-policy"] },
  { key: "settings", label: "System Settings", tier: "admin", roles: ADMIN_ONLY, paths: ["/settings"] },
];

export const MODULES_BY_KEY: Record<string, ModuleDef> = Object.fromEntries(
  MODULES.map((m) => [m.key, m]),
);

/** Every path registered anywhere in the module registry. */
export const REGISTERED_PATHS: string[] = MODULES.flatMap((m) => m.paths);

/** Resolve the module that owns a concrete pathname (params tolerated). */
export function moduleForPath(pathname: string): ModuleDef | undefined {
  const clean = pathname.replace(/\/+$/, "") || "/";
  // Exact match first, then parameterised patterns.
  const exact = MODULES.find((m) => m.paths.includes(clean));
  if (exact) return exact;
  return MODULES.find((m) => m.paths.some((p) => matchPath(p, clean)));
}

function matchPath(pattern: string, pathname: string): boolean {
  const a = pattern.split("/");
  const b = pathname.split("/");
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg.startsWith(":") || seg === b[i]);
}

export interface AccessInput {
  role: AppRole | null;
  /** `permission_matrix_overrides` rows keyed as `${feature_name}::${role}`. */
  overrides?: Record<string, string>;
  /** Active delegated capabilities for the signed-in user. */
  capabilities?: string[];
}

/** Decide whether `role` may open the module identified by `key`. */
export function canAccessModule(key: string, input: AccessInput): boolean {
  const mod = MODULES_BY_KEY[key];
  if (!mod) return false;
  const { role, overrides, capabilities } = input;
  if (!role) return false;

  // 1. System Administrators are never locked out.
  if (role === "admin") return true;

  // 2. Admin-tuned matrix override wins over the code default.
  if (mod.feature && overrides) {
    const level = overrides[`${mod.feature}::${role}`];
    if (level) return level !== "none";
  }

  // 3. Static role list.
  if (mod.roles === "all") return true;
  if (mod.roles.includes(role)) return true;

  // 4. Delegated capability grant (exact module key or wildcard).
  if (capabilities?.some((c) => c === mod.key || c === "*")) return true;

  return false;
}

/** Convenience for navigation filtering by concrete route path. */
export function canAccessPath(pathname: string, input: AccessInput): boolean {
  const mod = moduleForPath(pathname);
  if (!mod) return true; // unregistered/utility paths (aliases, 404) stay open
  return canAccessModule(mod.key, input);
}

/** Roles allowed on a module, for display on the Access Denied screen. */
export function allowedRoles(key: string): AppRole[] | "all" {
  return MODULES_BY_KEY[key]?.roles ?? [];
}

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

/**
 * M&E delivery tier — the roles that own programmes, projects, measures and
 * verification. Field officers submit and view their own field work only.
 */
const ME_DELIVERY: AppRole[] = ["project_manager", "me_officer"];
const ME_FIELD: AppRole[] = ["field_officer"];

export const MODULES: ModuleDef[] = [
  // ── Open to every authenticated staff member ────────────────────────────
  { key: "dashboard", label: "Dashboard", feature: "Dashboard", tier: "all-staff", roles: "all", paths: ["/dashboard", "/"] },
  { key: "my-profile", label: "My Profile", tier: "all-staff", roles: "all", paths: ["/my-profile"] },
  { key: "biometric-enrollment", label: "Biometric Enrollment", tier: "all-staff", roles: "all", paths: ["/biometric-enrollment"] },
  { key: "my-portal", label: "My Portal", tier: "all-staff", roles: "all", paths: ["/my-portal"] },
  { key: "my-shift", label: "My Shift Tracker", tier: "all-staff", roles: "all", paths: ["/my-shift"] },
  { key: "staff-directory", label: "Staff Directory", feature: "Staff Directory", tier: "all-staff", roles: "all", paths: ["/directory"] },
  { key: "excuse-duty", label: "Excuse Duty Form", tier: "all-staff", roles: "all", paths: ["/excuse-duty", "/excuse-duty/mine"] },
  { key: "leave", label: "Leave / Pass Requests", feature: "Leave Requests", tier: "all-staff", roles: "all", paths: ["/leave"] },
  { key: "attendance", label: "Attendance", feature: "Attendance", tier: "all-staff", roles: "all", paths: ["/attendance"] },
  { key: "holidays", label: "Holidays", tier: "all-staff", roles: "all", paths: ["/holidays"] },
  { key: "payments", label: "Payments", feature: "Payments", tier: "all-staff", roles: "all", paths: ["/payments"] },
  { key: "loans", label: "Loans", feature: "Loans", tier: "all-staff", roles: "all", paths: ["/loans"] },
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
  { key: "stores", label: "Stores & Inventory", tier: "module", roles: [...COMMAND, "storekeeper", "procurement_officer"], paths: ["/stores"] },
  { key: "fleet", label: "Fleet Management", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP, "storekeeper"], paths: ["/fleet"] },
  // In-cab console carries live vehicle/patrol comms — patrol & fleet roles only.
  { key: "in-cab", label: "In-Cab Console", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP, "storekeeper", "special_duties"], paths: ["/in-cab"] },


  { key: "procurement", label: "Procurement Unit", tier: "module", roles: [...COMMAND, "procurement_officer", "storekeeper"], paths: ["/procurement"] },

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
  { key: "command-console", label: "Command Console", tier: "command", roles: COMMAND, paths: ["/command-console"] },

  // ── Staff administration ────────────────────────────────────────────────
  { key: "staff-approvals-pending", label: "Pending Staff Approvals", tier: "command", roles: COMMAND, paths: ["/staff-approvals/pending"] },
  { key: "staff_admin", label: "Account Approvals", tier: "admin", roles: ADMIN_ONLY, paths: ["/staff-approvals/accounts"] },
  { key: "profile-change-approvals", label: "Profile Change Approvals", tier: "command", roles: COMMAND, paths: ["/staff-approvals/profile-changes"] },
  { key: "roster-import", label: "Roster Import", tier: "command", roles: COMMAND, paths: ["/roster/import"] },
  { key: "guard-schedule-import", label: "Guard PDF Import", tier: "command", roles: COMMAND, paths: ["/guard-schedule/import"] },
  { key: "staff-mapping-import", label: "Staff Mapping Import", tier: "admin", roles: ADMIN_ONLY, paths: ["/staff-mapping-import"] },
  { key: "biodata-form-setup", label: "Bio-Data Form Setup", tier: "admin", roles: ADMIN_ONLY, paths: ["/biodata-form-setup"] },

  { key: "role-assignments", label: "Role Assignments", tier: "command", roles: ADMIN_OIC_2IC, paths: ["/role-assignments"] },
  { key: "command-roles", label: "Command Roles & Grants", tier: "command", roles: ADMIN_OIC_2IC, paths: ["/command-roles"] },
  // Unit oversight — shows other staff members' postings, so not open to all staff.
  { key: "unit-dashboard", label: "Unit Dashboard", tier: "module", roles: [...COMMAND, ...SHIFT_LEADERSHIP, ...IPSE_TIER, ...PROCESSING_TIER], paths: ["/unit-dashboard"] },
  { key: "org-structure", label: "Command Structure", tier: "command", roles: ADMIN_OIC_2IC, paths: ["/org-structure"] },

  // ── Administration, security & audit ────────────────────────────────────
  // Audit, session, security and telemetry surfaces are audit-sensitive:
  // Admin / OIC / 2IC only. Other command-tier roles need a delegated grant.
  { key: "admin-console", label: "Admin Console", tier: "command", roles: COMMAND, paths: ["/admin"] },
  { key: "session-management", label: "Session Management", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/admin/sessions"] },
  { key: "trusted-devices", label: "Trusted 2FA Devices", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/admin/trusted-devices"] },
  { key: "admin-access-matrix", label: "Admin Access Matrix", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/admin-access-matrix"] },
  { key: "admin-shift-rotations", label: "Shift Rotations Administration", tier: "command", roles: COMMAND, paths: ["/admin/shift-rotations"] },
  { key: "audit-log", label: "Audit Log Dashboard", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/audit-log"] },
  { key: "command-role-audit", label: "Command Role Audit", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/command-role-audit"] },
  { key: "shift-window-audit", label: "Shift Rules Audit", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/shift-window-audit"] },
  { key: "rum-analytics", label: "RUM Analytics", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/rum-analytics"] },
  { key: "security-monitoring", label: "Security Monitoring & Alerting", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/security-monitoring"] },
  { key: "security-audit-log", label: "Security Audit Log", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/security-audit-log"] },
  { key: "phone-validation-rules", label: "Phone Validation Rules", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/admin/phone-validation"] },
  { key: "sensitive-access-log", label: "Sensitive Access Log", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/sensitive-access-log"] },
  { key: "ip-blocks", label: "IP & Device Blocks", tier: "admin", roles: ADMIN_ONLY, paths: ["/ip-blocks"] },

  { key: "recycle-bin", label: "Recycle Bin", tier: "admin", roles: ["admin", "oic"], paths: ["/recycle-bin"] },
  { key: "retention-policy", label: "Retention Policy", tier: "admin", roles: ADMIN_ONLY, paths: ["/announcements/retention", "/retention-policy"] },
  { key: "settings", label: "System Settings", tier: "admin", roles: ADMIN_ONLY, paths: ["/settings"] },
  { key: "branding", label: "Branding Settings", tier: "admin", roles: ADMIN_ONLY, paths: ["/branding"] },

  // ── Monitoring, Evaluation, Project & Performance Management ─────────────
  // Executive and assurance surfaces stay command tier + M&E delivery roles.
  // Field officers reach only their own field reporting and evidence.
  { key: "me-command-center", label: "M&E Command Center", tier: "command", roles: [...COMMAND, ...ME_DELIVERY], paths: ["/me/command-center"] },
  { key: "me-objectives", label: "Strategic Objectives", tier: "command", roles: [...COMMAND, ...ME_DELIVERY], paths: ["/me/objectives"] },
  { key: "me-programs", label: "Programs", tier: "module", roles: [...COMMAND, ...ME_DELIVERY], paths: ["/me/programs"] },
  { key: "me-projects", label: "Projects", tier: "module", roles: [...COMMAND, ...ME_DELIVERY, ...SHIFT_LEADERSHIP], paths: ["/me/projects"] },
  { key: "me-workplans", label: "Workplans", tier: "module", roles: [...COMMAND, ...ME_DELIVERY, ...SHIFT_LEADERSHIP], paths: ["/me/workplans"] },
  { key: "me-measures", label: "KPIs and Indicators", tier: "module", roles: [...COMMAND, ...ME_DELIVERY], paths: ["/me/measures"] },
  { key: "me-results", label: "Results Framework", tier: "module", roles: [...COMMAND, ...ME_DELIVERY], paths: ["/me/results"] },
  { key: "me-field-reports", label: "Field Reports", tier: "module", roles: [...COMMAND, ...ME_DELIVERY, ...ME_FIELD, ...SHIFT_LEADERSHIP], paths: ["/me/field-reports"] },
  { key: "me-gis-map", label: "GIS Map", tier: "module", roles: [...COMMAND, ...ME_DELIVERY, ...SHIFT_LEADERSHIP], paths: ["/me/gis-map"] },
  { key: "me-risks", label: "Risks and Issues", tier: "module", roles: [...COMMAND, ...ME_DELIVERY], paths: ["/me/risks"] },
  { key: "me-incidents", label: "Incidents", tier: "module", roles: [...COMMAND, ...ME_DELIVERY, ...SHIFT_LEADERSHIP], paths: ["/me/incidents"] },
  { key: "me-actions", label: "Corrective Actions", tier: "module", roles: [...COMMAND, ...ME_DELIVERY], paths: ["/me/actions"] },
  { key: "me-resources", label: "M&E Resources", tier: "module", roles: [...COMMAND, ...ME_DELIVERY, "storekeeper"], paths: ["/me/resources"] },
  { key: "me-budgets", label: "M&E Budgets", tier: "command", roles: [...COMMAND, ...ME_DELIVERY, "procurement_officer"], paths: ["/me/budgets"] },
  { key: "me-evidence", label: "Evidence", tier: "module", roles: [...COMMAND, ...ME_DELIVERY, ...ME_FIELD], paths: ["/me/evidence"] },
  { key: "me-approvals", label: "M&E Approvals", tier: "command", roles: [...COMMAND, ...ME_DELIVERY], paths: ["/me/approvals"] },
  { key: "me-reports", label: "M&E Reports", tier: "module", roles: [...COMMAND, ...ME_DELIVERY], paths: ["/me/reports"] },
  { key: "me-analytics", label: "M&E Analytics", tier: "command", roles: [...COMMAND, ...ME_DELIVERY], paths: ["/me/analytics"] },
  { key: "me-audit", label: "M&E Audit", tier: "admin", roles: ADMIN_OIC_2IC, paths: ["/me/audit"] },
  { key: "me-administration", label: "M&E Administration", tier: "admin", roles: ADMIN_ONLY, paths: ["/me/administration"] },
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

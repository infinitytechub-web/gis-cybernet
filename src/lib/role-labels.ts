// Centralized human-readable labels for app_role values.
// Use ROLE_LABEL[role] anywhere a role is shown in the UI.

import type { AppRole } from "@/lib/types";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  oic: "OIC",
  "2ic": "2IC",
  head_of_administration: "Head of Administration",
  chief_staff_officer: "Chief Staff Officer",
  staff_officer: "Staff Officer",
  supervisor: "Supervisor",
  shift_supervisor: "Shift Supervisor",
  deputy_shift_supervisor: "Deputy Shift Supervisor",
  staff: "Staff",
  front_desk: "Front Desk",
  night_guard: "Night Guard",
};

// Roles considered command tier (mirrors AuthContext.isAdminOrSupervisor for display purposes)
export const COMMAND_TIER_ROLES: AppRole[] = [
  "admin",
  "oic",
  "2ic",
  "head_of_administration",
  "chief_staff_officer",
  "staff_officer",
  "supervisor",
];

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Staff";
  return (ROLE_LABEL as Record<string, string>)[role] ?? role.replace(/_/g, " ");
}

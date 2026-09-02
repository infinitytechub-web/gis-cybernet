// Centralized human-readable labels for app_role values.
// Use ROLE_LABEL[role] anywhere a role is shown in the UI.

import type { AppRole } from "@/lib/types";

export const ROLE_LABEL: Partial<Record<AppRole, string>> = {
  admin: "Admin",
  oic: "OIC",
  "2ic": "2IC",
  head_of_administration: "Head of Administration",
  chief_staff_officer: "Chief Staff Officer",
  command_officer: "Command Officer",
  me_officer: "M&E Officer",
  project_manager: "Project Manager",
  field_officer: "Field Officer",
  head_of_processing: "Head of Processing",
  deputy_head_of_processing: "Deputy Head of Processing",
  staff_officer: "Staff Officer",
  supervisor: "Supervisor",
  shift_supervisor: "Shift Supervisor",
  deputy_shift_supervisor: "Deputy Shift Supervisor",
  shift_leader: "Shift Leader",
  deputy_shift_leader: "Deputy Shift Leader",
  deputy_supervisor: "Deputy Supervisor",
  front_desk: "Front Desk",
  storekeeper: "Storekeeper",
  procurement_officer: "Procurement Officer",
  medical_officer: "Medical Officer",
  special_duties: "Special Duties",
  staff: "Staff",
};

// Roles considered command tier (mirrors AuthContext.isAdminOrSupervisor for display purposes)
export const COMMAND_TIER_ROLES: AppRole[] = [
  "admin",
  "oic",
  "2ic",
  "head_of_administration",
  "chief_staff_officer",
  "command_officer",
  "staff_officer",
  "supervisor",
];

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Staff";
  return (ROLE_LABEL as Record<string, string>)[role] ?? role.replace(/_/g, " ");
}

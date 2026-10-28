/**
 * Validation for the Create Staff Account screen.
 *
 * Pure functions so the rules are unit-testable; the screen additionally
 * confirms duplicates against live data and the account-provisioning edge
 * function re-validates role and password server-side.
 */
import { checkPassword, type PasswordPolicy } from "@/lib/password-policy";
import { isValidGhanaCard } from "@/components/shared/GhanaCardInput";

export interface StaffAccountForm {
  staffId: string;
  firstName: string;
  lastName: string;
  gender: string;
  phone: string;
  ghanaCard: string;
  orgUnitId: string;
  role: string;
  password: string;
}

/** Returns the first validation error, or null when the form is submittable. */
export function validateStaffAccountForm(
  form: StaffAccountForm,
  policy: PasswordPolicy,
): string | null {
  if (!form.staffId.trim()) return "Staff ID is required";
  if (!form.firstName.trim()) return "First name is required";
  if (!form.lastName.trim()) return "Last name is required";
  if (!form.orgUnitId) return "Select the Command / Unit this staff member is posted to";
  if (!form.role) return "Select a designated role";
  if (form.ghanaCard.trim() && !isValidGhanaCard(form.ghanaCard.trim())) {
    return "Ghana Card must be in the format GHA-XXXXXXXXX-X";
  }
  if (!form.password) return "Set a temporary password for the new account";
  const check = checkPassword(form.password, policy);
  if (!check.ok) return `Password does not meet the policy: ${check.errors[0]}`;
  return null;
}

/** Profile insert payload — mirrors the Staff / Employees page structure. */
export function buildProfilePayload(form: StaffAccountForm, extras: {
  rankId?: string;
  departmentId?: string;
  unit?: string;
  phoneLocal?: string | null;
}) {
  return {
    staff_id: form.staffId.trim(),
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim(),
    gender: form.gender || null,
    phone: extras.phoneLocal ?? null,
    unit: extras.unit?.trim() || null,
    rank_id: extras.rankId || null,
    department_id: extras.departmentId || null,
    org_unit_id: form.orgUnitId,
    status: "active",
    ghana_card_number: form.ghanaCard.trim() || null,
  };
}

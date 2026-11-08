/** Permission levels only a Super Admin may build a custom role on (mirrors custom_role_base_allowed on the server). */
export const ADMIN_ONLY_BASE_ROLES = ["admin", "oic", "2ic", "head_of_administration", "chief_staff_officer", "command_officer"];
export function allowedBaseRoles(all: readonly string[], isAdmin: boolean): string[] {
  return all.filter(r => isAdmin || !ADMIN_ONLY_BASE_ROLES.includes(r));
}

// Shared authority check for staff-administration edge functions
// (password resets, account deletion, bulk account creation/repair).
//
// Authority = the `admin` role, OR an active command-tier grant for the
// `staff_admin` capability (or a wildcard grant), which Admin/OIC/2IC can
// delegate from the Command Roles screen. The grant check is done through the
// security-definer `has_command_capability` RPC so the rule lives in one place
// and is enforced server-side.
export async function hasStaffAdminAuthority(
  adminClient: { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any },
  userId: string,
): Promise<boolean> {
  try {
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if ((roles ?? []).some((r: { role: string }) => r.role === "admin")) return true;
  } catch (_e) { /* fall through to capability check */ }

  try {
    const { data, error } = await adminClient.rpc("has_command_capability", {
      _user_id: userId,
      _capability: "staff_admin",
    });
    if (!error && data === true) return true;
  } catch (_e) { /* deny */ }

  return false;
}

export const STAFF_ADMIN_DENIED =
  "Forbidden: administrator authority (or a delegated staff-administration grant) is required";

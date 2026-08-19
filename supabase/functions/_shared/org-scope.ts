// Shared hierarchical-RBAC guard for edge functions.
//
// The command hierarchy (Regional Command → Sector → District → Station → Unit)
// lives in `org_units`; a caller's scope is their own posting plus every
// delegated oversight branch (`org_unit_assignments`), expanded downwards. The
// rule itself is implemented once in the database (`has_org_access`,
// `can_access_staff_profile`, `can_manage_org_unit`) — these helpers just call
// it with the service-role client so an API request cannot bypass the UI gate.

type Client = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => any;
};

export const ORG_SCOPE_DENIED =
  "Forbidden: the target record is outside your command scope";

/** True when `userId` may act on the staff profile `profileId`. */
export async function canAccessStaffProfile(
  admin: Client,
  userId: string,
  profileId: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("can_access_staff_profile", {
      _user_id: userId,
      _profile_id: profileId,
    });
    if (error) return false;
    return data === true;
  } catch (_e) {
    return false;
  }
}

/** True when `userId` may read/act on data tagged with `orgUnitId`. */
export async function hasOrgAccess(
  admin: Client,
  userId: string,
  orgUnitId: string | null | undefined,
): Promise<boolean> {
  if (!orgUnitId) return true;
  try {
    const { data, error } = await admin.rpc("has_org_access", {
      _user_id: userId,
      _org_unit_id: orgUnitId,
    });
    if (error) return false;
    return data === true;
  } catch (_e) {
    return false;
  }
}

/** True when `userId` holds manage authority over `orgUnitId` (or above it). */
export async function canManageOrgUnit(
  admin: Client,
  userId: string,
  orgUnitId: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("can_manage_org_unit", {
      _user_id: userId,
      _org_unit_id: orgUnitId,
    });
    if (error) return false;
    return data === true;
  } catch (_e) {
    return false;
  }
}

/** Split profile ids into the ones inside / outside the caller's scope. */
export async function partitionProfilesByScope(
  admin: Client,
  userId: string,
  profileIds: string[],
): Promise<{ allowed: string[]; denied: string[] }> {
  const allowed: string[] = [];
  const denied: string[] = [];
  // Batched to keep large bulk operations responsive.
  const batchSize = 25;
  for (let i = 0; i < profileIds.length; i += batchSize) {
    const batch = profileIds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((id) => canAccessStaffProfile(admin, userId, id)),
    );
    batch.forEach((id, idx) => (results[idx] ? allowed : denied).push(id));
  }
  return { allowed, denied };
}

/** 403 response body used by every org-scope rejection. */
export function orgScopeDeniedResponse(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error: ORG_SCOPE_DENIED }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Credential updates (email / password) with an administrator AAL2 bypass.
//
// Rule enforced system-wide: system administrators never need a verified 2FA
// (AAL2) session to change their own email address or password. Supabase's
// user-scoped `auth.updateUser` refuses those changes on an AAL1 session once a
// factor is enrolled, so for admins we route the change through the
// `admin-self-credentials` edge function (Auth Admin API, no AAL requirement).
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";

/** True when an auth error is the "verified 2FA session required" refusal. */
export function isAal2Error(error: unknown): boolean {
  const msg = (error as { message?: string } | null)?.message ?? "";
  return /aal2|assurance level|insufficient_aal|reauthentication/i.test(msg);
}

/** True when the signed-in user holds the `admin` role. */
export async function currentUserIsAdmin(): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return false;
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

async function adminSelfUpdate(payload: { email?: string; password?: string }): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-self-credentials", {
    body: payload,
  });
  if (error) throw new Error(await extractEdgeFunctionError(error, "Failed to update credentials"));
  if (!(data as { success?: boolean })?.success) {
    throw new Error((data as { error?: string })?.error ?? "Failed to update credentials");
  }
}

/**
 * Updates the signed-in user's email and/or password. Admins bypass AAL2:
 * either directly (when the normal call refuses) or up-front when known.
 */
export async function updateOwnCredentials(payload: {
  email?: string;
  password?: string;
  /** Skip the standard path and use the admin bypass straight away. */
  preferAdminBypass?: boolean;
}): Promise<{ viaAdminBypass: boolean }> {
  const { email, password, preferAdminBypass } = payload;
  if (!email && !password) return { viaAdminBypass: false };

  if (preferAdminBypass) {
    await adminSelfUpdate({ email, password });
    return { viaAdminBypass: true };
  }

  const { error } = await supabase.auth.updateUser({
    ...(email ? { email } : {}),
    ...(password ? { password } : {}),
  });
  if (!error) return { viaAdminBypass: false };

  // Admins are exempt from the AAL2 requirement — retry via the Admin API.
  if (isAal2Error(error) && (await currentUserIsAdmin())) {
    await adminSelfUpdate({ email, password });
    return { viaAdminBypass: true };
  }
  throw error;
}

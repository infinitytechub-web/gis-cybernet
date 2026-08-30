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

/** True when the auth error means the access token no longer maps to a session. */
export function isSessionMissingError(error: unknown): boolean {
  const anyErr = error as { message?: string; code?: string; status?: number } | null;
  const msg = anyErr?.message ?? "";
  const code = anyErr?.code ?? "";
  return (
    /session (not found|missing)|auth session missing|missing sub claim|bad_jwt|invalid claim/i.test(msg) ||
    /session_not_found|bad_jwt/i.test(code)
  );
}

const SESSION_LOST_MESSAGE =
  "Your sign-in session is no longer valid. Please sign in again and retry the password change.";

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
 * the change is applied through the Auth Admin API, which also revokes the
 * current session — so we immediately re-establish one with the new
 * credentials, otherwise every follow-up call fails with "Auth session missing".
 */
export async function updateOwnCredentials(payload: {
  email?: string;
  password?: string;
  /** Skip the standard path and use the admin bypass straight away. */
  preferAdminBypass?: boolean;
}): Promise<{ viaAdminBypass: boolean }> {
  const { email, password, preferAdminBypass } = payload;
  if (!email && !password) return { viaAdminBypass: false };

  // A live session is required for BOTH paths (the edge function authorises
  // the caller from the bearer token). Fail with a clear message instead of a
  // raw "Auth session missing" / 403 session_not_found from the Auth API.
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session ?? null;
  if (!session?.access_token) throw new Error(SESSION_LOST_MESSAGE);
  const currentEmail = session.user?.email ?? undefined;

  /** Re-establish a session after the Admin API revoked the old one. */
  const restoreSession = async () => {
    if (!password) return;
    const signInEmail = email ?? currentEmail;
    if (!signInEmail) return;
    const { data: fresh } = await supabase.auth.getSession();
    if (fresh?.session?.access_token) {
      // Confirm the token still resolves to a live session server-side.
      const { error: probeErr } = await supabase.auth.getUser();
      if (!probeErr) return;
    }
    await supabase.auth.signInWithPassword({ email: signInEmail, password }).catch(() => undefined);
  };

  const runBypass = async () => {
    await adminSelfUpdate({ email, password });
    await restoreSession();
    return { viaAdminBypass: true };
  };

  const isAdmin = preferAdminBypass ? true : await currentUserIsAdmin();
  // Admins always go through the Admin API — attempting the user-scoped call
  // first only produces 401 insufficient_aal / 403 session_not_found noise.
  if (isAdmin) return runBypass();

  const { error } = await supabase.auth.updateUser({
    ...(email ? { email } : {}),
    ...(password ? { password } : {}),
  });
  if (!error) return { viaAdminBypass: false };
  if (isSessionMissingError(error)) throw new Error(SESSION_LOST_MESSAGE);
  throw error;
}


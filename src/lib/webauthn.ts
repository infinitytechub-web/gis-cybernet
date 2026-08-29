/**
 * Biometric sign-in (WebAuthn / FIDO2 passkeys) — client helpers.
 *
 * The device performs the fingerprint / Face ID check locally and returns only
 * a signed assertion. No fingerprint image, face image or biometric template
 * ever leaves the device, and none is sent to or stored by the server.
 */
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";

export type StepUpAction =
  | "password_reset"
  | "account_create"
  | "account_delete"
  | "role_grant"
  | "command_role_grant"
  | "recycle_bin_purge"
  | "backup_restore"
  | "data_export";

/** True when this browser can perform WebAuthn at all. */
export function supportsWebAuthn(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/**
 * True when the device has a built-in biometric / PIN authenticator
 * (Touch ID, Face ID, Windows Hello, Android fingerprint).
 */
export async function biometricsAvailable(): Promise<boolean> {
  if (!supportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

/** Friendly label for the current device, used when enrolling. */
export function currentDeviceLabel(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const platform = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
    ? "iPad"
    : /Android/.test(ua)
    ? "Android device"
    : /Macintosh|Mac OS X/.test(ua)
    ? "Mac"
    : /Windows/.test(ua)
    ? "Windows PC"
    : /Linux/.test(ua)
    ? "Linux PC"
    : "This device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
    ? "Opera"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /Safari\//.test(ua)
    ? "Safari"
    : "Browser";
  return `${platform} — ${browser}`;
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(await extractEdgeFunctionError(error, "Biometric request failed"));
  return data as T;
}

/** Best-effort audit logging; never blocks the enrollment flow. */
export async function logBiometricEnrollmentEvent(
  event: "enroll_attempt" | "enroll_failure" | "status_change",
  detail?: string,
  deviceLabel?: string,
): Promise<void> {
  try {
    await supabase.rpc("webauthn_log_enrollment_event", {
      _event: event,
      _detail: detail ?? null,
      _device_label: deviceLabel ?? null,
    });
  } catch {
    /* audit logging must never break the user flow */
  }
}

/** Enrol the current device for the signed-in user. Requires explicit consent. */
export async function enrollBiometric(consent: boolean, label?: string): Promise<string> {
  const deviceLabel = label ?? currentDeviceLabel();
  if (!consent) throw new Error("Consent is required before biometric enrollment");
  if (!(await biometricsAvailable())) {
    await logBiometricEnrollmentEvent(
      "enroll_failure",
      "Device does not support platform authenticators",
      deviceLabel,
    );
    throw new Error("This device does not support fingerprint or Face ID sign-in");
  }

  await logBiometricEnrollmentEvent("enroll_attempt", "Enrollment started", deviceLabel);

  try {
    const { options } = await invoke<{ options: Record<string, unknown> }>(
      "webauthn-register-options",
      {},
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attResponse = await startRegistration({ optionsJSON: options as any });

    const result = await invoke<{ verified: boolean; device_label: string }>(
      "webauthn-register-verify",
      { response: attResponse, consent: true, device_label: deviceLabel },
    );
    if (!result.verified) throw new Error("Enrollment could not be verified");
    return result.device_label;
  } catch (err) {
    await logBiometricEnrollmentEvent(
      "enroll_failure",
      err instanceof Error ? err.message : "Enrollment failed",
      deviceLabel,
    );
    throw err;
  }
}


export type BiometricLoginResult =
  | { status: "not_enrolled" }
  | { status: "cancelled" }
  | { status: "success"; email: string; tokenHash: string; mfaSatisfied: boolean };

/**
 * Attempt a passwordless biometric sign-in for a Staff/Admin ID.
 * Returns `not_enrolled` when the ID has no passkey on file (the caller then
 * falls back to password), and `cancelled` when the user dismisses the prompt.
 */
export async function biometricLogin(
  staffId: string,
  deviceFingerprint?: string | null,
): Promise<BiometricLoginResult> {
  const optionsResult = await invoke<{ enrolled: boolean; options?: Record<string, unknown> }>(
    "webauthn-login-options",
    { staff_id: staffId },
  );
  if (!optionsResult.enrolled || !optionsResult.options) return { status: "not_enrolled" };

  let assertion;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assertion = await startAuthentication({ optionsJSON: optionsResult.options as any });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "AbortError") return { status: "cancelled" };
    throw e;
  }

  const verify = await invoke<{
    verified: boolean;
    email: string;
    token_hash: string;
    mfa_satisfied: boolean;
  }>("webauthn-login-verify", {
    staff_id: staffId,
    response: assertion,
    device_fingerprint: deviceFingerprint ?? null,
  });

  if (!verify.verified) throw new Error("Biometric sign-in failed");
  return {
    status: "success",
    email: verify.email,
    tokenHash: verify.token_hash,
    mfaSatisfied: verify.mfa_satisfied,
  };
}

/**
 * Ask for a fresh confirmation before a sensitive action.
 * Tries biometrics first; pass a password to use the fallback path.
 * Returns the single-use step-up token hash to hand to the sensitive action.
 */
export async function confirmStepUp(
  action: StepUpAction,
  opts: { password?: string } = {},
): Promise<{ tokenHash: string; method: "biometric" | "password" }> {
  if (!opts.password) {
    const optionsResult = await invoke<{ enrolled: boolean; options?: Record<string, unknown> }>(
      "webauthn-stepup-options",
      {},
    );
    if (!optionsResult.enrolled || !optionsResult.options) {
      throw new Error("NO_BIOMETRIC");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assertion = await startAuthentication({ optionsJSON: optionsResult.options as any });
    const verified = await invoke<{ token_hash: string; method: "biometric" | "password" }>(
      "webauthn-stepup-verify",
      { action, response: assertion },
    );
    return { tokenHash: verified.token_hash, method: verified.method };
  }

  const verified = await invoke<{ token_hash: string; method: "biometric" | "password" }>(
    "webauthn-stepup-verify",
    { action, password: opts.password },
  );
  return { tokenHash: verified.token_hash, method: verified.method };
}

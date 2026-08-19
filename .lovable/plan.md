# Biometric Sign-In (Passkeys / WebAuthn)

Add fingerprint and Face ID sign-in to the Staff and Admin login screens using the device's own secure authentication (WebAuthn/FIDO2 passkeys). No fingerprint image, face image or biometric template ever reaches the server — the phone or laptop keeps the biometric locally and only returns a signed cryptographic proof.

## What you get

**On the login screen**
- A "Sign in with fingerprint / Face ID" button next to the existing Staff ID + password form, shown only when the device and browser actually support it.
- Enter Staff/Admin ID, tap the button, confirm with fingerprint or face — you are signed in, no password needed.
- Password stays exactly as it is today and is used automatically whenever biometrics are unavailable, cancelled, or fail. Nothing about the current login breaks.
- For admin accounts that use authenticator-app 2FA, a successful biometric sign-in on an enrolled device counts as the second factor, so no 6-digit code is requested. Password sign-in still asks for the code.
- Existing account lockout, failed-attempt counting, and IP/device block checks apply to biometric attempts too.

**Enrollment (security settings)**
- A new "Biometric Sign-In" panel in Security Settings, available to every signed-in staff member.
- Explicit consent text and a checkbox before enrolling; enrollment registers the current device only ("iPhone 14 — Safari"), so each device is enrolled separately.
- List of enrolled devices with last-used date, and a Remove button to revoke any of them.
- A master on/off switch: turning biometric login off blocks it account-wide even if devices are still enrolled.

**Admin oversight**
- An admin-only view (Admin Console → Security Settings) listing every enrolled credential across all staff, with the ability to revoke any of them.
- Every enrollment, sign-in success, sign-in failure, revocation and settings change is written to the biometric audit log, visible to admins and command tier per existing RBAC.

**Step-up confirmation**
- Sensitive operations ask for a fresh fingerprint/Face ID confirmation (or password re-entry when biometrics aren't available): password resets, account creation/deletion, role and command-role grants, recycle-bin purge, backup restore, and staff/HRM data exports.

## Technical approach

**Database (new tables, RLS + GRANTs)**
- `webauthn_credentials` — credential id, public key, sign counter, transports, AAGUID, device label, user id, `created_at`, `last_used_at`, `revoked_at`. Users read/insert/revoke their own rows; admins may read and revoke any. Public keys are not secret, but the table is never exposed to `anon`.
- `webauthn_challenges` — short-lived server-issued challenge, user id (nullable for discoverable login), expiry. Service-role only; pruned on use and by expiry.
- `webauthn_audit` — append-only (`enroll`, `authenticate_success`, `authenticate_failure`, `revoke`, `settings_change`, `stepup_success`, `stepup_failure`) with staff id, IP, device fingerprint, user agent. Insert via security-definer RPC; admin/command read only; mutation-blocking trigger like `security_audit_log`.
- `profiles`/settings flag: `biometric_login_enabled` per user (default false) plus an `app_settings` global kill switch.

**Edge functions** (`@simplewebauthn/server` via `npm:` specifier, RP ID derived from the request origin so it works on preview, published, and the custom domain)
- `webauthn-register-options` / `webauthn-register-verify` — JWT-validated; enrolls a credential for the caller, requires `userVerification: "required"` and a platform authenticator so only device biometrics/PIN qualify.
- `webauthn-login-options` — takes Staff/Admin ID, reuses `resolve-staff-email` logic, runs `is_staff_locked` and `is_ip_blocked` first, returns allowed credentials + challenge (uniform response when the ID is unknown, so it can't be used to enumerate staff).
- `webauthn-login-verify` — verifies the assertion, then mints a real session using the admin API (`generateLink` → `token_hash` returned to the client, which calls `supabase.auth.verifyOtp`). On success clears failed attempts and writes `authenticate_success` plus an `aal2`-equivalent marker for the admin 2FA bypass; on failure calls `record_failed_login` so lockout policy still bites.
- `webauthn-stepup-verify` — verifies a fresh assertion and returns a short-lived, single-use step-up token consumed by the sensitive-action RPCs.

**Frontend**
- `src/lib/webauthn.ts` — capability detection (`PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable`, conditional-mediation check), base64url helpers, register/authenticate/step-up wrappers, device label from user agent.
- `src/pages/Login.tsx` — biometric button + graceful fallback, wired into the existing lockout/block/2FA flow; unchanged when unsupported.
- `src/components/settings/BiometricSettings.tsx` — consent, enroll, device list, revoke, master toggle; new `biometric` tab in the `security` area of `/settings`, plus an entry under Admin Console → Security Settings → "Authentication & MFA".
- `src/components/security/BiometricAdminPanel.tsx` — admin credential list and revoke.
- `src/components/security/StepUpDialog.tsx` — reusable "confirm your identity" dialog (biometric first, password fallback) used by the sensitive actions listed above.
- RBAC: register new module keys in `src/lib/rbac.ts` (`biometric-settings` for all authenticated staff, `biometric-admin` for admin) so the sidebar/console visibility rules apply automatically.

**Verification**
- Vitest coverage for capability detection, base64url encoding, and step-up gating rules; RBAC test updates for the new module keys.
- Playwright check that the login page renders and works normally when WebAuthn is absent (the sandbox browser has no platform authenticator), plus a virtual-authenticator run over enroll → biometric sign-in → revoke.

## Notes and limits

- Passkeys are device-bound: each phone or laptop must be enrolled once. Apple and Google may sync passkeys across a user's own devices; that is the platform's behaviour, not something the app controls.
- Biometrics require HTTPS (the preview, published site, and custom domain all qualify) and a device with fingerprint/face hardware or a Windows Hello PIN. Everything else falls back to password automatically.
- Older browsers without WebAuthn see the current login screen unchanged, with no error.

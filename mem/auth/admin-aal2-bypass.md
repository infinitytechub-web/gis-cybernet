---
name: Admin AAL2 bypass for credentials
description: Admin accounts never need a verified 2FA (AAL2) session to change their own email or password
type: feature
---
System administrators (`admin` role) bypass the AAL2 step-up requirement for their own
email address and password updates.

- Client entry point: `updateOwnCredentials()` in `src/lib/admin-credentials.ts`. It tries
  `supabase.auth.updateUser` first and, on an AAL2/reauthentication refusal, retries via
  the edge function when the caller holds the `admin` role.
- Server: `supabase/functions/admin-self-credentials` — CSRF-guarded, session-verified,
  `admin`-role only, self-target only, applies the change through the Auth Admin API
  (no AAL requirement), mirrors email to `profiles.email`, and writes `system_audit_log`
  entries (`admin_self_password_update` / `admin_self_email_update`) with `aal2_bypass: true`.
  Passwords are never logged or returned.
- Wired into `ChangePasswordDialog`, `ForcePasswordChange`, and `ResetPassword`.
- AAL2 remains required for non-admins and for other sensitive operations (MFA backup
  codes, trusted-device registration).

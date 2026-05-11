---
name: Admin Recovery
description: In-app self-service password reset for admins via /admin-recovery. Two methods (server-side passphrase ADMIN_RECOVERY_PASSPHRASE secret, or unused MFA backup code). Edge function admin-recovery (verify_jwt false, CSRF-checked, 8s sleep on failure). Forces must_change_password=true after reset. ALSO clears account_locked and failed_login_attempts on success so a sole locked-out admin can recover (audited). Second-admin shortcut already exists in AdminAccountActions via admin-reset-password. Linked from Login page.
type: feature
---

## Routes & files
- Page: `src/pages/AdminRecovery.tsx` → `/admin-recovery` (public lazy route in `src/App.tsx`)
- Edge function: `supabase/functions/admin-recovery/index.ts`
- RPC: `public.admin_recovery_consume_backup_code(_user_id uuid, _code text)` — service_role only, bcrypt-verifies and marks used.
- Secret: `ADMIN_RECOVERY_PASSPHRASE` (runtime).
- Login link: small grey link beneath "Forgot password?" → `/admin-recovery`.

## Security
- CSRF: `assertCsrfSafe` (origin allow-list + `x-cybernet-app` header).
- Constant-time passphrase compare; 8s sleep on every failure.
- Audit: every attempt (success/fail/denied) inserted into `system_audit_log` with action `admin_recovery_*`, plus `mfa.admin_recovery_backup_code_*` events from the RPC.
- Target must have `admin` role in `user_roles` — non-admin staff IDs are rejected.
- Active sessions for the target user are signed out after a successful reset.
- Lockout state is cleared automatically on successful recovery (logged with `lockout_cleared` flag in system_audit_log) so the admin can sign in immediately.

## Password policy
12+ chars, mixed case, digit, symbol. Enforced server-side and client-side (PasswordStrength score ≥ 4).

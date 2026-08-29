---
name: MFA trusted ("remembered") devices
description: AAL2 step-up remember-this-device grants, server table mfa_trusted_devices + RPCs, admin/OIC/2IC review screen at /admin/trusted-devices
type: feature
---

**Step-up**: `src/components/auth/MfaStepUpDialog.tsx` elevates the session to AAL2 (TOTP challenge). Exports `hasVerifiedMfaSession()`, `isStepUpSatisfied(userId)`, `isAal2Required(error)`. Wired into `MfaBackupCodes.tsx` (server requires real AAL2) and `StaffMfaSettings.tsx`.

**Remember this device**: checkbox + 4/8/12/24h duration (24h hard cap). `src/lib/mfa-trusted-device.ts` fingerprints the browser (`device-fingerprint.ts`), registers server-side and mirrors the grant in localStorage; `getTrustedDeviceGrant` re-validates via RPC so admin revocation takes effect. Grants only skip client-side prompts — never server AAL2 checks.

**DB**: `public.mfa_trusted_devices` (append-only, delete blocked; revocation recorded). RPCs: `mfa_register_trusted_device` (needs AAL2), `mfa_trusted_device_check`, `mfa_revoke_trusted_device`, `mfa_revoke_all_trusted_devices`, `mfa_trusted_devices_feed` (admin/oic/2ic). All write `log_security_event` (`trusted_device_registered` / `trusted_device_revoked` / `trusted_devices_bulk_revoked`). Admin revocation requires a reason ≥ 5 chars.

**UI**: `/admin/trusted-devices` (`src/pages/TrustedDevices.tsx`), rbac module `trusted-devices`, roles ADMIN_OIC_2IC, sidebar under Admin → Access. Staff see and forget their own device in My Profile → Two-factor.

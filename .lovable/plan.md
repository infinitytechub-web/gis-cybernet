# MFA and Password-Policy Controls in Security Settings

Add a single admin-only **Access Policy** panel to Security Settings where lockout thresholds, password complexity, session limits and MFA requirements are configured once and then enforced everywhere — login, password changes, and the MFA gate.

Today these values are hardcoded: the lockout threshold is fixed at 3 failed attempts in a 15-minute window inside the database functions, password strength is a fixed 5-point scale with only a minimum length stored in settings, and there is no absolute session lifetime or concurrent-device cap.

## What admins will be able to set

**Account lockout**
- Failed-attempt threshold before an account locks
- The window those attempts are counted over (minutes)
- Whether the lock auto-expires after N minutes or requires an administrator to unlock (current behaviour)

**Password complexity**
- Minimum length (already stored, moves into this panel)
- Require uppercase, lowercase, number, symbol — individual toggles
- Minimum strength score (1-5) accepted by the strength meter
- Force password change on first login (already stored, moves into this panel)

**Session limits**
- Idle timeout and warning countdown (already stored, moves into this panel)
- Absolute session lifetime: sign the user out after N hours regardless of activity
- Concurrent-device cap: when a staff member signs in beyond the cap, their oldest session is signed out automatically and the event is audited

**MFA policy**
- Which roles must use MFA (replaces the raw list with a role checklist)
- Enrolment grace period in days for newly created accounts, after which the MFA gate becomes mandatory

Every save writes a security-audit entry showing which policy fields changed, old and new values.

## Enforcement points

- **Login** reads the live lockout policy, so the "N attempts remaining" message and the lock itself follow the configured threshold and window.
- **Password change / reset / bulk account creation** validate against the complexity policy server-side, not just in the UI; the strength meter and helper text list the currently required rules.
- **Session watcher** applies idle timeout (existing), plus the new absolute lifetime, and reacts to being displaced by the concurrent-device cap the same way forced sign-outs already work.
- **MFA gate** treats a role as requiring MFA only after the account's grace period has elapsed.

Nothing loosens by default: the shipped defaults match today's behaviour (3 attempts / 15 minutes / admin unlock, 8-character minimum, 30-minute idle timeout, MFA required for admin, OIC and 2IC).

## Technical notes

- Migration extends `public.app_settings` with `lockout_threshold`, `lockout_window_minutes`, `lockout_auto_unlock_minutes`, `password_require_upper/lower/number/symbol`, `password_min_strength`, `session_absolute_hours`, `max_concurrent_sessions`, `mfa_grace_days` — all NOT NULL with defaults equal to current behaviour.
- `record_failed_login` and `is_staff_locked` are rewritten to read the policy row instead of their hardcoded constants, keeping their current signatures and return shape so `Login.tsx` needs no contract change. Auto-unlock is applied when `lockout_auto_unlock_minutes` is set.
- New `public.validate_password_policy(_password text)` security-definer function returns the list of unmet rules; called from the password-change paths and from the admin password-reset RPCs.
- Concurrent-session enforcement reuses the existing `presence_events` / `forced_signouts` machinery: a `enforce_session_limit` RPC called at sign-in trims sessions beyond the cap by inserting forced-signout rows, which `useForcedSignoutWatcher` already honours.
- New `src/components/settings/AccessPolicySettings.tsx`, registered as an **Access Policy** tab in `src/pages/Settings.tsx` under the security area and gated in `src/lib/rbac.ts` to admin only. The lockout, password and session fields currently sitting in `AppSettings.tsx` move here to avoid two places editing the same row.
- `src/lib/password-policy.ts` holds the shared client-side rule evaluation; `src/components/ui/password-strength.tsx` takes an optional policy prop so its bars and labels reflect the configured rules.
- `useAppSettings.ts` / `AuthContext.tsx` extend their selects to carry the new fields, keeping the existing realtime subscription so policy changes apply without a reload.

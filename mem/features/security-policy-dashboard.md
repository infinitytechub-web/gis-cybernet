---
name: Security policy dashboard & self-service MFA
description: security_policy_dashboard RPC + dashboard widget (locked staff, attempts remaining, lockouts, session revocations); staff self-service MFA; MFA required roles + 7-day grace
type: feature
---

**Dashboard widget** — `src/components/dashboard/SecurityPolicyWidget.tsx`, mounted in `AdminSecurityBand` behind rbac module `session-management`. Timeframe selector 24h/3d/7d/30d, 60s auto refresh.

- Data source: `security_policy_dashboard(_hours integer)` — one SECURITY DEFINER RPC returning JSON: `locked_staff`, `at_risk` (failed attempts inside the policy window + attempts remaining), `recent_lockouts`, `recent_unlocks`, `session_revocations` (`session_limit_enforced`, `logout_session`, `logout_all`), `counts`, plus the live policy (threshold / window / auto-unlock / device cap). Authorization: admin or `can_manage_sessions(auth.uid())` — raises otherwise; EXECUTE revoked from anon.
- `account_lockout_events` — append-only ledger written by `record_failed_login` the first time an account flips to locked (staff id, attempts, threshold, window, IP). Read: admin/command tier only; UPDATE/DELETE blocked by trigger.

**Self-service MFA** — `src/components/settings/StaffMfaSettings.tsx` mounted in `MyProfile`. Shows enrollment badge + `my_mfa_policy` (required / grace ends) banner and wraps `auth/TwoFactorSetup` (enrol, remove/reset, backup codes, recovery request). `mfa_generate_backup_codes` / `mfa_consume_backup_code` are no longer admin-only — any user with an AAL2 session may use them.

**Policy values**: MFA required for admin, oic, 2ic, staff_officer, supervisor, command_officer, shift_leader, front_desk, storekeeper, procurement_officer, medical_officer; `mfa_grace_days = 7`.

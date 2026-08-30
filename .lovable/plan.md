# Bulk Staff Account Password Handling

Tighten the "Bulk Create Staff Accounts" screen (Settings → Accounts) so generated temporary passwords are verified by the System Administrator, exported only as CSV/Excel, and fully audited.

## What exists today

- `bulk-create-accounts`, `reset-and-create-accounts` and `repair-missing-auth` generate passwords with a CSPRNG (`generateSecurePassword`, rejection sampling, 12 chars) and set `must_change_password: true` on the new auth user.
- `ForcePasswordChange` + `ProtectedRoute` already force a password change on first login and clear the flag afterwards.
- The reset flow stores credentials on the background job row and reads them back through the admin-only `consume_processing_job_credentials` RPC, which scrubs the passwords after the single read.
- The results table shows every password in clear text immediately, and the Download menu offers PDF / CSV / Excel / Word.
- `admin-reset-password` writes an audit entry; the three bulk functions currently write none, and no export is audited.

## Changes

### 1. Verification step before any export
- Passwords render masked (`••••••••`) by default, with a per-row reveal toggle and a "Reveal all" control.
- A verification panel above the table shows counts (accounts generated, failures) and a required checkbox: "I have verified these credentials against the intended staff accounts."
- Download stays disabled until the box is ticked. Copy-row stays available for spot checks.
- Row-level spot check: each row shows Staff ID, name, username and the profile link so the administrator can confirm the password belongs to the intended account.

### 2. Export format restriction
- Restrict the credentials `ExportMenu` to CSV and Excel only (drop PDF and Word for this dataset).
- Keep CSV values passed through the existing `csv-safe` sanitiser.
- Filename keeps date stamping; add a header note row marking the file CONFIDENTIAL.

### 3. Audit trail
- Client: log to `system_audit_log` via `logAdminAudit` on generation-result view, reveal-all, verification confirmation, and each export (entity type `staff_credentials`, action `generated` / `revealed` / `verified` / `exported`, with format and account count — never passwords).
- Server: add an audit insert to `bulk-create-accounts`, `reset-and-create-accounts` and `repair-missing-auth` recording the acting administrator, number of accounts created, number of failures and the role granted. No password values are recorded.

### 4. Secure handling
- Clear the in-memory results (and reveal state) when the administrator leaves the results view, and after a successful export prompt to clear.
- Confirm the reset job path continues to scrub the stored passwords on read; the create/repair paths never persist passwords at all.
- Keep the card and the RPC admin-only (existing `has_role(auth.uid(),'admin')` gate); no widening.

### 5. Verification
- Typecheck plus production build.
- Unit test that the credentials export payload contains only CSV/Excel formats and that CSV cells are sanitised.
- Authenticated browser pass over Settings → Accounts: masked-by-default rendering, download disabled until verification, download enabled after.
- Deployment credential test: after a bulk generation run, sign in with one generated credential in a browser session and confirm the app redirects to the forced password-change screen, then that the new password works and the flag clears.

## Technical notes

- Files touched: `src/components/settings/BulkCreateAccounts.tsx`, `src/lib/admin-audit.ts` (reuse only), the three edge functions above, plus a new test under `src/test/`.
- No schema migration is required; `system_audit_log` already carries the needed columns.
- Password length/charset stay as-is (CSPRNG, mixed case, digit, symbol).

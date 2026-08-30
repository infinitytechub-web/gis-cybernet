---
name: Bulk Staff Credential Handling
description: Bulk account credentials are masked, require an admin verification checkbox before CSV/Excel-only export, and every generate/reveal/verify/export is audited
type: feature
---
Settings → Accounts (`src/components/settings/BulkCreateAccounts.tsx`):
- Generated temporary passwords are masked (`••••••••••••`) with per-row eye toggle and "Reveal all".
- Download is disabled until the administrator ticks the "Verify before export" checkbox; formats limited to CSV and Excel (CSV sanitised via `src/lib/csv-safe.ts`).
- "Back" clears credentials from component memory; passwords are never persisted client-side.
- Client audit via `logAdminAudit("staff_credentials", …)` for actions: generated, revealed, verified, exported — counts/context only, never password values.
- Server audit inserts into `system_audit_log` from `bulk-create-accounts` (bulk_credentials_generated), `reset-and-create-accounts` (bulk_credentials_reset_started), `repair-missing-auth` (bulk_credentials_repaired).
- All accounts are created with `must_change_password: true`; ForcePasswordChange enforces the change at first login.

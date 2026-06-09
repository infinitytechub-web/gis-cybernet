# Fix: Security Scan / Supabase RLS/policy hygiene

## Root cause

The CI job `rls-policy-check` in `.github/workflows/security-scan.yml` fails on migration `supabase/migrations/20260609064003_8f50e228-...sql`. That migration creates a throwaway diagnostic table `public._delete_diag` to capture results of a test DELETE, but never enables RLS on it. The hygiene scanner flags every `CREATE TABLE` in `public` that isn't paired with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in the same file, so the job exits non-zero.

Re-running the CI check locally confirms this is the only failing file; permissive-policy, public-GRANT, and SECURITY DEFINER checks all pass.

## Fix

The diagnostic table was a one-shot debugging aid and shouldn't exist in `public` long-term. Two coordinated changes:

1. **Edit the offending migration** (`20260609064003_...sql`) to:
   - Add `ALTER TABLE public._delete_diag ENABLE ROW LEVEL SECURITY;` immediately after the `CREATE TABLE` (satisfies the hygiene scanner; no policies means no role can read it, which is correct for a diag-only table — `service_role` bypasses RLS so the DO block still writes to it).
   - Append `DROP TABLE public._delete_diag;` at the end so the table doesn't linger in the schema after the migration runs.

2. **Add a new follow-up migration** that runs `DROP TABLE IF EXISTS public._delete_diag;` so any environment that already applied the original migration also gets cleaned up.

## Verification

- Re-run the exact bash block from `.github/workflows/security-scan.yml` (the four greps for RLS, permissive policies, SECURITY DEFINER, and public GRANTs) locally and confirm `exit=0`.
- Run `scripts/check-firewall-rules-policy.mjs` to confirm the firewall_rules guard still passes.
- Confirm the diag migration still parses (no SQL changes other than the two added lines).

## Files touched

- `supabase/migrations/20260609064003_8f50e228-46a5-49ec-81d7-faf40750fba4.sql` — add RLS enable + final DROP TABLE.
- `supabase/migrations/<new timestamp>_drop-delete-diag.sql` — defensive DROP TABLE IF EXISTS for already-migrated environments.

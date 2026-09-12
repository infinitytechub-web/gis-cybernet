# Import the uploaded staff list and rename "Controls" to "Staffs"

## What the uploaded file contains (checked)

275 officers with: surname, first name, rank, unit/department, shift (A–D, blank for many senior officers), intake, region (all Greater Accra), phone, gender, email.

Two things to know before importing:

- The Staff ID column is `xxxxxx` on every row and the email is the same placeholder on every row, so both will be generated (staff number + `first.last@gis.local`).
- Ranks are written inconsistently (`INSP`, ` INSP`, `SNR. INSP`, `SNR INSP`, `AICO I  ` with trailing spaces). These are trimmed and treated as the same rank.

## The import screen

A new "Staff list" import screen (admin only) with the same preview-then-commit shape as the existing roster import:

1. Upload the CSV/XLSX. Columns are matched by name, so this exact file works unchanged.
2. Preview table: every parsed row with its generated staff number and email, the rank it matched, the unit/command it will be posted to, shift, phone, gender, region, and a status badge — New, Matched existing person, Rank will be created, Unit will be created, or Skipped with the reason.
3. Counters above the table: total rows, new people, matched people, existing staff who will be retired, ranks to create, units to create, rows with problems.
4. Commit. Nothing is written until Commit is pressed.

## What Commit does

- Creates any rank in the file that doesn't exist yet, and creates a unit/command for every distinct value in the UNIT/DEPARTMENT column exactly as written (including Sector Commander, Study Leave, Secondment, Resigned), each under the current sector command.
- Matches people by surname + first name. A match updates their rank, unit, shift, phone, gender and region. Everyone else is added as a new staff record.
- Because the uploaded list is authoritative: existing staff not present in the file are **retired, not deleted** — marked inactive and unposted, so their attendance, leave and audit history survives and an administrator can restore them. Deleting them outright would break those linked records.
- Creates sign-in accounts for the imported officers with temporary passwords using the existing bulk account tool, and offers the credential sheet for download once.
- Records the run (file name, who, counts, per-row outcome) so it can be reviewed afterwards.

## Rename

The hierarchy level currently shown as "Control" / "Controls" (the lowest level under Units) is renamed to "Staffs" everywhere it appears in the interface.

## Technical notes

- New page `src/pages/StaffListImport.tsx` at `/staff-list/import`, route + `staff-list-import` RBAC module + sidebar entry with description; parser in `src/lib/staff-list-import.ts` (xlsx, header aliasing, name/rank normalisation, generated staff numbers `GIS-<seq>` and de-duplicated `first.last@gis.local`).
- Migration: `staff_list_imports` (file name, uploaded_by, counts, status, notes) and `staff_list_import_rows` (import_id, row_no, parsed payload jsonb, outcome, profile_id, reason) — both with GRANTs to authenticated/service_role, RLS restricted to admin via `has_role`, `updated_at` trigger.
- Commit runs through one SECURITY DEFINER RPC `commit_staff_list_import(_import_id uuid)` so rank/unit creation, profile upsert, posting and retirement happen in a single transaction under an admin check; retirement sets `status='inactive'` and `org_unit_id=null` and never deletes rows. `restrict_profile_updates` / audit triggers stay in force.
- Account creation reuses `supabase/functions/bulk-create-accounts` (12-char temp passwords, force change on first sign-in); credentials returned once and exported with `src/lib/download-utils.ts`.
- Rename: `control: "Control"` → `"Staffs"` in `src/lib/org-hierarchy.ts` labels plus the header comments in `org-hierarchy.ts`, `CommandPicker.tsx`, `EstablishmentBrowser.tsx`, `HrHub.tsx`. The `org_unit_type` enum value `control` stays as-is (renaming a database enum value would break existing rows); only the displayed label changes.
- Verification: `bunx tsgo --noEmit`, vitest, build log, plus a Playwright pass over the import screen preview with this exact file.

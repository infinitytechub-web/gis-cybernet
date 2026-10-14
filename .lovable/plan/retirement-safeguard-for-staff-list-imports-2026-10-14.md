# Retirement safeguard for staff list imports

## What you will see

1. On the import preview, the red "N to be retired" badge becomes a button that opens the full list of staff who would be retired: name, staff number, rank, unit, and current status. The list is searchable, shows 25 per page, and can be downloaded as CSV.
2. When anyone would be retired, pressing Save opens a confirmation window instead of saving right away. It shows:
   - the number of people and the full list
   - a warning that these people will be set to inactive and removed from their unit. Nothing is deleted, and they can be restored.
   - a tick box: "I have checked this list and confirm these staff should be retired"
   - a box where you must type the number of people being retired
   Save stays disabled until both are done. If nobody would be retired, Save works as it does now.
3. When an administrator approves a saved import, the same confirmation appears again. The list is worked out fresh at that moment, because staff may have changed since the file was uploaded.
4. The number confirmed, the list of people, and who confirmed are recorded in the import's audit trail.

## Server-side protection

The approval step on the server will refuse to run if the number of people it would retire differs from the number the administrator confirmed. This stops a stale or changed list from retiring anyone unexpectedly.

## Technical details

- `StaffListImport.tsx`: change the `summary` memo to return a `retiringPeople` array as well as the count. Add a `RetirementReviewDialog` component (search, 25-item pagination, CSV export through `download-utils`, a checkbox, and a typed-count input). `submitForApproval` opens the dialog when `retiringPeople.length > 0`. The confirmed count and the profile IDs are stored in the `uploaded` audit row details.
- `StaffListImportActions.tsx`: before calling the approve/commit RPC, call a new read-only `preview_staff_list_retirements(_import_id)` RPC and show the same dialog. Then pass `_expected_retire_count` to the commit.
- Migration: add the `preview_staff_list_retirements` SECURITY DEFINER function (admin-checked). It uses the same subtree / not-touched logic as the commit and returns id, name, staff_id, rank, unit and status. Extend `commit_staff_list_import` with an optional `_expected_retire_count int`: it raises an exception when the value is missing and the retirement count is above 0, or when the value does not match. It also writes the retired IDs into `staff_list_import_audit`. The existing signature stays unchanged.
- Tests: a vitest for the dialog's gating (tick box + count). Then typecheck and build.

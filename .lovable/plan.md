# Staff Deletion, Transfer Sync & Legacy Cleanup

## What changes for users
- Deleting an officer (Super Admin or authorized Command Admin) removes them from every active command list, roster, duty/guard schedule, role assignment, unit posting and dashboard count. Legally required history (audit, finance, leave, detention, signatures, security logs) is kept in a restricted archive visible only to Super Admins.
- Transferring an officer moves them out of the old command's establishment and into the new one in one step, ending old-command roles/assignments and keeping a linked "from → to" history.
- Dashboards, analytics, establishment/vacancy figures and HR lists refresh automatically after either action.
- A new "Record Reconciliation" tool (Super Admin only) finds duplicates, stale assignments and orphaned records, shows a preview, and applies fixes only after confirmation with a reason.
- Every deletion, transfer, cleanup and admin action is logged; an integrity report runs after each and can be re-run on demand.

## Technical details
1. **Deletion cascade (server procedure)**: extend soft delete so it, in one transaction: ends active `org_unit_assignments`, `user_roles` (non-self), `command_tier_grants`, future `duty_roster_entries`/`guard_schedule_assignments`/`shift_assignments`, `misd_unit_assignments`, clears `org_positions` holder, cancels pending leave/postings; writes a restricted archive snapshot row (`staff_record_archive`, admin-only RLS) listing retained record references. Immutable tables are untouched.
2. **Transfer procedure**: `transfer_staff(profile, to_unit, reason)` — scope-checked (caller must cover both commands or be admin), closes old assignments/roles/grants scoped to old command, sets new org unit, inserts `postings_transfers` + `command_transfers` history linking old/new, audit row.
3. **Sync**: realtime publication on affected tables + client query invalidation for dashboards, analytics, establishment and directory hooks; statistics RPCs already read live rows so they update once rows change.
4. **Reconciliation**: `reconcile_staff_records_preview()` returns duplicates (same staff ID / Ghana Card / name+DOB), assignments pointing to deleted/inactive profiles or missing units, roles for banned users, orphan rows; `reconcile_staff_records_apply(ids, reason)` merges/ends/soft-deletes only the approved items — never hard deletes. Page under Deleted Records.
5. **Audit & integrity**: every procedure writes `system_audit_log`; `staff_integrity_check()` verifies no deleted officer appears in active lists, counts match, and retained records still exist. Add unit tests plus a signed-in admin run of delete → restore and transfer on a test officer.
6. Record the rule in `AGENTS.md`; update `roadmap.md`.

## Needs your confirmation
Duplicate merges will be proposed, not applied automatically — you approve each batch.

# Command-Level Roles

## What exists today
- Roles can be created for one command or for all commands. Duplicate names in the same command are blocked, and creating, editing and assigning roles are all recorded.
- Gap: a role belonging to Command A can still be given to an officer posted in Command B.
- Gap: you can't see a role's history (who created or changed it, and who was given or lost it) in one place.
- Gap: when an officer is transferred, roles tied to the old command stay with them.

## Changes
1. **Assign only within the role's command:** a role tied to a command can only be given to officers posted to that command or the stations under it. This applies to Super Admins too. Roles marked "All commands" stay assignable anywhere.
2. **Pick lists follow the command:** after choosing a role, the officer list shows only eligible officers. Each command head sees only their own command's roles, plus the "All commands" roles.
3. **Moving a role to another command:** if officers outside the new command still hold the role, the change is refused until they are removed.
4. **Transfers clean up automatically:** when an officer leaves a command, roles tied to that command are removed from them. Any access those roles gave is withdrawn unless another role still gives it. Each removal is recorded with the reason "Transferred out of command".
5. **Role history:** each role gets a History button showing every create, edit, assignment and removal, with who did it, when and why, 25 per page.

## Technical details
- `assign_custom_role`: require `p.org_unit_id` within `org_unit_descendants(r.org_unit_id)` when `r.org_unit_id` is set, for every caller including admin.
- `save_custom_role`: on org_unit change, reject if any assignee is outside the new subtree.
- Extend `profile_lifecycle_sync` (org_unit_id change) to call a helper that removes out-of-command custom-role assignments, reusing the heir/revoke logic, and audits to `staff_tier_audit`.
- New invoker-safe RPC `custom_role_history(_role_id)` reading `staff_tier_audit` filtered by details->>'custom_role_id'/'id', with the same manage-scope check.
- `CustomRolesManager.tsx` and Settings → User Roles: filter the officer picker by the role's command and add a History dialog with the shared 25-row pager.
- Tests: an assignment across commands is rejected; a transfer removes the command role; "All commands" roles still assign anywhere.
- Check first: count the existing assignments that already break rule 1, and report them instead of deleting them.

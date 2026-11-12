# Make every System Administrator a full Super Admin, system-wide

## What exists today
- The system has a single top security role, "admin", held by 4 live accounts: SYSTEM ADMINISTRATOR (GIS-ADMIN-001), SYSTEM ADMIN (ADMIN-001), DEPUTY ADMIN (DEPUTY-001) and RICHARD LORD KOBBY COFIE (GIS-ASC-0007). All 4 are assigned to a command.
- The screens use two names for this role: "System Administrator" and "Super Admin".
- About 60 server rules check for "admin" and also look at command or unit placement. Some of them may limit an admin to their own command, or give full power only through a command role (OIC/2IC or a command grant).

## What will change
1. **Audit every server rule** that checks admin together with command scope: access rules, approval queues, dashboards, Vault, Staff Vault, M&E, leave, transfers, reassignments, imports, analytics and exports. Every check that keeps an admin inside their own command will be changed so the admin role works across all Commands and Regions. Command-based rules for OIC, 2IC, Staff Officers and other roles stay as they are.
2. **Same fix in the app**: route guards, module checks and menu visibility will treat the admin role as Super Admin everywhere, with no command assignment needed.
3. **One name**: every screen, role picker, label and message will say "Super Admin" instead of "System Administrator".
4. **Effective right away**: role changes already reach open sessions within a minute or when the user returns to the tab. Super Admin access will apply on the next refresh, with no sign-out needed.
5. **Safeguards stay in place**: no self-approval, reasons are still required, records stay immutable, purges still need 30 days and a reason, and approval signing still needs a fresh password. Super Admin removes only the command boundary. It does not remove these protections.

## Verification
- Database checks, run as each of the 4 admin accounts, confirm full visibility across all Commands. Examples: all 278 active staff, every Command on dashboards, approval queues and the Vault list.
- A check confirms that OIC, 2IC and Staff Officer accounts are still limited to their own command, so no access opens up by accident.
- Signed-in preview checks as a Super Admin of the Regional Commands, HR Overview, Command Vault and Staff Mapping screens for a different command.
- Automated permission tests: Super Admin is allowed across all commands, and command roles are still scoped.
- After publishing, the same database checks are run again on the live system.

## Technical details
- One migration recreates the affected functions so that `has_role(auth.uid(),'admin')` short-circuits before any `user_org_scope` / `org_unit_id` / `is_command_head_for` scoping, and keeps all existing checks for non-admin roles.
- `src/lib/rbac.ts`, `AuthContext` and `ProtectedRoute`/`RequireModule` are reviewed so admin is unscoped. The label changes from "System Administrator" to "Super Admin". Tests are added in `src/test/rbac.test.ts`.
- An `AGENTS.md` rule is added: the admin role is the global, unscoped Super Admin.

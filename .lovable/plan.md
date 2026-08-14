# System-Wide RBAC Enforcement

Today every signed-in staff member can reach almost any page by typing the URL. Route protection (`ProtectedRoute`) only checks "is logged in" — no route in `src/App.tsx` declares a required role — and only a handful of pages (Settings, IP Blocks, Sensitive Access Log, Recycle Bin, Admin Console, Health Lab, MISD) gate themselves. The sidebar hides links, but hiding is not enforcement.

This plan closes that gap with one central access layer that every route, module and privileged action reads from, driven by System Administrator settings, Command Tier roles, staff role assignments and delegated capabilities.

## What changes for users

- Every module now has an explicit list of roles allowed to open it. Anyone else who types the URL, uses a bookmark, or pokes at the app from browser tools lands on a clear **Access Denied** page ("insufficient privileges — contact a System Administrator") instead of the module.
- Departmental, unit and section dashboards (Departments, MISD/CYBER, IPSE, Holding Center, Enforcement, Operations, Stores, Procurement, Health Lab, Front Desk, Processing, Command Vault, Interlink) are restricted to the roles that own them plus Command Tier oversight. Records within a permitted module stay visible as they are today — this pass is module-level gating, not per-row department scoping.
- Administrative and security modules (Admin Console, Command Roles, Role Assignments, Access Matrix, Audit Logs, Retention, Recycle Bin, IP Blocks/Firewall, Settings, RUM Analytics, Backups, Imports) stay Admin / Command-Tier only.
- Reports, searches, exports and print actions inside a module are only offered when the user's role carries that privilege, so an export button can't be used as a side door.
- System Administrators keep a live override: the existing permission matrix (System Settings) and command-tier grants feed the same access layer, so an admin can widen or narrow a role's module access without a code change.
- Admins are never locked out of anything.

## Technical approach

**1. Single source of truth — `src/lib/rbac.ts`**
- A `MODULES` registry: one entry per route/module with a stable key, label, tier (`admin` | `command` | `module` | `all-staff`) and the explicit `AppRole[]` allowed.
- Derived helpers: `canAccessModule(role, key, overrides, grants)`, `moduleForPath(pathname)`.
- Overrides layer: reads `permission_matrix_overrides` (already used by `src/components/settings/PermissionsMatrix.tsx`) and `command_tier_grants` via `has_command_capability`, so admin-tuned values win over the code defaults. Admin role short-circuits to allow.

**2. Central hook + gate components**
- `useModuleAccess(key)` — resolves role, matrix overrides and capability grants (cached with React Query, loaded once per session).
- `<RequireModule module="ip-blocks">` wrapper and a reusable `AccessDenied` screen (semantic, aria-live, shows the module name and the roles that may access it).
- `ProtectedRoute` gains an optional `module` prop; the denial path renders `AccessDenied` rather than a silent redirect. The existing `requiredRole` prop stays for compatibility.

**3. Route wiring (`src/App.tsx`)**
- Every route gets its `module` key. Routes with no restriction (`/dashboard`, `/my-profile`, `/my-portal`, `/excuse-duty`, `/directory`, `/change-password`) are declared explicitly as `all-staff` so nothing is un-audited.

**4. Page-level cleanup**
- Pages that currently roll their own check (Settings, IpBlocks, SensitiveAccessLog, RecycleBin, AdminConsole, HealthLab, Misd, CommandRoles) switch to the shared hook so behaviour and wording are identical everywhere.
- In-module privileged actions (exports, print, bulk actions, approvals) read capability booleans from the same hook instead of ad-hoc role string comparisons.

**5. Navigation consistency**
- `AppSidebar`, `MobileBottomNav`, `HeaderOverflowMenu` and the Admin Console tiles filter their entries through `canAccessModule`, so the menus can never disagree with the enforcement layer.

**6. Server-side backstop (no bypass via API / devtools)**
- Audit pass over RLS for the tables behind each restricted module using the database linter and targeted policy reads; tighten any table whose policies are looser than the module gate it backs.
- Audit pass over the privileged edge functions to confirm each one re-checks authority server-side via `_shared/staff-admin-auth.ts` / `has_command_capability` rather than trusting the caller. Any gap is fixed in place.
- Note: gates in the client are for UX; the RLS + edge-function checks are what actually stop a crafted API request. Both layers are covered.

**7. Verification — RBAC test suite**
- `src/test/rbac-matrix.test.ts` — asserts every route in `App.tsx` has a module key, every module key exists in the registry, and no module accidentally resolves to "everyone".
- `tests/smoke/rbac.smoke.spec.ts` — Playwright: for each configured test account (staff, and admin when credentials exist) walk the full restricted route list and assert Access Denied vs. allowed, plus direct REST reads with the staff token against the tables behind those modules to prove server-side denial.
- Extends the existing `permissions.smoke.spec.ts` contract and `E2E_*` env vars; skips cleanly when credentials are absent. Wired into the existing smoke workflow.
- Final run: unit suite + typecheck + smoke pass, with the resulting allow/deny matrix reported back.

## Out of scope

- Per-row department/unit/section data scoping (chosen: module gating only). Existing row-level rules stay as they are.
- New roles or changes to the role hierarchy.

---
name: Hierarchical command RBAC
description: Regional Command → Sector → District → Station → Unit tree (org_units), scope rules, and where it is enforced
type: feature
---

Command hierarchy powers scoped access on top of role-based RBAC.

- `org_units` — self-referencing tree; levels: national, regional, sector, district, station, unit. Cycle guard trigger.
- `org_unit_assignments` — extra oversight nodes per user, `can_manage` = authority to administer that branch (expiry + revoke supported).
- `profiles.org_unit_id` — the staff member's posting.

Scope rule (identical on client and server): a user sees their posting node plus **everything below it**, plus every assigned branch. Never upward or sideways. `admin` role = full scope. Records with `org_unit_id IS NULL` are unrestricted (rollout-safe).

Enforcement points:
- DB functions: `org_unit_descendants`, `org_unit_ancestors`, `user_org_scope`, `has_org_access`, `can_manage_org_unit`, `can_access_staff_profile` (all SECURITY DEFINER, anon EXECUTE revoked).
- RLS: org_units / org_unit_assignments manage policies use `can_manage_org_unit`; `profiles` has an additive org-scope SELECT policy and a RESTRICTIVE update policy.
- Edge functions: `_shared/org-scope.ts` (`canAccessStaffProfile`, `hasOrgAccess`, `canManageOrgUnit`, `partitionProfilesByScope`) wired into admin-reset-password, admin-delete-staff-account, bulk-create-accounts.
- Frontend: `src/lib/org-hierarchy.ts` + `useOrgScope()`; admin page `/org-structure` (module key `org-structure`, admin/oic/2ic); command posting selector in the staff form.

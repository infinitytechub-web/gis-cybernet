# Unit Dashboard staff search, selection and quick scroll

## What you get

1. A **Find staff** pop-up on the Unit Dashboard that searches the whole directory by name, staff ID, rank, department, unit/command and role — with results grouped by their command path.
2. **Single-select and multi-select** in that pop-up. With rows selected, a bulk action bar offers **Post / reassign to a unit** (the only bulk action, per your choice), gated so only admin and command-tier officers can run it.
3. An **Add staff** button inside the pop-up for people missing from the bulk-uploaded list. It creates the profile *and* a login account (email + temporary password), assigned to the chosen Command, Department, Unit and role.
4. **Duplicate protection**: staff ID and Ghana Card are checked before insert, and a clear message is shown if the person already exists (with a link to their record).
5. **Quick Scroll** controls (scroll to top / bottom) that appear on long pages and long lists, on desktop, tablet and mobile.

## How it works

### Staff picker dialog (new `src/components/command/UnitStaffPickerDialog.tsx`)
- Reuses the existing directory read pattern from `StaffPicker.tsx` (profiles + ranks + departments, roles fetched separately because `user_roles` has no FK to `profiles`).
- Adds command/department/unit/role/status filter selects plus free-text search; unit labels use `orgUnitPath` from `src/lib/org-hierarchy.ts`.
- Selection uses the existing `useBulkSelection` hook (`src/hooks/useBulkSelection.ts`) with a header "select all visible" checkbox.
- Visible unit choices come from `useOrgScope` so non-command users only see their own branch; the server (`unit_dashboard` RPC and RLS) stays the enforcement point.

### Bulk post / reassign
- Updates `profiles.org_unit_id` (and `department_id` when a department is chosen) for the selected ids in a single batched update, then invalidates the `unit-dashboard`, `staff-roster` and `org-units` queries so the KPIs, roster tab and staff table refresh immediately.
- Button hidden and mutation blocked unless the user is `admin` or in the command tier (`COMMAND_TIER_ROLES`); existing profile-update triggers and RLS remain untouched.
- Reassignments are written through the same path the Staff page uses, so the existing audit trail records them.

### Add staff
- New dialog reusing the exact payload shape from `src/pages/Staff.tsx` (staff_id, names, rank_id, department_id, org_unit_id, unit, status, phone via Ghana phone validation) — one standardized structure for manual and bulk-uploaded records.
- Pre-fills the Command/Department/Unit currently open on the dashboard.
- Account creation calls the existing account-creation edge function used by staff onboarding, then assigns the selected role in `user_roles`.
- Duplicate check queries `profiles` on `staff_id` (unique index already exists) and Ghana Card before submitting, surfacing a friendly error instead of a database constraint failure.

### Quick Scroll (new `src/components/ui/quick-scroll.tsx`)
- Floating, keyboard-accessible top/bottom buttons that fade in once content exceeds one viewport; supports an optional scroll-container ref so it also works inside the staff picker's scrollable list.
- Mounted in the app shell for page-level scrolling (positioned clear of the mobile bottom bar) and inside the staff picker list; uses smooth scrolling and never blocks pointer events over content.

### Integration into the Unit Dashboard
- `src/pages/UnitDashboard.tsx` gains **Find staff** and **Add staff** buttons in the header/staff tab; existing tabs, KPIs and permission gates are unchanged.

## Notes
- No database schema changes are required — `profiles.org_unit_id`, `department_id` and the unique `staff_id` index already exist.
- Verification: Playwright run against `/unit-dashboard` to confirm search, multi-select, reassignment refresh, duplicate rejection and quick-scroll behaviour at desktop and mobile widths.

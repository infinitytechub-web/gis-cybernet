# Staff Tier, Quick User Search, Clinic rename, Directorate colour

## 1. Staff Tier screen (new, under Human Resource)
- Three tabs: **Roles**, **Ranks**, **Grades**.
- Create/edit/retire roles, ranks and grades (Super Admin only for creating new definitions; command heads OIC/2IC can assign existing ones to officers in their own command).
- **Assign** tab: search an officer, pick role/rank/grade, give a reason, save. Duplicate roles are blocked (existing rule kept).
- **Dashboard**: headcount cards per role, rank and grade, filtered by command; counts exclude deleted staff and follow the viewer's command scope. Click a card to see the officers (25 per page).
- Every create/assign/change is audit-logged.

## 2. Quick User Search tab on all command dashboards
- Add a "Quick User Search" tab to the command dashboards (Command Dashboard, Command HR Dashboard, command analytics standalone dashboards, Unit Dashboard).
- Type-to-search by name, staff ID, rank or unit; results show photo, masked ID, rank, unit and today's duty status, with a link to the profile the viewer is allowed to open.
- Results limited to the viewer's command (Super Admin sees all).

## 3. Rename "Health & Wellbeing" to "Clinic"
- Menu group and any page headings using that name.

## 4. "The Directorate" dashboard in deep green
- Directorate dashboard cards/header use the deep green theme colour (works in light and dark mode).

## Technical details
- Reuse existing ranks table and `user_roles`; add a `staff_grades` table (if no grade list exists) plus `profiles.grade_id`, with GRANTs and RLS.
- Security-definer RPCs: `staff_tier_summary(command)` for headcounts, `assign_staff_tier(...)` enforcing `is_command_head_for` / Super Admin, non-self change, audit insert.
- Quick search uses existing caller-scoped `staff_directory_rows` RPC; shared `QuickUserSearch` component dropped into each dashboard's tabs.
- Tests: assignment permission rules and headcount excludes deleted staff.

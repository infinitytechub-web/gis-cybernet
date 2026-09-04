# Staff Roster hierarchy, Smart HR and personnel data upgrade

## What exists today (verified)

- The command tree lives in one table with six levels only: national, regional, sector, district, station, unit — there is no Directorate, Management, Commandant/Command, Department or Section level. Current data: 1 national, 1 regional, 5 sector, 1 station, 8 unit records, all with map coordinates.
- There is no table anywhere that records who holds a position (Regional Commander, Departmental Head, Unit Head, etc.). Appointments today are only a free-text field on a person's record plus role grants.
- Next-of-kin, emergency contact and telephone fields already use the Ghana mobile validation control, so those need no change.
- Bio-data already stores Medical & Welfare and Bank/Salary separately, restricts them to authorised administrators, and writes an audit entry on every view and edit — this stays as is.
- The floating Quick Scroll control already exists but is only wired into the page shell and one dialog.
- Staff photos are uploaded straight to storage with a 5 MB note and no scanning, while a scanning upload helper already exists elsewhere in the app.

## What will be built

### 1. Full command hierarchy (exact order)

Extend the command tree with the missing levels so it reads, top to bottom:

```text
THE DIRECTORATE (HQ)
 └ MANAGEMENT MEMBERS
    └ REGIONAL COMMANDS
       └ COMMANDANT / ISA & CO / ASSIN FOSU, TEPA & ITTraS
          └ SECTOR COMMANDS
             └ DEPARTMENTS
                └ SECTIONS
                   └ UNITS
                      └ ALL CONTROLS
```

Existing records keep their level and their place in the tree; the new levels are added above and below them. Org Structure, Staff Roster, Staff Mapping and Command Console all read the same tree, so they pick the new levels up automatically. A compact "search and select command" control is added at the top of the roster: type any name and jump straight to that command, or step down level by level, and the roster filters to that command and everything beneath it.

### 2. Positions and appointment holders (admin only)

A new positions register: each position has a title, the level it belongs to (Directorate, Management Member, Regional Commander, Commandant, Commanding Officer, Sector Commander, Departmental Head, Sectional Head, Unit Head), the command it sits in, and optionally the officer currently holding it, with start/end dates so history is preserved.

Administrators get a management screen to create, search, filter, edit and delete both positions and the command structure itself, with vacancy highlighting. Non-administrators can view holders but not change them.

### 3. Smart HR hub

A new centralized HR screen (`/hr`) for administrators, spanning every command, with:

- Headline figures: total staff, active/inactive, by rank, by region, vacancies against positions.
- A hierarchy browser on the left (the order above) and the matching staff list on the right, with search, rank/region/status filters and an "Open record" link.
- Tabs pulling together what already exists rather than rebuilding it: Establishment (positions and vacancies), Personnel (directory), Leave & availability, Attendance compliance, Bio-data completeness (which records are missing which module), and Approvals awaiting HR.
- Export of any list to spreadsheet using the existing export tooling.

### 4. Personnel data modules

The bio-data form keeps its A–L sections, but each module (identity, contact, family & next of kin, education, employment, medical, bank, verification) gains a completeness indicator, its own search entry point in HR, and a per-module "last updated by / when" line. Medical and Bank stay restricted to authorised administrators with the existing audit trail.

### 5. Long-form navigation

Quick Scroll is added to every long page and long dialog (staff form, bio-data, roster, HR hub, org structure, positions, leave, front desk, M&E forms), plus a compact section jump-list at the top of the bio-data and staff forms.

### 6. Photo upload security

Photo uploads across the app (staff photo, bio-data, patrol/alert photos) are routed through one guarded helper: reject anything 3 MB or larger, verify the file really is an image by inspecting its content, run the existing virus/threat scan, and only then upload. Clear message shown when a file is rejected.

## Technical notes

- Migration: add `directorate`, `management`, `command`, `department`, `section`, `control` to the `org_unit_type` enum and to `ORG_UNIT_TYPES` / labels in `src/lib/org-hierarchy.ts` (order drives depth ranking everywhere). Seed a Directorate root and a Management Members node, re-parent the existing national/regional nodes under them, and add the Commandant/ISA & CO/Assin Fosu, Tepa & ITTraS node between regional and sector.
- Migration: `public.org_positions` (title, position_level, org_unit_id, holder_profile_id, start_date, end_date, is_vacant computed, notes, timestamps) with GRANTs, RLS (read: authenticated within `can_see_org_unit`; write: admin/oic/2ic via `has_role`), an `updated_at` trigger, and `audit_record_changes` so changes land in the existing audit trail. Read RPC `org_position_roster()` returning position + holder + command path.
- New pages/components: `src/pages/HrHub.tsx` (route `/hr`, module-gated), `src/components/hr/*` (stat cards, hierarchy browser, module completeness), `src/components/org/OrgPositionsAdmin.tsx`, `src/components/org/CommandPicker.tsx` (searchable hierarchy select, reused by roster, HR and mapping).
- Reuse: `filterByOrgScope` / `resolveOrgScope`, `useStaffRoster`, `QuickScroll`, `OptionCombobox`, `export-utils`, `GhanaPhoneInput`.
- New `src/lib/image-upload.ts`: 3 MB cap + magic-byte image check + `scanFile` from `src/lib/firewall.ts`, then upload; replaces the direct `staff-photos` upload path in `src/pages/Staff.tsx` and other photo inputs.
- Sidebar: add HR hub and Positions entries with descriptions in `src/lib/nav-descriptions.ts`; add the module keys to the RBAC matrix so access follows existing permissions.
- Verification: `npx tsgo --noEmit`, build log, and Playwright passes over `/hr`, `/org-structure`, `/staff` and `/roster`.

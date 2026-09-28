# Command Console & Staff Bio-Data Optimization

## What changes for users

1. **Command Console on every screen size**: menus, cards, tables and forms fit on computers, tablets and phones without being cut off or covered. Long lists show 25 items per page. Wide tables scroll sideways. Long pages get Scroll to Top/Bottom buttons.
2. **Dates**: every date field in the staff bio-data form and across the app uses the same DD/MM/YYYY calendar picker. You can type the date or pick it from the calendar.
3. **Region, then command**: choose a Region and the form lists only that region's Regional Commands, Sectors, Stations and Commands. These come from the existing command tree.
4. **Renamed fields**: "Sector / command" becomes **Station/Sector/Command**, and "Station / unit" becomes **Department/Unit**. The new names appear in the form, profile page, staff mapping and all downloads.
5. **Training & intake**:
   - Category offers Cadet, Recruit and Course.
   - The separate Cadet intake and Recruit intake fields are removed.
   - One standard **Intake** field is added. It shows on the staff page, Staff Directory, reports and PDF, Word, Excel and CSV downloads.
   - Training Designation gets an "Other" option that opens a text box for your own entry.
6. **Height**: pick a height in cm from 120 to 230 (an administrator can change this range), with feet and inches shown next to it. Values outside the range are rejected, which fixes the bad 5.0 cm minimum.
7. **Approved By**: choose Regional Commander, Sector Commander, Command OIC, Command 2IC or Other. Only authorized approvers can type a name under Other.
8. **Rank / Position**: a searchable list of every approved rank and position, in seniority order.

## Rollout and checks

- Existing Cadet and Recruit intake values move into Category and Intake automatically. No data is lost, and the old stored values stay in place.
- Existing permissions still apply: only authorized roles can edit, and command scoping is unchanged.
- **Before release:** date and height tests, the form's load-and-save safeguards, and screenshots of the Command Console and bio-data form at phone, tablet and desktop sizes.
- **After release:** check the database copies and the Staff Directory and export columns.

## Technical details

- **Database migration (adds only, removes nothing)** on `profiles`:
  - New columns: `station_sector_command` (backfilled from `sector_command`), `department_unit` (from `station_unit`), `intake` (from `cadet_intake`/`recruit_intake`), `training_category` (Cadet/Recruit/Course), `training_designation_other`, `approved_by_authority`, `approved_by_other`, `region_id`.
  - The old columns are marked DEPRECATED.
  - New `app_settings` values `height_min_cm` and `height_max_cm`, plus a CHECK constraint (NOT VALID) and a trigger that reads the setting.
  - The trigger only lets approver roles set `approved_by_other`.
- **Form code:**
  - Update `src/pages/Staff.tsx`, `MyProfile.tsx`, `biodata-record.ts`, `biodata-xlsx`/`export`, `BulkStaffUploadDialog`, `staff-list-import.ts`, `StaffDirectory.tsx`, and the StaffMapping labels.
  - Add a shared `DateField` built on shadcn Calendar and `date-format.ts`. Replace the raw `<input type="date">` fields system-wide.
  - Add a cascading `RegionCommandPicker` built on `org_units` (region, then regional command, sector, station/command) that respects `can_see_org_unit`.
  - Add a `HeightPicker` with cm to ft/in conversion.
  - Use `OptionCombobox` for the rank/position search, backed by `ranks` and `org_positions`.
- **Command Console layout:** audit `CommandConsole.tsx` and its tabs. Wrap wide tables in `overflow-x-auto` with a minimum width of 700px, apply `usePagedList` (25 items), and mount the global QuickScroll component. Fix grid breakpoints so nothing is clipped at 360px, 768px or 1280px.

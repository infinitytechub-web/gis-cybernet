## Plan: Three feature requests

### 1. Composite Report Generation (Reports page)
- Update `report_schedules` to support multi-type composite reports (array of report_types in one schedule) OR allow creating multiple schedules at once from one form.
- Update `src/pages/Reports.tsx` (and report schedule form component):
  - Schedule creation form: checkbox group for report types (Staff Summary, Attendance, Leave/Pass) — at least one required.
  - Frequency select: Daily, Weekly, Monthly, Quarterly, Annually.
  - Per-row Edit and Delete buttons on the schedules list.
- Update `generate-scheduled-report` edge function to accept composite type arrays and produce a single combined CSV (or zipped multi-sheet) per run.
- Add edit dialog reusing the create form; delete with confirmation.

### 2. Postings & Transfers Dashboard Widget
- New widget `src/components/dashboard/PostingsTransfersWidget.tsx`:
  - Visible only to command-tier (`isAdminOrSupervisor`).
  - Columns: Staff ID, Name, Date Joined Service, Station(s) (from `postings_transfers` history), Phone, DOB, Current Role/Appointment, Years in Service, Time Until Retirement (Y/M/D, assuming retirement at 60).
  - Search + sort + pagination.
  - Export: CSV, XLSX, PDF, Print buttons (reuse `download-utils` / `export-utils`).
  - Row actions: Edit (navigates to PostingsTransfers admin), Delete (admin only, with confirm + audit).
- Add to `Dashboard.tsx` behind role gate.
- Required profile fields: `date_joined_service`, `date_of_birth`, `current_role`. If missing on `profiles`, add via migration.

### 3. Document Upload Restriction
- Gate all "upload document" UI actions across the system behind `isAdminOrSupervisor` (command tier + admin).
- Staff can view their own records (already mostly true) but cannot edit or download personal records.
  - Hide/disable Edit and Download buttons on `MyProfile`, `StaffDocumentVault` (for self), compliance personal documents, etc. when viewer === record owner and not command tier.
- Add DB-level enforcement: trigger on document/compliance/storage insert restricting to command-tier roles.
- Update RLS on relevant document tables to deny non-command updates and storage downloads for own records (or strip signed-URL generation for self).

### Open questions before I implement
Before writing code I need to confirm:
- **Composite reports**: One combined CSV file per schedule run, OR separate files per type bundled in a ZIP? (Combined CSV is simplest; ZIP is cleaner.)
- **Retirement age**: Standard GIS retirement age — 60? (Used for "Time Until Retirement".)
- **Profile fields**: Does `profiles` already have `date_joined_service`, `date_of_birth`, `current_role/appointment`? I'll verify by reading the schema before migrating, but please confirm retirement age and any existing field names you prefer.
- **Document download restriction for staff**: Should staff be blocked from downloading ALL their own documents (incl. payslips, certs, leave letters), or only certain categories? Full block is invasive — typical practice allows staff to download read-only PDFs of their own records.

I'll proceed once you confirm:
1. Composite report output format (single CSV vs ZIP)
2. Retirement age (default 60?)
3. Whether staff truly cannot download ANY of their personal records, or only cannot edit

# Detention Module Enhancements + System-Wide DD/MM/YYYY Dates

## 1. Auto age calculator beside Date of Birth
- Add a small shared helper that turns a DoB into a live age (years, plus months for infants).
- Show the calculated age immediately next to the DoB field (read-only badge, e.g. "Age: 34 yrs") in:
  - New Detainee Intake form
  - Detainee edit dialog
  - Standard Bail form (detainee DoB, if present)
  - Staff create/edit form (Date of Birth field) and staff profile view
- Invalid or future dates show a clear inline message instead of an age.

## 2. Redesigned Holding/Detention Analytics dashboard
Rebuild the Analytics tab into a professional, standardized layout:
- **Filter bar**: date range (last 7/30/90 days, 12 months, custom), status, nationality, gender, risk level, type of offense. All charts and KPIs respond to the filters.
- **KPI row**: currently in custody, admissions in period, releases, on bail, repatriated, escapes, average length of stay, occupancy vs. cell capacity, % of records with completed statement approval.
- **Charts**:
  - Admissions vs. releases over time (line/area)
  - Length-of-stay distribution (bar buckets: <24h, 1-3d, 4-7d, 8-30d, 30d+)
  - Type of offense breakdown (horizontal bar, ranked)
  - Status composition (donut)
  - Top nationalities and top arrest locations (ranked bars)
  - Gender and age-group demographics (age derived from DoB)
- **Summary tables**: offense category summary and nationality summary with counts and share of total.
- Export (CSV) and print of the filtered analytics view, reusing existing export/print utilities.
- Empty and loading states for every card; no chart renders with undefined data.

## 3. Offense classification
- Rename the field label everywhere from "Crime Type" to "Type of Offense" (intake, edit, table column, detail view, print/PDF, CSV export headers, analytics, bail form, search placeholder). Database column name stays as-is so no data is lost.
- Replace the current short list with an internationally recognised immigration-related offense taxonomy, grouped in the dropdown:
  - Immigration offenses: Illegal Entry, Illegal Exit, Overstay, Unlawful Residence, Breach of Visa/Permit Conditions, Unlawful Employment, Failure to Register, Evading Immigration Control, Re-entry After Removal
  - Document offenses: Document Fraud, Forged/Altered Travel Document, Impersonation, False Statement/Misrepresentation, Possession of Another Person's Document
  - Smuggling and trafficking: Migrant Smuggling, Human Trafficking, Child Trafficking, Facilitating Illegal Entry
  - Cyber and financial: Cyber Fraud / Internet Fraud, Identity Theft, Money Laundering, Online Romance Scam, Financial Fraud
  - Other criminal: Assault, Theft, Drug Offence, Firearms Offence, Public Order Offence, Obstruction of an Officer, Absconding from Custody
  - Other (specify)
- Existing records with legacy values keep displaying their stored value (no silent remapping).

## 4. Verify Arresting Officer and Statement Approved By pickers
- Confirm both searchable pickers load live staff from the directory, search by name/rank/department/unit/staff ID, show rank + department, and only offer eligible personnel (active staff for arresting officer; command-hierarchy/authorised personnel for statement approver).
- Confirm the approver field stays read-only for users without approval authority and that the existing server-side check still blocks unauthorised changes.
- Fix anything that fails those checks (e.g. missing staff ID search, stale cache after a new staff record is added).

## 5. Standardize dates to DD/MM/YYYY
- Add `src/lib/date-format.ts` with shared helpers: `formatDate` (dd/MM/yyyy), `formatDateTime` (dd/MM/yyyy HH:mm), `formatDateLong`, and a safe-parse wrapper.
- Replace all **display** date formatting across pages, dialogs, tables, PDFs/prints, and CSV/XLSX exports with these helpers (currently a mix of `MMM d, yyyy`, `dd MMM yyyy`, `PPP`, `toLocaleDateString`).
- Leave machine-facing values untouched, since changing them breaks queries and inputs:
  - `yyyy-MM-dd` used for database filters, query keys, and `<input type="date">` values
  - ISO timestamps sent to the backend and export filenames
- Date inputs continue to use the native date picker (which renders in the browser locale); any free-text date entry or date hint text will state DD/MM/YYYY.

## 6. End-to-end verification
- Typecheck and build.
- Browser pass over the detention module: create an intake (age auto-fills, offense dropdown, both pickers, duplicate check still fires), edit, view details, print, export, and the Analytics tab with each filter combination.
- Spot-check dates on Dashboard, Staff, Attendance, Leave, Reports, Front Desk, and one PDF/CSV export to confirm DD/MM/YYYY everywhere.
- Report anything that cannot be changed safely (e.g. native date-picker display order, which follows the browser locale).

## Technical notes
- New/changed files: `src/lib/date-format.ts`, `src/lib/age.ts` (or an age helper inside date-format), `src/components/detention/detention-options.ts` (offense taxonomy), `src/pages/HoldingCenter.tsx` (age display, labels, analytics rebuild), `src/components/detention/StandardBailTab.tsx`, `src/components/detention/StaffPicker.tsx` / `StatementApproverPicker.tsx` (verification fixes), plus mechanical date-format replacements across pages/components/export libs.
- No database migration is required; the offense column keeps its existing name and free-text values.

# Staff record download in Word, Excel and CSV — plus faster form loading

## Goal

When a staff record is opened for editing, the record can be downloaded in the
common international office formats — not PDF only — and the form opens quickly
without stalls or loading errors.

## What gets built

### 1. Four download formats from one shared source
The shared record builder (already in place) fetches the record once and
assembles all sections A–L. Three new builders read from it:

- **Word (.docx)** — full A–L record, portrait Letter page, headed
  "PERSONNEL BIO-DATA & SERVICE RECORD" with the CONFIDENTIAL notice, a
  two-column table per label/value section, a bordered table per list section
  (education, employment, emergency contacts, service history), and a footer
  line with name, staff ID and page number.
- **Excel (.xlsx)** — one sheet per lettered section, plus a cover sheet with
  name, staff ID and generation date; column widths sized for reading.
- **CSV (.csv)** — single flat file, columns `Section, Field, Value`, every cell
  passed through the existing spreadsheet-safety helper so no value can be read
  as a formula.

The existing PDF is switched to the same shared builder, so all four copies
always contain identical information.

Restricted sections (medical & welfare, bank/salary) behave exactly as today:
included only when the database allows the reader, otherwise the copy carries a
"Restricted" note. Every included restricted section is recorded in the access
log with the chosen format named, for all four formats.

### 2. Download menu in the edit form
The single "Print record (PDF)" button becomes a **Download record** menu with
PDF, Word, Excel and CSV. It shows a spinner on the chosen item while the file
is being built, and reports a clear message on failure. The menu appears only
for users whose directory rights allow download or print; PDF stays available
under print rights alone.

### 3. Faster loading, no loading errors
- Each format's heavy library (PDF, Word, Excel) is loaded only when that format
  is actually chosen, so opening the edit form pulls in none of them.
- The record fetch happens once per download instead of once per format.
- Review the edit dialog's data loading so sections E–L stream in behind the
  visible fields with the existing loading notice, and remove any duplicate
  fetches found on open.
- Confirm the build log is clean and no chunk-loading failures appear in the
  browser console when opening the form and running each download.

## Technical notes

- New files: `src/lib/biodata-docx.ts`, `src/lib/biodata-xlsx.ts`,
  `src/lib/biodata-csv.ts`; `src/lib/biodata-pdf.ts` refactored onto
  `buildBioDataRecord`; edit-form toolbar in `src/pages/Staff.tsx` and the
  self-service download in `src/pages/MyProfile.tsx` both switched to the menu.
- Uses dependencies already installed: `docx`, `xlsx`, `jspdf` +
  `jspdf-autotable`; downloads go through `src/lib/download-utils.ts`; CSV cells
  through `src/lib/csv-safe.ts`.
- `logBioDataRestrictedSections(profileId, record, formatTag)` is called from
  every format path.
- Verification: typecheck, the full test suite, and a Playwright pass on the
  edit dialog exercising each of the four downloads.

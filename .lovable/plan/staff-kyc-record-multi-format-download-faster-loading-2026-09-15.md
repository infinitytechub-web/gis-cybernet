# Staff KYC record: multi-format download + faster loading

## What happens today

Opening a staff record with the Edit button shows the Bio-Data & Service Record form. Its toolbar offers a single download option: "Print record (PDF)". There is no Word, Excel or plain-text version, so the record cannot be handed to offices that require an editable or spreadsheet copy.

The form also loads its later sections (education, family, bank, service history) behind a "Loading sections E–L" placeholder, and the PDF builder is only pulled in when a download starts — that part is already efficient and stays as is.

## What will change

### 1. Download in the common international formats

Replace the single PDF button with one "Download record" menu offering:

- PDF (A4) — the existing layout, unchanged
- Word (.docx) — same sections as headed tables, editable
- Excel (.xlsx) — one sheet, section/field/value rows
- CSV (.csv) — plain text for any system

All four build the same content from the same data, so every format shows identical information. The restricted-section rules are unchanged: medical/welfare and bank/salary details appear only for staff authorised to see them, and each restricted download continues to be written to the access log for every format, not just PDF.

Downloads are also gated by the existing directory permissions (download/print rights) so an officer without download rights sees no menu.

### 2. Faster, smoother loading

- The record data is fetched once and shared by all four formats, so switching format does not refetch.
- Each format's document library loads only at the moment that format is picked (Word, Excel and PDF libraries stay out of the page's initial load).
- The dialog's heavier lower sections stay lazily mounted, with the tab the user is on rendered first.
- The button shows a per-format progress state and a friendly message if a download fails.

## Technical notes

- New `src/lib/biodata-record.ts`: extracts the current data fetch + section/pair assembly from `src/lib/biodata-pdf.ts` into a reusable `buildBioDataRecord(profileId)` returning typed sections, plus the restricted-access logging.
- `src/lib/biodata-pdf.ts` keeps `exportBioDataPdf` but consumes the shared builder (dynamic `jspdf` / `jspdf-autotable` imports retained).
- New `src/lib/biodata-export.ts`: `exportBioDataRecord(profileId, fmt)` with `fmt` in `pdf | word | excel | csv`; Word via dynamic `import("docx")` following the table style in `src/lib/record-docx.ts`, Excel via dynamic `import("xlsx")`, CSV via existing `download-utils` blob helper and CSV-injection-safe cell quoting (reuse the helper covered by `src/test/csv-safe.test.ts`).
- `BioDataFormToolbar` in `src/pages/Staff.tsx`: swap the single button for a dropdown (shadcn `DropdownMenu`, same shape as `src/components/ui/export-menu.tsx`) wired to `exportBioDataRecord`, with per-format pending state and the existing `dirPerms` download/print gate.
- Add unit coverage for the record builder and CSV escaping; existing tests, typecheck and build must stay clean.

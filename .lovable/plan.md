# Armory Report page

## What you will get
A new **Armory Report** page inside Armory & Weapons (and in the sidebar under it) showing, for each command and month:
- Custody (issues and returns)
- Transfers
- Inspections (maintenance and inspection records)
- Certifications

## Layout
- Filters: command (only commands you are allowed to see), month range (DD/MM/YYYY style month picker), and record type.
- Totals cards at the top: custody issued, returned, still out; transfers sent/received; inspections done/pending; certifications valid/expiring/expired.
- Summary table: one row per command and month with the four counts and a grand total row.
- Detail list below: each record with date, command, type, status, officer (staff ID masked as usual), 25 per page with search and fast scrolling.
- CSV download of the summary and detail list, logged in the armory activity trail.
- Works on phone, tablet and desktop; keeps the existing Cybernet look.

## Access
Same people who can open Armory & Weapons today (Super Admin, command OIC/2IC, Chief Staff Officer, and officers given armory access). Each sees only their own command's figures. GIS-ASC-SO001 stays restricted.

## Technical details
- Route `/armory-weapons/report`, page `src/pages/ArmoryReport.tsx`, RBAC module `armory-weapons`, sidebar + Armory tab link.
- Data from existing caller-scoped `armory_records` reads (RLS already limits by command); kinds `custody`, `transfer`, `maintenance`, `certification`; month bucket from record date (issue/handover/inspection/issued detail date, falling back to created_at). Transfers count under both origin and destination commands. Deleted staff excluded.
- Fetch all authorized pages before aggregating; pure aggregation helper `armoryMonthlyReport` in `src/lib/armory.ts`.
- Exports via `buildCsv` and existing `armory_export_log` RPC. No database changes expected.
- Tests: aggregation totals per command/month, transfer double-sided counting, certification expiry buckets, page RBAC denial.

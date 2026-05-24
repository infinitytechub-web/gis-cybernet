## Postings & Transfers — Analytics, Audit, History & Drill-down

A large multi-part request. Before I implement, here's the proposed scope and approach so you can confirm or adjust.

### 1. Verified analytics + data-source timestamp
- Add `src/lib/postings-analytics.ts` with pure functions:
  - `yearsOfService(dateJoined, asOf)` — ISO 8601 calendar diff (Y/M)
  - `timeUntilRetirement(dob, retirementAge, asOf)` — Y/M/D, "Retired" if past
  - `transferTurnoverRate(transfers, headcount, periodDays)` — annualized %, ILO formula: (separations / avg headcount) × (365/periodDays) × 100
  - `medianTenure`, `retirementRiskBuckets` (≤1y, 1-3y, 3-5y, >5y), `mobilityIndex` (transfers per staff per year)
- Add Vitest fixtures in `src/lib/postings-analytics.test.ts` with hand-computed expected values (UN/ILO HR-metrics conventions).
- Refactor `PostingsTransfersWidget` to use these helpers.
- Display "Data as of: <timestamp>" footer using `dataUpdatedAt` from the React Query result.

### 2. Command-tier role-scoped dashboard tabs
- New `src/components/dashboard/CommandTierAnalyticsTabs.tsx`:
  - Tabs visible per role:
    - **Admin / OIC / 2IC**: All tabs (Overview, Transfers, Retirement, Tenure, Mobility)
    - **Head of Administration / Chief Staff Officer**: Overview, Transfers, Tenure
    - **Staff Officer**: Overview, Transfers
    - **Supervisor / Shift Supervisor**: Overview only (department-scoped)
  - Role → allowed-tabs map in one place for easy edits.
- Mount on `Dashboard.tsx` behind `isAdminOrSupervisor`; replaces the inline widget block.

### 3. Staff Transfer History page (`/postings/history`)
- New `src/pages/PostingsHistory.tsx` (route + sidebar link, command-tier only).
- Filters: date range (effective_date from/to), from-department, to-department, office (current dept), status.
- Table: Staff ID, Name, From → To, Effective Date, Reason, Status, Approved By.
- Export to CSV via `download-utils`; PDF/XLSX via `export-utils` (reuse existing).
- Server-side filter in Supabase query; client-side sort + pagination.

### 4. Audit logging on every posting/transfer change
- DB migration: trigger `postings_transfers_audit_trg` AFTER INSERT/UPDATE/DELETE → writes to existing `system_audit_log` with `entity_type='posting_transfer'`, `action`, `entity_id`, `performed_by = auth.uid()`, `details = { before: row, after: row, changed_fields: [...] }`.
- RLS unchanged (system_audit_log already admin-only read).
- New `src/components/postings/PostingAuditTrailDialog.tsx` accessible from each history row → shows chronological diffs.

### 5. Widget drill-down
- Each chart/stat tile in the analytics tabs becomes clickable.
- Click → navigate to `/postings/history?from=YYYY-MM-DD&to=YYYY-MM-DD&...` with filters pre-applied via URL search params (read in `PostingsHistory` via `useSearchParams`).
- E.g.: clicking "12 transfers this quarter" opens history filtered to that quarter; clicking "5 retiring in <1y" opens staff list filtered by retirement bucket (routes to `/postings` widget pre-filtered).

### Files to add / change

**New**
- `src/lib/postings-analytics.ts`
- `src/lib/postings-analytics.test.ts`
- `src/components/dashboard/CommandTierAnalyticsTabs.tsx`
- `src/components/postings/PostingAuditTrailDialog.tsx`
- `src/pages/PostingsHistory.tsx`
- Migration: audit trigger on `postings_transfers`

**Edit**
- `src/components/dashboard/PostingsTransfersWidget.tsx` (use helpers, add timestamp, drill-down links)
- `src/pages/Dashboard.tsx` (swap to tabs)
- `src/components/AppSidebar.tsx` (add Transfer History link, command-tier)
- `src/App.tsx` (add `/postings/history` route)

### Open questions before I build

1. **Retirement age** — confirm 60. The schema already has `profiles.retirement_age` (per-staff override), I'll use that with fallback to 60.
2. **Mobility index window** — use last 12 months (rolling) for "transfers per year", OK?
3. **Supervisor scoping** — should non-admin command tier (supervisor/staff officer) see only their own department's data on the dashboard tabs, or org-wide? Currently the widget shows all profiles; I'd recommend scoping supervisors to their department.
4. **Audit dialog placement** — accessible from history rows only, or also from each profile's posting timeline?

Confirm those four and I'll implement.

## Goal
Reduce page load time across the app — focus on First Contentful Paint on `/login` and `/dashboard`, and on the size of route chunks that currently pull in heavyweight libraries (`jspdf`, `jspdf-autotable`, `xlsx`, `docx`, `recharts`, `leaflet`, `qrcode`, `pdfjs-dist`) on first render even though those libs are only needed when the user clicks Export / Print / Show map.

Scope is strictly performance + responsive verification. No feature/business-logic changes.

## Findings (from current code)

1. **Heavy libs imported at module top-level inside route pages**, so they ship inside the page chunk and parse before the page renders. Examples:
   - `pages/Stores.tsx`, `pages/HoldingCenter.tsx`, `pages/Ipse.tsx`, `pages/Appraisals.tsx` → static `recharts` import (only needed for visible charts — OK to keep, but chart sub-imports can be tree-shaken via a single shared `chart` wrapper).
   - `pages/DutyRosterImport.tsx`, `pages/AppraisalCoverageReport.tsx`, `pages/RouteHistory.tsx`, `pages/MyExcuseDutySubmissions.tsx`, `pages/StaffMappingImport.tsx`, `pages/RoleAssignmentsAdmin.tsx` → static `jspdf` / `jspdf-autotable` / `xlsx` / `docx` imports used only in export click handlers.
   - `components/enforcement/OperationActions.tsx`, `components/stores/ComplianceExportFilters.tsx`, `components/stores/ItemDetailDrawer.tsx`, `components/staff/BulkStaffUploadDialog.tsx`, `components/staff/BulkImportDialog.tsx`, `components/reports/AttendanceComplianceImportDialog.tsx`, `components/dashboard/StaffAppraisalsWidget.tsx` → same pattern.
   - `lib/export-utils.ts`, `lib/record-pdf.ts`, `lib/branded-letter-pdf.ts`, `lib/health-lab-export.ts`, `lib/security-scan-export.ts`, `lib/staff-export-integrity.ts`, `lib/interlink-export.ts`, `lib/guard-schedule-export.ts`, `lib/excuse-duty-templates.ts`, `lib/attendance-compliance-template.ts`, `lib/official-stamp.ts` → ship pdf/xlsx/docx/qrcode at module load.
2. **Single shared `QueryClient`** with no defaults → every refocus refetches. Setting `staleTime` & disabling `refetchOnWindowFocus` reduces post-load thrash and bandwidth.
3. **No manual `build.rollupOptions.output.manualChunks`** → `react`, `react-dom`, `@tanstack/react-query`, Radix, `recharts`, `leaflet`, etc. are split unpredictably by Vite. Adding stable vendor chunks improves long-term cache hits across deploys.
4. **No route prefetch** — hovering a nav link doesn't warm the route chunk. Adding a tiny `onMouseEnter` prefetch on `NavLink` cuts perceived navigation latency.
5. **`<link rel="preconnect">` only to Supabase host** — also preconnect to the tile proxy and add `crossorigin` on the Supabase preconnect for the wss handshake.
6. **Responsive sanity** — `Layout` already covers mobile bottom-nav + responsive header. We will visually verify with Playwright snapshots at the 3 breakpoints already defined in `tests/header-snapshots.spec.ts` (mobile 390, tablet 820, desktop 1366) on a handful of representative pages and address any newly broken layouts only.

## Changes

### A. Defer heavy export/print libs (biggest win)
Convert every "fires only inside a click handler" import into a dynamic `await import(...)` inside the handler. Files to update (export-only call sites):

- `src/lib/export-utils.ts` — make `exportToPdf`/`exportToXlsx` `async` and `await import("jspdf"|"jspdf-autotable"|"xlsx")` inside.
- `src/lib/record-pdf.ts`, `src/lib/branded-letter-pdf.ts`, `src/lib/health-lab-export.ts`, `src/lib/security-scan-export.ts`, `src/lib/staff-export-integrity.ts`, `src/lib/interlink-export.ts`, `src/lib/guard-schedule-export.ts`, `src/lib/excuse-duty-templates.ts`, `src/lib/attendance-compliance-template.ts`, `src/lib/official-stamp.ts` — same pattern.
- `src/pages/DutyRosterImport.tsx`, `pages/AppraisalCoverageReport.tsx`, `pages/RouteHistory.tsx`, `pages/MyExcuseDutySubmissions.tsx`, `pages/StaffMappingImport.tsx`, `pages/RoleAssignmentsAdmin.tsx`.
- `src/components/enforcement/OperationActions.tsx`, `components/stores/ComplianceExportFilters.tsx`, `components/stores/ItemDetailDrawer.tsx`, `components/stores/AssetQrCode.tsx`, `components/stores/AssetLabelPrint.tsx`, `components/staff/BulkStaffUploadDialog.tsx`, `components/staff/BulkImportDialog.tsx`, `components/reports/AttendanceComplianceImportDialog.tsx`, `components/dashboard/StaffAppraisalsWidget.tsx`, `components/auth/TwoFactorSetup.tsx` (qrcode → render on demand after dialog open).

Each call site keeps its signature but moves the heavy `import` into the function body. Callers already `await` the existing helpers in most cases; the few synchronous ones get a thin `async` wrapper.

Charts stay statically imported where they render on page load (`Dashboard`, `Analytics`, `Ipse`, `Stores`, `HoldingCenter`, `Appraisals`) — moving them dynamic would cause a chart-shaped layout shift. The savings come from removing pdf/xlsx/docx/qrcode from those chunks.

### B. Vendor chunking + prefetch
- `vite.config.ts` — add `build.rollupOptions.output.manualChunks` grouping: `react-vendor` (react, react-dom, react-router-dom), `radix` (`@radix-ui/*`), `query` (`@tanstack/react-query`), `charts` (`recharts`), `pdf` (`jspdf*`, `xlsx`, `docx`), `maps` (`leaflet*`). Leaves dynamic chunks intact (still on-demand).
- `src/components/NavLink.tsx` — accept an optional `prefetch?: () => Promise<unknown>` and call it on `onMouseEnter` / `onFocus`. `AppSidebar.tsx` / `MobileBottomNav.tsx` pass the matching `() => import("@/pages/...")` for each link.
- `index.html` — add `<link rel="preconnect" href="https://ebndffutyrgybsduvijo.supabase.co" crossorigin>` (the existing one is missing `crossorigin`, which costs us a duplicate handshake for the wss/auth fetch).

### C. React Query defaults
- `src/App.tsx` — `new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, gcTime: 5*60_000, refetchOnWindowFocus: false, retry: 1 } } })`. Cuts redundant refetches after window focus and during route navigation.

### D. Responsive / a11y verification (no code change unless something breaks)
- Run `bun run build` and confirm: per-route chunk sizes drop for the pages listed in A; a `pdf`/`maps`/`charts` vendor chunk appears.
- Run the existing Playwright `tests/header-snapshots.spec.ts` (mobile/tablet/desktop) and any existing a11y specs (`tests/a11y/*`).
- Manually open `/dashboard`, `/staff`, `/stores`, `/ipse`, `/duty-roster/import`, `/login` in `browser--view_preview` at 390 / 820 / 1366 widths — screenshot, eyeball for regressions, and only edit if something visibly broke.
- Use `browser--performance_profile` on `/login` and `/dashboard` before vs. after to record FCP/LCP/TBT deltas for the summary.

## Out of scope
- No new features, no schema changes, no removed functionality.
- No edits to `.workspace`, edge functions, or backend.
- No SEO, copy, or design changes.

## Deliverable
Summary report including: per-page chunk size before/after, Web Vitals before/after for `/login` and `/dashboard`, responsive screenshots at the three breakpoints, Playwright/a11y results, and a list of files changed.

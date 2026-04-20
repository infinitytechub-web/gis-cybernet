---
name: Report Approval Chain (IPSE)
description: Staff submit reports → IPSE triages severity & forwards → 2IC reviews → OIC final approval. Auto-routed notifications + analytics in /ipse.
type: feature
---

Multi-tier reporting workflow tied to `report_uploads` (manual, scheduled, generated exports).

**Pipeline (`ipse_status`):** `pending_ipse` → `forwarded_to_2ic` → `forwarded_to_oic` → `approved` (sets `approval_status='approved'`). Any tier can `rejected` (requires comment).

**Severity scale:** `low` | `medium` | `high` (set by IPSE before forwarding to 2IC). Stored in `report_uploads.severity`.

**Roles:**
- Submit: any staff with `shift_group` set, plus shift_supervisor / deputy_shift_supervisor / shift_leader / deputy_shift_leader / supervisor / command tier.
- Triage + forward to 2IC: admin or `is_ipse_tier()` (ipse_supervisor / ipse_deputy_supervisor) — **must set severity**.
- Forward to OIC: admin or 2IC.
- Final approval: admin or OIC.
- Reject (any stage): admin, IPSE, 2IC, OIC.
- View own: submitter sees own pending/rejected to re-upload corrected versions.
- View all + trail: supervisor + command tier + IPSE.
- View approved only: every authenticated staff (powers Dashboard widget for download/print).

**Storage access:** `can_access_report_file` allows owners always; others only when `approval_status='approved'` (or supervisor+).

**Triggers (on `report_uploads`):**
- `validate_report_approval` — enforces chain, blocks invalid statuses, requires comment on reject, stamps `ipse_reviewer/_at`, `two_ic_reviewer/_at`, `approved_by/_at`.
- `notify_ipse_on_submission` (AFTER INSERT) — alerts admins + IPSE supervisors/deputies for new submissions.
- `notify_ipse_workflow` (AFTER UPDATE) — auto-routes notifications: → 2IC on `forwarded_to_2ic`, → OIC on `forwarded_to_oic`, → submitter on `approved`/`rejected`.

**UI:**
- `src/pages/Reports.tsx` — Tabs: Pending IPSE / With 2IC / With OIC / Approved / Returned / All. "Open IPSE Triage" deep-link button + "Submit Report" for shift leaders. Submissions default to `ipse_status='pending_ipse'`.
- `src/components/reports/ReportApprovalsTable.tsx` — shared table; legacy approve/reject UI is hidden behind IPSE pipeline (use `/ipse` for actions).
- `src/pages/Ipse.tsx` — IPSE hub with Dashboard (severity pie, status totals, avg IPSE response time, top reported officers), Reports Triage queue, Sanctions reference, Officer Drill-down, Night Guard tab.
- `src/components/dashboard/ApprovedReportsWidget.tsx` — compact list shows category + **severity badge** + IPSE comment + download/print + "View all" deep-link to `/reports?tab=approved`.
- Edge function `generate-scheduled-report` writes `source='scheduled'`, `approval_status='pending'`, `ipse_status='pending_ipse'` so auto-generated reports also enter IPSE triage.

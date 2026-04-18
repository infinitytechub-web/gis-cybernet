---
name: Report Approval Chain
description: Shift leaders submit reports → supervisors approve/reject → OIC/2IC/Staff Officer trail + dashboard download
type: feature
---

Multi-tier reporting workflow tied to `report_uploads` (manual, scheduled, generated exports).

**States:** `pending` (default) → `approved` | `rejected` (returned to submitter with mandatory comment).

**Roles:**
- Submit: any staff with `shift_group` set, plus shift_supervisor / deputy_shift_supervisor / shift_leader / deputy_shift_leader / supervisor / command tier.
- Approve/Return: supervisor + command tier (admin, oic, 2ic, staff_officer).
- View own: submitter sees own pending/rejected to re-upload corrected versions.
- View all + trail: supervisor + command tier.
- View approved only: every authenticated staff (powers Dashboard widget for download/print).

**Storage access:** `can_access_report_file` allows owners always; others only when `approval_status='approved'` (or supervisor+).

**Triggers:** `validate_report_approval` blocks invalid statuses, requires comment on reject, auto-stamps `approved_by`/`approved_at` on status change.

**UI:**
- `src/pages/Reports.tsx` — Tabs: Pending / Approved / Returned / All. Shift leaders see "Submit Report" button.
- `src/components/reports/ReportApprovalsTable.tsx` — shared table with inline approve/return dialogs.
- `src/components/dashboard/ApprovedReportsWidget.tsx` — compact list + download/print + "View all" deep-link to `/reports?tab=approved`.
- Edge function `generate-scheduled-report` writes `source='scheduled'` and `approval_status='pending'` so auto-generated reports also flow through approval.

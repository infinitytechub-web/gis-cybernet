# Leave / Pass Management — Review Actions & Audit

## Goal
Give Administrators and Command-tier officers full control of leave/pass requests from the Leave / Pass dashboard: filter by Approved / Rejected / Pending, and act on pending requests with Edit, Approve, Reject and Delete — with the acting officer, date and time recorded and a complete audit trail. Ordinary staff keep submit + read-only status views.

## Current state (verified)
- `/leave` shows the request form, "My leave history", and an admin area (Overview + Approval Queue) already gated to the command tier.
- The queue can only Approve/Reject a pending request (with a comment). There is **no** Edit and **no** Delete.
- `leave_requests` stores `approved_by` but has **no approved/decided timestamp column**, so the decision time is not recorded (only the generic `updated_at`).
- The approval-audit trigger function that fills `request_approval_audit` exists but is **not attached to `leave_requests`** — so the "Approval History" panel in the review dialog is always empty for leave.
- A DB trigger blocks non-admins from changing type/dates/reason, and only `admin` has a delete-capable policy; command tier (oic/2ic/staff_officer/supervisor/command_officer) can update.
- `leave_requests` is already registered as a recycle-bin table, so deletes can be soft deletes.

## What will be built

### 1. Status views on the dashboard
- The four summary cards (Total, Pending, Approved, Rejected) become clickable filters that drive the table, in both the Overview and the Approval Queue tabs.
- Status badge column stays visible everywhere a request is listed (dashboard, queue, my history, staff profile) so the current state is always clear.

### 2. Row actions for pending requests
An actions menu per row, only for users with the right role:
- **Edit** (pending only) — change leave type, start/end date, reason and comment in a dialog. Saving keeps the request pending and logs an "edited" audit entry with before/after values.
- **Approve** / **Reject** — from the row menu or the existing review dialog; requires a comment on rejection.
- **Delete** — confirmation dialog; moves the record to the Recycle Bin (restorable, admin/OIC), never a hard delete.

Approved/rejected rows keep the existing "download letter" action; admins can additionally revert a decision to pending (logged), while non-admin command tier cannot edit or delete a decided request.

### 3. Decision metadata
- Every approve/reject records the deciding officer and the exact date/time, shown in the row ("Approved by ASP Mensah — 25/08/2026 09:14") and in the review dialog.

### 4. Audit trail
- Attach the approval-audit trigger to `leave_requests` so approvals, rejections, edits, reverts and deletions all land in `request_approval_audit` with actor, actor role, previous/new status, changed fields and timestamp.
- The existing Approval History timeline in the review dialog (with filters and CSV/PDF export) then works for leave requests.
- Deletions are logged before the record moves to the Recycle Bin.

### 5. Access control
- Buttons/menu hidden for unauthorised users, and enforced server-side so the API rejects them regardless of the UI:
  - Approve / Reject: command tier (admin, OIC, 2IC, Staff Officer, Supervisor for own department, Command Officer).
  - Edit pending: same set, only while status is pending; admins any time.
  - Delete: admin, OIC, 2IC (soft delete only).
  - Staff: submit and view own requests only; cannot act on any request, including their own.

## Technical notes
- Migration: add `decided_at timestamptz` (plus keep `approved_by`); attach `log_request_approval_change` as an AFTER UPDATE trigger on `leave_requests` with the `leave_request` argument, and extend it to log a `deleted` action; relax `restrict_leave_request_updates` so command-tier users may change type/dates/reason **only while the row is still pending**, keeping the existing lock on decided rows for non-admins; add an explicit soft-delete path for OIC/2IC.
- Deletion goes through the existing `softDelete()` helper (`src/lib/recycle-bin.ts`) — no `DELETE` from the client.
- UI work in `src/components/leave/LeaveApprovalQueue.tsx` and `LeaveAdminDashboard.tsx`, with a new `LeaveEditDialog.tsx`; permissions read from `useAuth`/`src/lib/rbac.ts` rather than new ad-hoc role checks.
- Dates displayed as DD/MM/YYYY, per the system standard.
- Verification: sign in as admin and as a plain staff account via Playwright, confirm each action updates status in UI and database, that audit rows appear, and that staff see no action controls and are rejected server-side.

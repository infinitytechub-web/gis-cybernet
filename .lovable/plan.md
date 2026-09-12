# Integrated Officer Command Portal

## Goal
Turn the existing Command Portal into the post-login workspace for officers, combining command-scoped staff search with self-only leave and stores information. Reuse the current account, leave, notification, holiday, and permission systems.

## Changes

### Command portal
- Expand `/command-portal` with clear sections for Command Staff, My Leave, Leave Approvals, and My Stores.
- Keep staff search backed by the existing server-scoped command officer function so users cannot widen results from the browser.
- Show each officer only their own leave requests, balances, and issued-store items.
- Show the approval queue only to authorized command-tier reviewers, scoped to requests they are permitted to review.
- Keep exports and document access governed by existing matrix switches.

### Leave calendar and balances
- Load official holidays for the selected month/year.
- Mark weekends and holidays as non-working days in the calendar and prevent drag-created annual-leave selections from starting or ending on blocked days.
- Display working-day counts for annual leave and calendar-accurate spans for maternity/study leave, matching the backend entitlement rules.
- Replace remaining calendar-day totals in leave review/letters with the same shared calculation.

### Leave approvals
- Add a dedicated `/leave/approvals` page using the existing approval queue, audit trail, and notifications.
- Restrict direct access to command officers and other approved command-tier roles.
- Preserve approve/reject comments, decision attribution, history, and applicant notifications.
- Ensure backend policies—not only page controls—enforce organizational scope and deny unrelated-command requests.

### Sign-in routing
- Keep the existing Staff/Admin ID and password accounts and biometric sign-in.
- After successful officer sign-in, automatically open `/command-portal`; administrators continue to `/dashboard`.
- Apply the same destination after biometric sign-in and when an authenticated officer revisits `/login` or `/`.
- Officers without a command assignment receive the portal’s existing no-assignment state rather than unrelated dashboard data.

## Technical details
- Add focused self-only/server-scoped database functions or policies where current stores and leave reads are broader than required; all new callable functions will revoke public/anonymous execution.
- Reuse existing components where their queries are already correctly scoped; extract small portal-specific views where reusing an administrator report would expose aggregate inventory.
- Register the approval page in routing, RBAC, and navigation only for authorized roles.
- Do not create new authentication or profile tables.

## Validation
- Test administrator, command officer, ordinary staff, unassigned officer, and unrelated-command access.
- Verify command staff search, self-only leave/store rows, approval/rejection notifications, weekend/holiday calculations, password and biometric redirects, direct URLs, and denied states.
- Run targeted leave/RBAC tests, full typecheck/tests, and confirm the preview build log reports success.

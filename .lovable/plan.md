# Dashboard & Admin Improvements — Phased Plan

This is a large multi-area initiative. I'll deliver it in 5 phases so each is reviewable and the app stays stable between steps. Approve the plan and I'll start executing phase 1; I'll pause briefly between phases so you can verify.

---

## Phase 1 — Cleanup
- Audit dashboard, admin settings, and announcement modules for unused routes, dead components, and stale edge function imports.
- Remove orphaned files and unused API calls; trim `App.tsx` routes accordingly.
- Outcome: smaller surface area before adding new features.

## Phase 2 — Dashboard Enhancements
- **Gender Distribution Widget**: a compact card (Male / Female / Other-Unspecified / Total) — reuse existing `GenderStatisticsWidget` data query but render a slim summary version on the main dashboard.
- **Online Staff Widget**: leverage existing `useOnlineUsers` hook; render avatars with hover tooltip showing Online ID, Name, Department.
- **Attendance Log Widget**: new card combining gender split + per-department present/absent counts + totals (queries `attendance_logs` for today).
- **Duty Roster filter**: in the dashboard's roster view, filter to staff whose shift matches the currently active window; hide off-duty entries.

## Phase 3 — File Sharing System
- **Staff selector UX**: in `SharedFilesPanel` add a scrollable list, search input, and multi-select checkboxes with "select all in results".
- **Scheduled delivery schema** (new migration):
  - `scheduled_file_deliveries` (id, file_path, sender_id, scheduled_for, status enum pending|sent|failed, error, created_at)
  - `scheduled_file_recipients` (delivery_id, recipient_user_id)
  - RLS: sender + admins can read/write their own; only the dispatcher edge function (service role) can update status.
- **Edge function** `dispatch-scheduled-files`: picks rows where `scheduled_for <= now()` and `status = pending`, fans out notifications + announcement file shares, marks sent/failed with error message.
- **Cron**: pg_cron every minute invoking the function (using `supabase--insert`, not migrations, since URL/anon-key are user-specific).
- **Admin UI**: new "Scheduled Deliveries" tab listing pending/sent/failed with retry on failed.

## Phase 4 — Shift-per-Day CRUD
- Add working action buttons to the shift-per-day table: search input, row checkboxes for bulk select, edit dialog (assign/reassign staff, change shift), delete with confirm.
- Wire to existing `duty_roster_entries` table; respect command-tier RBAC.

## Phase 5 — Stability Fixes
- **Admin Settings non-2xx**: reproduce the failing edge function call (likely `system-backup`, `email-domain-recheck`, or `bulk-create-accounts` — confirm via logs), fix CORS / payload / auth header issues, return JSON error bodies.
- **Email Test "Failure to send a request"**: usually CORS preflight or a missing `Authorization` header on `send-transactional-email`. Verify `corsHeaders` cover `authorization, content-type, apikey`, and the function returns CORS on every error path. Add a clearer toast surfacing the underlying error.
- **Centralized logging**: small helper `src/lib/edge-log.ts` that wraps `supabase.functions.invoke`, captures errors to console + a new `client_error_log` table (admin-readable) so future failures are diagnosable in one place.

---

## Technical notes
- No business-logic changes outside what each phase explicitly requires.
- All new tables get RLS; uses existing `has_role` security-definer helper.
- New widgets follow the existing dashboard card style (semantic tokens only).
- Cron job creation uses `supabase--insert` (per project convention), not the migration tool.
- I'll verify each phase by checking the build output and, for the stability fixes, by hitting the edge functions and reading logs.

## Suggested checkpoint
After Phase 2 (dashboard widgets visible) — quick visual confirmation before I touch the schema in Phase 3.

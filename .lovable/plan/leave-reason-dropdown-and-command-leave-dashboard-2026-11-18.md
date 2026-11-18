# Leave reason dropdown and Command Leave Dashboard

## 1. Reason dropdown on the leave request form
- Keep the existing Leave Type choice (Annual, Sick, Compassionate, Pass, Study, Maternity).
- Add a required **Reason** dropdown whose options follow the chosen leave type, for example:
  - Annual: Annual vacation, Family matters, Travel, Rest and recovery, Other
  - Sick: Illness, Hospital admission, Medical appointment, Post-treatment recovery, Other
  - Maternity: Antenatal, Delivery, Postnatal care, Other
  - Compassionate: Bereavement, Family emergency, Other
  - Study: Course or examination, Training programme, Other
  - Pass: Personal pass, Official pass, Other
- Choosing **Other** requires a short written explanation; otherwise the details box stays optional.
- Approvers (Leave Approval Queue, Pending HR, Command HR) see Leave Type, Reason and details together on each request. Sick leave shows only the reason category, never medical details, to match existing privacy rules.
- Editing a pending request keeps the same dropdown.

## 2. Command Leave Dashboard (Human Resource menu)
- New screen **Command Leave Dashboard**, available to Super Admins (all commands, with a command filter) and command heads/command tier (their own command only, decided by the server).
- Totals cards: Pending, Approved, Rejected, plus total days taken; filters for date period, leave type, reason and status.
- Per-command table: each command with its pending, approved and rejected counts; click a command to filter.
- Request list with search, status badges, 25 per page and fast scrolling; approve/reject buttons reuse the existing approval rules.
- Calendar view (month grid, DD/MM/YYYY) showing approved and pending leave per day; click a day to see who is away.
- Totals refresh when requests are submitted or decided; deleted staff are excluded.

## 3. Pending leave fixes from last time
- The leave approval alerts and book-on-behalf fix could not be saved while the database was paused. It goes in first, together with this work.

## Technical details
- Migration: add nullable `reason_category text` to `leave_requests` with a check against the allowed list (existing rows stay null and display as "Not specified"); include the previously prepared notification trigger and book-on-behalf exemption.
- New invoker RPC `command_leave_dashboard(p_from, p_to, p_org_unit)` returning per-command status counts and day totals, scoped via `user_org_scope`/`is_command_head_for`; caller RLS; grant to authenticated only.
- Calendar reads leave rows through existing RLS for the selected month.
- Shared reason list in `src/lib/leave-reasons.ts`; used by LeaveRequestForm, LeaveEditDialog and approval displays.
- Route `/hr/leave-dashboard` under RequireModule hr; nav link under Leave & Holidays.
- Tests: reason list per leave type, "Other" requires details, dashboard totals scoped to command.

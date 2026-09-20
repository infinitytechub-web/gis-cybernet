# My Dashboard — one portal home for every officer

Turn "My Dashboard" (`/portal`) into the single personal home every signed-in officer lands on, folding in what is today spread across the Command Portal and Officer Portal. No new data sources: every panel already exists and is already scoped on the server.

## What the officer sees

A summary strip at the top (no tab digging), then tabs grouped by task:

- **Today** — clock in / out, this week's hours, and at-a-glance cards: hours this week, leave days remaining with its Overdue / Due / On track badge, where my record stands in the sign-off chain, anything waiting on my signature.
- **My leave** — request leave, my leave history, approved-leave calendar, my leave status figures.
- **My record** — my four sign-off steps, any step awaiting my signature, my posting and shift history with reasons.
- **My things** — stores and items issued to me.
- **My requests** — status of leave requests and record-change requests I submitted.
- **Command** — command staff search and command leave status. Only appears for officers whose role authorises it; ordinary officers never see the tab at all.

Section visibility follows the existing permission matrix, so an officer who is not allowed to search the directory simply doesn't get that tab.

## Routing and menus

- `/portal` becomes the post-login landing page for all non-administrator officers; administrators keep going to the main dashboard.
- `/command-portal` and `/officer-portal` keep working and redirect into `/portal` on the matching tab, so existing links and bookmarks don't break.
- Sidebar and mobile menu keep one entry, "My Dashboard", instead of three overlapping portal links.

## Mobile

Tabs become a full-width stacked list on phones; the summary cards go one per row; tables keep their horizontal scroll.

## Technical details

- `src/pages/MyDashboard.tsx` restructured into the tab set above; panels reused as-is: `CheckInOut`, `MyHoursDashboard`, `LeaveRequestForm`, `MyLeaveHistory`, `ApprovedLeaveCalendarWidget`, `OfficerStoresPanel`, `LeaveDueWidget`, `SignOffPanel`/`SignOffQueue`, plus the command staff search already in the page.
- Self-only sign-off state, awaiting-my-signature queue and posting history lifted out of `src/pages/OfficerPortal.tsx` into small components under `src/components/portal/` so both routes render the same code.
- Command tab gated by `useRbac` capability plus `useMyDirectoryAccess`, exactly as the current Command Portal does; server RPCs (`leave_due_overview`, `signoff_my_queue`, command staff search) stay the authority — the UI gate is presentation only.
- `/command-portal` and `/officer-portal` become thin redirects to `/portal?tab=…`; RBAC entries for those keys stay so nothing loses access.
- No schema changes, no new RPCs, no policy changes.

## Validation

- Sign in as an ordinary officer, a commander, and an administrator; confirm tab sets differ and no command data reaches the ordinary officer.
- Check clock in/out, a leave request, a declaration sign-off and a stores list all still work from the new layout.
- Confirm old portal URLs land on the right tab, then verify typecheck, tests and a clean build.

# HRM Module: Service Records, Officer Dashboard, Transfer Requests and KYC Export

Build on the screens that already exist: staff profiles, the staff portal, postings history and command dashboards. Nothing gets a second copy.

## 1. HRM service records
A new **Service Record** tab on each staff profile, with three registers:
- **Appointments**: position or office, the command or unit, start and end date, appointing authority, and a reference or letter number.
- **Promotions**: rank before and after, effective date, authority and reference. When a promotion is approved, the officer's current rank updates.
- **Resignations / exits**: type (resignation, retirement, dismissal or death), notice date, effective date, reason and status (pending, approved or rejected). Once approved, the officer's status changes and the existing deletion and transfer clean-up runs.

Who can do what:
- Super Admins, HR admins and the officer's own command tier (OIC, 2IC, Staff Officer with a grant) can record these entries.
- Each officer can view their own records.
- Only admins can approve exits.

Every entry is logged in the audit trail.

## 2. Link to command dashboards
Each command dashboard gets an **HRM** panel showing:
- recent appointments, promotions and exits in that command
- pending exits and pending transfer requests
- counts by month

Clicking an item opens the officer's Service Record. Officers outside the command never appear.

## 3. Personal officer dashboard (staff portal)
A **My Command** section showing:
- the officer's own command, with its sectors, districts and stations as a read-only tree
- their current posting and full posting history
- their latest appointment and promotion

## 4. Transfer applications
- From the officer dashboard, **Apply for transfer**: choose a destination command, sector or station, give a reason and a preferred date, and attach supporting files (optional).
- Approval runs in two steps: the current command's OIC or 2IC recommends, then a Super Admin or an authorized admin approves.
- Approval moves the officer through the existing command transfer action, so posting history, statistics and dashboards update automatically.
- The officer sees the status live and can withdraw the application while it is pending.

## 5. KYC staff profile export with chosen fields
On the Staff list and on each command dashboard, an **Export profiles** dialog lets you:
- tick field groups, or single fields: Identity, Contact, KYC (Ghana Card and other documents), Service (rank, intake, posting), Appointments, Promotions, Exits, Next of kin, Education/Training
- pick the staff (current filter, selected rows, or the whole command)
- choose a format: Excel, CSV or PDF (one A4 bio-data sheet per officer)

The export is available only to admins and command tiers, and covers only staff they are allowed to see. Each export is logged with who ran it, how many staff it covered and which fields it included. Restricted fields stay masked for roles that cannot normally see them.

## Technical details
- New tables `staff_appointments`, `staff_promotions`, `staff_exits` and `staff_transfer_requests`, each with GRANTs, row-level security based on the existing `can_access_staff_profile` / command scope helpers, and audit triggers. Promotion and exit approvals go through security-definer functions that update `profiles` (rank, status).
- `request_transfer`, `recommend_transfer` and `approve_transfer` functions. `approve_transfer` calls the existing `command_move_officers`, so postings history and lifecycle sync are reused.
- The export reads through a caller-scoped function that returns only permitted columns, then is built in the browser (xlsx, CSV, jsPDF). It is logged to the existing `hrm_export_audit`.
- The command dashboard HRM panel and the portal My Command section use realtime invalidation.
- Tests cover who can record, approve and export, field masking, and the transfer approval steps.

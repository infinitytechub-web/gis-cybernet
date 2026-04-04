

# GIS Amasaman Sector Command — HRM Application Build Plan

## Data Summary from Uploaded Roster

- **258 staff** across **4 shifts** (A, B, C, D)
- **9 ranks**: SUPT, DSI, ASI, SNR. INSP., INSP., ASST. INSP., ICO, AICO I, AICO II
- **25+ units**: Operations, Enforcement, Processing, Intel, Communications, Protocol, Welfare, Gender, PR, Estate, Procurement, RRU, IPSE, Admin, Front Desk, Sports, plus the 8 additional departments you specified (OIC, 2IC, OPS, LEGAL, STAFF OFFICER, DEPUTY STAFF OFFICER, CYBER & MISD, NIGHT GUARD DUTY)
- Duplicate detected: DAPILLAH GEORGE appears in both Shift A and Shift B; ANTHONY TETTEH DOTSE appears in both Shift C and Shift D — these will be flagged

---

## Phase 1: Foundation (First Implementation Round)

### 1. Branding & Theme
- Copy GIS logo to project assets
- Update CSS variables to cyan/white/blue security palette:
  - Primary: Cyan (#0891B2 / hsl 189 94% 37%)
  - Secondary: Deep Blue (#1E3A5F)
  - Accent: Light Cyan (#E0F7FA)
  - Background: White, cards on subtle blue-gray
- Footer on every page: "Powered by: Infinity Techub Intelligence | All Rights Reserved: 2026"

### 2. Database Schema (Lovable Cloud / Supabase)
Tables to create via migrations:

- **profiles** — extends auth.users with staff_id, name, rank, gender, department, unit, shift, phone, photo_url, status (active/inactive/study_leave)
- **ranks** — id, name, abbreviation, level (for hierarchy ordering)
- **departments** — id, name, description
- **user_roles** — id, user_id, role (app_role enum: admin, supervisor, staff) — separate table per security requirements
- **shifts** — id, name, pattern (8h/12h/custom), start_time, end_time
- **shift_assignments** — id, staff_id, shift_id, start_date, end_date
- **attendances** — id, staff_id, date, check_in, check_out, status (present/late/absent/excused), notes
- **leave_requests** — id, staff_id, type (annual/sick/compassionate/pass), start_date, end_date, status (pending/approved/rejected), approved_by, comments
- **holidays** — id, name, date, recurring
- **postings_transfers** — id, staff_id, from_department, to_department, effective_date, type (posting/transfer), status, approved_by
- **storage bucket** — staff-photos (public)

RLS policies: Admins full access; staff read-only on own records; supervisors read on their shift/department.

### 3. Authentication
- Login page with Staff ID + Password (two tabs: Admin / Staff)
- Auth via Supabase email auth (staff_id used as identifier)
- Protected routes with role-based guards

### 4. Seed Data
- Pre-populate ranks table with all 9 GIS ranks
- Pre-populate departments with all units from roster + the 8 additional ones
- Import all 258 staff records from the Excel file
- Create 4 shift records (A, B, C, D)
- Flag duplicates (DAPILLAH GEORGE, ANTHONY TETTEH DOTSE)

---

## Phase 2: Core Pages & Modules

### 5. Layout & Navigation
- Sidebar navigation (collapsible on mobile) with GIS logo at top
- Sections: Dashboard, Staff, Departments, Roles, Shifts, Attendance, Leave, Holidays, Postings & Transfers
- Responsive design for the 428px viewport and desktop

### 6. Admin Dashboard
- Cards: Total Staff, On-Duty Today, Pending Leave Requests, Upcoming Holidays
- Quick-action buttons for common tasks
- Staff distribution chart by department and shift

### 7. Staff Management Page
- Searchable/filterable table of all staff
- View/Edit staff profile (rank, department, unit, shift, photo upload)
- Add new staff member
- Duplicate role detection alerts

### 8. Department & Roles Pages
- CRUD for departments and ranks
- Staff count per department
- Assign/remove roles

### 9. Shift & Scheduling Page
- Shift templates (8h, 12h, custom)
- Calendar view of shift assignments
- Guard duty rotation for Night Guard Duty department
- Drag-and-drop or form-based assignment

### 10. Attendance Module
- Manual Check-In / Check-Out buttons (staff view)
- Daily attendance log table (admin view)
- Late/early flags with configurable thresholds
- Monthly summary reports

### 11. Leave / Pass Request Module
- Staff: Submit request form (type, dates, reason)
- Admin: Approval queue with approve/reject + comments
- Leave balance tracking per staff

### 12. Holidays Page
- CRUD for holidays (Ghana public holidays + GIS-specific)
- Calendar view

### 13. Postings & Transfers Module
- Record posting/transfer with from/to department and effective date
- Approval workflow
- Staff posting history

---

## Phase 3: Compliance & ERP (Later)

- Document expiry tracking
- Equipment/uniform issuance tracking
- Reporting module (staff strength, attendance summaries, compliance status)

---

## Technical Details

- **Framework**: React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Lovable Cloud (Supabase) — DB, Auth, Storage, Edge Functions
- **State**: TanStack React Query for server state
- **Routing**: React Router with protected route wrappers
- **Security**: RLS on all tables, separate user_roles table, input validation
- **File count**: ~30 new files (pages, components, hooks, lib, migrations)

### File Structure
```text
src/
├── assets/gis-logo.jpeg
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Staff.tsx
│   ├── Departments.tsx
│   ├── Roles.tsx
│   ├── Shifts.tsx
│   ├── Attendance.tsx
│   ├── LeaveRequests.tsx
│   ├── Holidays.tsx
│   └── PostingsTransfers.tsx
├── components/
│   ├── Layout.tsx (sidebar + header + footer)
│   ├── ProtectedRoute.tsx
│   ├── staff/ (StaffTable, StaffForm, StaffProfile)
│   ├── attendance/ (CheckInOut, AttendanceLog)
│   ├── scheduling/ (ShiftCalendar, ShiftForm)
│   └── leave/ (LeaveForm, LeaveApproval)
├── hooks/ (useAuth, useStaff, useAttendance, etc.)
├── lib/ (supabase client, types, constants)
└── integrations/supabase/ (types, client)
```


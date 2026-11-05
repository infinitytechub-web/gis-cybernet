# Reorganize the Human Resource menu

Bring the HR screens together in one **Human Resource** section of the side menu. Order them the way standard HR systems do: people records first, then daily workforce operations, then career movement and performance, then reports. No pages, permissions or data change. Only where the links appear in the menu changes.

## New Human Resource section (in order)

```text
Human Resource
  HR Home                          (/hr)
  1. Staff Records
     - Staff / Employees
     - Staff Directory
     - Create Staff Account
     - Staff Mapping
     - Staff Applications
  2. Attendance & Shifts           (Attendance, Overview, Weekly, Office Shifts)
  3. Rosters & Schedules           (Duty Roster, Guard Schedule)
  4. Leave & Holidays              (Leave/Pass Requests, Calendar, Approvals, Holidays)
  5. Excuse Duty                   (Excuse Duty Form, My Submissions)
  6. Postings & Transfers          (Postings & Transfers, Transfer History)
  7. Appraisals & Approvals        (Staff Appraisals, Appraisal Coverage, Staff Approvals*)
  8. HR Reports                    (HR Admin Dashboard, Staff Export Integrity)
```
\* Staff Approvals stays visible only to the roles that can see it today.

Ordering follows the usual employee lifecycle: records → time and attendance → absence management → mobility → performance → analytics.

## What moves where
- "People & Organization" keeps Command Analytics, Departments and Roles / Designations. These describe how the organization is set up, not individual staff.
- The separate "Workforce" heading goes away. Its groups move under Human Resource.
- Pay & Loans stays a separate group right after Human Resource. Payroll is usually kept apart from HR administration.
- Excuse Duty Form and My Submissions move from "Home & My Work" to Human Resource.
- "HR Reports" is a new menu group. It points to the existing HR Admin Dashboard and Staff Export Integrity screens. No new report page is built.
- "Appraisals & Appraisals" is shown as "Appraisals & Approvals", which is the current name and matches what the group contains.

## Technical details
- Edit only `src/components/AppSidebar.tsx`. Build an `hrItems` entry list plus sections (`staffRecordItems`, attendance, roster, leave, `excuseDutyItems`, posting, appraisal, `hrReportItems`), then render them through the existing `renderGroup("Human Resource", ...)`.
- Remove the moved entries from `personnelItems`, `allStaffItems` and `reportingItems` so no link appears twice.
- The existing `permitted()` filtering and role checks still apply, so what each user can see is unchanged.
- Leave mobile bottom navigation and routes as they are. Update any sidebar test that asserts the old group names.

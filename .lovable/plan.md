# Staff & Command Management Upgrade

Fourteen-point upgrade across Staff/Employees, KYC forms, ranks, leave and command hierarchies. Existing behaviour that already meets the requirement is left alone (bio-data custom tables/fields already exist, Quick Scroll already exists, leave entitlement rules already exist, signature capture exists in bio-data verification only).

## 1. Staff statuses and Deactivate

- Staff status list grows from Active / Inactive / Study leave / Transferred to also include **Partially Active**, **Retired** and **Interdicted**, each with its own colour badge.
- A **Deactivate** action joins Edit / Delete on every staff row, in the staff profile, in the admin quick search on the dashboard, and in the command/unit staff lists. It asks for a status (Inactive, Partially Active, Retired, Interdicted), a required reason, and an effective date; the record is never deleted. A matching **Reactivate** action restores Active.
- Every deactivation is written to the audit trail with who, when, old status, new status and reason. Sign-in is blocked while a staff member is Retired or Interdicted.

## 2. Minor (under 18) flagging and approval

- Whenever a date of birth under 18 is saved, the record is automatically marked **Minor** and placed in a "pending minor approval" state; the badge shows on the row, the profile and the KYC form.
- Administrators get a Minor Approvals queue: approve or reject with a required recorded reason. Nothing about the record is silently changed.

## 3. Sex instead of Gender

Every label, filter, column header, export heading, printed form and dashboard title reading "Gender" becomes "Sex" (including the Gender Statistics widget, staff exports, front-desk and processing forms). Stored data is untouched, so no history is lost.

## 4. Dependents and admin-added rows

- The KYC / bio-data form gains an optional **Dependents** table (name, relationship, sex, date of birth, age, contact, notes) that can be left empty.
- Administrators can already define extra fields and extra tables for bio-data; that panel is extended so admins can add rows/columns to Dependents and any section on demand, and choose whether a table shows for all commands.

## 5. MRZ scanning interface

A **Scan MRZ** panel inside staff KYC and verification: capture from camera or upload a passport/ID image, then read the machine-readable zone. It parses TD1/TD3 lines, validates the check digits, and pre-fills surname, other names, sex, date of birth, nationality, document number and expiry for the officer to confirm before saving. The reader is built so a live hardware/vendor reader can be plugged in later without changing the form; manual entry of the MRZ lines is always available as a fallback.

## 6. Ghana Card date-of-birth verification pathway

A verification block on the staff record showing the Ghana Card number, the recorded date of birth, a verification state (Not verified / Pending / Matched / Mismatch), who checked it and when, plus a "Request verification" action that queues the record. The actual card-authority lookup is a single pluggable call, left disconnected until the deployment credential is available; until then a command officer can record a manual sighting of the card with a reason. Existing card-format checking and mismatch audit logging is kept.

## 7. Digital signature / signatory interface

A reusable secure signing panel for staff and authorised command officials: draw or upload a signature, confirm identity by re-authentication, then the signature is stored privately with a content hash, timestamp, signer identity, IP and device, and the exact document/record version signed. Signed items become read-only for that signature; any later change invalidates it and shows as "signature broken". Signatures are visible only to the signer and authorised officials, and every view is logged. Used by the bio-data declaration/verification rows, leave decisions and the Queried → Recommended → Approved actions below.

## 8. Queried → Recommended → Approved workflow

Existing information-flow queues (staff change requests, leave, front-desk/processing applications, excuse duty, reports) gain the shared status chain **Submitted → Queried → Recommended → Approved / Rejected**, with a query action that returns the item to the originator with a required note, a recommend action for the intermediate authority, and final approval. Each step records who, when, the note and, where required, the digital signature. Queue filters, badges and notifications reflect the new states.

## 9. Rank categorisation and hierarchy

- Ranks gain a **category** (e.g. Senior Officers, Junior Officers, Civilian) and an explicit order value, with an admin screen to create categories, reorder ranks by drag or up/down, and set which category a rank belongs to.
- Every rank list, filter, staff sort, roster, command dashboard, report and export orders ranks top-to-bottom by that hierarchy rather than alphabetically, and can group by category.

## 10. Leave Due & Overdue

New **Leave Due** and **Leave Overdue** widgets for administrators and command hierarchies, plus a dashboard tab: who is due to take leave this period, who is past due, days remaining against entitlement, and a clear status indicator (On leave / Due / Overdue / Exhausted / Not due). Scoped so each command sees its own officers; exportable.

## 11. Compact controls on long lists

Audit of long lists and long forms across all command hierarchies, adding the compact set where missing: search box, dropdown filters, pick-and-select (multi-select with counts), and the floating Quick Scroll. Applied to staff, roster, command portal/dashboard, org structure, positions, leave queues, stores, front desk and M&E lists.

## 12. Security, RBAC and system check

All new actions are permission-gated (Deactivate, minor approval, rank configuration, MRZ, signing, Ghana Card verification, leave dashboards), enforced in the database as well as the interface, default deny, and audit-logged. Finishes with a full check: typecheck, tests, build, security scan, and a walk-through of each new flow on desktop and mobile widths.

## Technical notes

- Migrations: extend `staff_status` enum (`partially_active`, `retired`, `interdicted`); `profiles` gains `is_minor`, `minor_approved_by/at/reason`, `dob_verification_status`, `dob_verified_by/at`, `deactivated_by/at/reason`; new tables `staff_deactivations`, `staff_dependents`, `staff_signatures`, `staff_mrz_scans`, `ghana_card_verifications`, `rank_categories` (+ `ranks.category_id`, `ranks.sort_order`), and a shared `workflow_transitions` table for the Queried/Recommended/Approved chain. Each with GRANTs, RLS scoped through the existing `can_access_staff_profile` / `has_role` / `directory_rights_at_unit` helpers, `updated_at` triggers and `audit_record_changes`.
- Immutability triggers on `staff_signatures`, `staff_deactivations` and `workflow_transitions`; signature blobs in a private storage bucket via the existing guarded upload helper.
- Frontend: `src/lib/mrz.ts` (TD1/TD3 parse + check digits), `src/components/staff/DeactivateStaffDialog.tsx`, `MinorApprovalQueue.tsx`, `MrzScanPanel.tsx`, `src/components/shared/SignaturePad.tsx` + `SignatureBlock.tsx`, `src/components/shared/WorkflowActions.tsx`, `src/components/staff/biodata/DependentsSection.tsx`, `src/components/settings/RankHierarchyAdmin.tsx`, `src/components/leave/LeaveDueWidget.tsx`, `src/lib/rank-order.ts`.
- Sex rename is a label-only change (no column rename) so exports, PDFs and DOCX templates stay compatible.
- Verification: `bunx tsgo --noEmit`, `bunx vitest run`, build log, Playwright passes over `/staff`, `/command-portal`, `/command-dashboard`, `/leave/approvals`, plus a security scan.

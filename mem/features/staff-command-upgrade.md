---
name: Staff & command management upgrade
description: Statuses (partially_active/retired/interdicted), deactivation audit, minor approvals, MRZ, signatures, dependants, rank hierarchy, leave due widget, Sex label
type: feature
---

- Statuses live in `src/lib/staff-status.ts` (STAFF_STATUSES, labels, colours). Enum `staff_status` now includes `partially_active`, `retired`, `interdicted`. Retired/Interdicted disable sign-in.
- Deactivate/reactivate goes through RPC `staff_set_status(profile,status,reason,effective_date)`; history in `staff_deactivations` (immutable) + system audit. UI: `DeactivateStaffDialog`, action button in `StaffTableRow`.
- Under-18 records are flagged automatically by trigger (`profiles.is_minor`, `minor_status`); admin decides via RPC `staff_review_minor` in `MinorApprovalQueue` (shown on Staff page).
- MRZ: `src/lib/mrz.ts` parses TD1/TD3 with ICAO check digits; `setMrzImageReader()` is the hook for a future scanner/OCR. Scans stored in `staff_mrz_scans` (`source`, `scanned_by` required).
- Signatures: `SignaturePad` + `SignatureBlock` → `staff_signatures` (signer_user_id, record_type, record_fingerprint, signature_data/hash). Never overwritten.
- Shared workflow: `WorkflowActions` writes `workflow_transitions` (from_status/to_status/performed_by) for Submitted → Queried → Recommended → Approved.
- Dependants: optional `staff_dependents` (contact, sort_order) via `DependentsSection`; bio-data form has a new section M (KYC, dependants & signature) plus Ghana Card DOB check (`ghana_card_verifications`).
- Ranks: `rank_categories` + `ranks.category_id`/`sort_order`; ordering helpers in `src/lib/rank-order.ts`; admin panel Settings → Ranks & Hierarchy.
- Leave: `LeaveDueWidget` (Dashboard) compares annual entitlement by grade vs approved leave taken, weekends/holidays excluded.
- Terminology: user-facing "Gender" is now "Sex" everywhere; database column stays `gender`.

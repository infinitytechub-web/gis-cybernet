# Cybernet HRM Enhancement: Enforcement, Operations & Holding Center

Delivered in 5 phases so each one is tested and working before the next starts. Nothing that works today is removed.

## Phase 1: One combined command interface
- A single "Command Operations" page with tabs for Enforcement, Operations and Holding Center (Custody, Bail, Repatriation). The current pages forward to it.
- Every region gets the same layout. What a user sees depends on their command and on rights an administrator grants.
- Live analytics cards and charts: totals by Command, Custody, Repatriation, Suspect cases, Nationality, Sex, Health status and Offence. Each card can be searched, selected and clicked to filter the list underneath.
- Clicking a record shows the suspect's full KYC. Authorised users get Modify and Soft delete (soft-deleted records can be restored and are logged).

## Phase 2: Suspect KYC and offences
- A searchable offences list with multi-select. "Others" and "+" let users type in a new offence, which an admin can add to the main list.
- The same offences field is used on Custody, Bail and Repatriation, linked to the suspect's KYC.
- Suspect photo / mug-shot upload.
- Custody and Repatriated views show the number in custody, health status, nationality, sex and offences.

## Phase 3: Bail and sureties
- Offence type shown on the bail record.
- Two sureties are required. The first is shown by default and "+" adds more. Each surety has a photo upload.
- Upload area for documents submitted on the suspect's behalf.

## Phase 4: Repatriation details and approvals
- Repatriation form gains: vehicles involved, weapons used, and officers involved. Officers are picked from the command's own staff list, and the officer count fills in automatically.
- A 3-tier chain of command, set by the system administrator for each command (e.g. Recommender, then Reviewer, then Command Approver). The Command makes the final decision.
- Each tier can add a recommendation with comments for bail and repatriation.
- The authorising officer signs electronically. The signature is fixed to the decision and kept in the audit trail.

## Phase 5: Attendance validation and file scanning
- Attendance validation report for every command: daily, weekly, monthly, quarterly and annual. It flags missing, late and inconsistent records and can be exported.
- Every upload (photos, mug-shots, surety photos, documents) is held as "Scanning" until it passes a malware/virus check, then marked "Safe". Files that fail are quarantined and cannot be opened.

## Decision needed: virus scanner
The most common choice is ClamAV (free) running on an outside scanning service, or VirusTotal or Cloudmersive (both need an API key). These checks can't run inside the app itself. Until a service is connected, uploads get the existing file-type and signature checks and stay marked "Pending scan" rather than "Safe".

## Technical details
- New tables: offences catalogue, suspect_offences link, sureties, suspect_documents, repatriation_vehicles, repatriation_weapons, repatriation_officers, approval_chain_config (3 tiers per org unit), approval_recommendations, e_signatures (hash-chained, immutable). Soft-delete columns are added to detention/bail/repatriation records.
- All new tables are scoped by command through can_see_org_unit and the existing RBAC. Grants and RLS are set up for each one, and audit triggers are reused.
- A scan-upload edge function runs on a storage upload hook and writes scan_status (pending/safe/infected) on each file. It plugs into the existing firewall quarantine. A provider secret is requested when needed.
- Analytics come from a scoped RPC and refresh in real time through postgres_changes.
- The attendance validation RPC groups results by period (date_trunc) and by command.
- Tests cover RBAC scoping, approval tier order, the minimum of two sureties, and blocking access to files that haven't been scanned.

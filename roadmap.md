# Roadmap

- [x] Fix preview typecheck errors (PhotoCheck union narrowing under non-strict tsconfig)
- [x] Align command dashboard counts, ranks, and vacancies with current posting hierarchy
- [ ] Reorganize desktop and mobile navigation around task flows using central RBAC only
- [ ] Reorder command dashboards around decisions, personal work, operations, and information
- [ ] Verify a command officer sees only command-scoped, authorized information in the new layout
- [x] Make personnel bio-data create/edit sections responsive and prevent saving after incomplete related-record loads.
- [x] Add administrator-approved outside contacts to the record-email recipient list and enforce approval on sends.
- [ ] Re-deploy record-email validation and repeat authenticated add/edit, approval and download checks after Lovable Cloud resumes (hosted database and auth are paused).
- [ ] Signed-in test of Staff Officer command scoping and module grants
- [x] Super Admin screen to grant audit-purge access to selected admins
- [x] Extend staffing alerts and seven-day trends across administrator dashboards
- [x] Add automated Staff Officer UI/API command-isolation regression tests (live suite skips until dedicated credentials are configured)
- [x] Make Procurement record views searchable/selectable, paginated at 25+, and safely scrollable on phone, tablet and desktop
- [x] Scope Command Vault records and storage to each command with role/capability enforcement
- [x] Add immutable Command Vault access/action audit records and archive workflow
- [ ] Complete signed-in functional and cross-command browser checks for Procurement and Command Vault (automated type, RBAC, schema and responsive checks complete)

- [x] Staff deletion/transfer cascade, archive, reconciliation & integrity check

## Command Console & bio-data optimization (2026-09-28)
- [x] Bio-data: Region→command cascade, renamed fields, Category Cadet/Recruit/Course, Training "Other", height picker (cm+ft/in, configurable range), Approving authority, searchable rank
- [x] Intake column in Staff Directory and CSV/Excel staff exports
- [x] Organisational positions searchable in the appointment picker
- [x] Command Console responsive/pagination/quick-scroll audit
- [ ] Replace remaining raw date inputs system-wide with calendar picker
- [ ] Signed-in check of the bio-data form at phone/tablet/desktop

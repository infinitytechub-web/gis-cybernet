# Architecture rules

- Keep personnel bio-data editing in the responsive web form; load related record sections separately and block saves after incomplete loads, so a failed fetch cannot overwrite existing details.
- Check record-email recipients on the server against staff addresses or administrator-approved external contacts on every send, including CC, BCC, bulk and saved lists; client pickers are convenience only.- Staff Officers (without admin/OIC/2IC) are command-scoped by restrictive RLS policies (`so_can_see_*`) and reach restricted modules only via per-person `command_tier_grants` set by a Super Admin — why: prevent cross-command HR access at the API layer.
- Audit trails are purged only via `purge_audit_records` (admin or granted admin, ≥30 days old, reason, self-logged); immutability triggers allow deletes only inside it — why: controlled retention without weakening tamper protection.
- Command Vault files are owned by an org unit, stored beneath that unit's path prefix, and accessed only through command-scoped RBAC with immutable action logging — why: prevent cross-command document disclosure and preserve evidentiary history.

# Architecture rules
- Holding Center identity verification uses private photos, server-matched staff IDs and Super Admin-only review; approved access is read-only and scoped to the current assigned Command, without changing signing or operational authority — why: verifying identity must not grant administrative powers.
- Command Operations reuses legacy workflow pages in permission-gated tabs; legacy routes redirect preserving context, and hub access is the union of existing module permissions — why: consolidate navigation without duplicating records or expanding access.
- Bail/repatriation signing-role configuration is saved atomically through `save_approval_chain`, restricted to Super Admins; `sign_approval` reads configured roles on each sign — why: labels must never substitute for actual signing authority.
- Approval signing verifies the current account using an isolated nonpersistent auth client; `sign_approval` requires fresh password AMR and derives the staff name, timestamp and signature server-side — why: prevent typed-name impersonation without switching the app session.

- Date entry uses shared DateInput/DateTimeInput controls with DD/MM/YYYY display and ISO machine values — why: prevent browser-locale regressions across staff and operational forms.
- Keep personnel bio-data editing in the responsive web form; load related record sections separately and block saves after incomplete loads, so a failed fetch cannot overwrite existing details.
- Check record-email recipients on the server against staff addresses or administrator-approved external contacts on every send, including CC, BCC, bulk and saved lists; client pickers are convenience only.- Staff Officers (without admin/OIC/2IC) are command-scoped by restrictive RLS policies (`so_can_see_*`) and reach restricted modules only via per-person `command_tier_grants` set by a Super Admin — why: prevent cross-command HR access at the API layer.
- Audit trails are purged only via `purge_audit_records` (admin or granted admin, ≥30 days old, reason, self-logged); immutability triggers allow deletes only inside it — why: controlled retention without weakening tamper protection.
- Command Vault files are owned by an org unit, stored beneath that unit's path prefix, and accessed only through command-scoped RBAC with immutable action logging — why: prevent cross-command document disclosure and preserve evidentiary history.

- Staff deletion/transfer side-effects run in the `profile_lifecycle_sync` trigger on profiles (deleted_at / org_unit_id); retained history goes to admin-only `staff_record_archive` — why: every delete/transfer path cleans up consistently.

- M&E Communications workspace lives in `me_*message*` tables; all sends go through the `me_send_message` security-definer function — why: one server-side place enforces sender role, command scope and audit.

- Staff import AI comparisons are advisory: authenticate import administrators on the server, read candidates through caller-scoped RLS, minimize prompt fields, validate returned candidate references and audit runs; never let AI modify import outcomes or staff records — why: probabilistic matches cannot authorize personnel changes.
- Staff list import approvals retire only the server-computed set confirmed through `confirm_staff_list_retirements` (same admin, exact count, 30-minute window); `commit_staff_list_import` refuses otherwise — why: a stale or changed list must never silently inactivate staff.

---
name: Status workflows & audit trail
description: Unified selectable status workflow for Operations (Open/In Progress/Resolved/Closed) and Holding/Detention (Detained/Released/Transferred/Bail/Repatriated/Court/Escaped) with immutable audit
type: feature
---
Single source of truth for status changes:
- `src/lib/status-workflows.ts` — labels, badge/dot classes, allowed transitions per entity. UI must never hardcode status colours/labels.
- `src/components/shared/StatusWorkflowControl.tsx` — badge + transition dropdown + reason dialog + `StatusHistoryList`. `compact` hides the history button (used in tables).
- DB RPC `public.set_record_status(_entity,_id,_status,_reason)` (SECURITY INVOKER, so caller RLS decides) validates the transition, requires a reason when a detainee leaves custody, updates the record, and inserts into `status_change_audit`.
- `status_change_audit` is insert-only (users may insert only their own `changed_by`); command tier reads all history, others only their own.
- Detention: `released_by` references `profiles.id` (NOT auth.users) — the RPC resolves the actor's profile id. UI shows "Detained" for `in_custody`; legacy `deported` renders as "Repatriated".
- Status change permission: Operations = admin/oic/2ic/supervisor/shift_supervisor/deputy_shift_supervisor; Detention = admin/oic/2ic only.

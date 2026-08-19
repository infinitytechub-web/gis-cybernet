---
name: Admin session management
description: user_sessions registry, /admin/sessions console, single/all sign-out with immutable session_action_audit trail
type: feature
---

Admin Console → **Session Management** (`/admin/sessions`, rbac module `session-management`, command tier).

- `user_sessions` — one row per device/session: `session_key` (device fingerprint prefix + refresh-token suffix, persisted in `localStorage` as `cybernet.session-key`), user agent, IP, current page, `started_at`, `last_seen_at`, `revoked_at/by/reason`. RLS: own rows, or all rows for admin/command tier. No direct writes — everything goes through RPCs.
- RPCs (SECURITY DEFINER, anon revoked): `register_session`, `session_heartbeat` (returns true when revoked → client signs out), `revoke_session`, `revoke_all_user_sessions` (optional `_keep_session_key` keeps the current device), `prune_stale_sessions`, `can_manage_sessions`.
- `session_action_audit` — append-only (`session_start`, `logout_session`, `logout_all`) with actor, target, count, reason; readable by admin/command tier only.
- Client: `useSessionRegistry()` mounted in App (alongside the forced-signout watcher) registers the session and beats every 60s; revoked sessions are signed out on the next beat.
- Authorization: users may end their own sessions; only admin/command tier may end other users' sessions or run cleanup.

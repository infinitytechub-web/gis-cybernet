# SPEC-1 — Flexible Shift Rotation Calendar

The current system already has a singleton `shift_rotation_config` (anchor + pattern), per-role/department `shift_rotation_overrides`, and a derived "My Shift Tracker". This plan extends those primitives into the full spec without breaking existing rotations.

Delivered in 5 phases so each is reviewable and the app stays stable between steps.

---

## Phase 1 — Schema foundation (Must-Have)

New tables (all RLS-protected, command-tier write, staff read where relevant):

- `shift_rotation_schedules` — named, versioned rotation definitions
  - name, description, anchor_date, pattern (text[]), cycle_length (generated), timezone, status (`draft|published|archived`), version, published_at, published_by
- `shift_rotation_assignments` — assigns a schedule to a date range and a scope
  - schedule_id, scope_type (`org|department|role|staff`), scope_value, start_date, end_date, priority
- `shift_rotation_individual_overrides` — per-staff manual overrides
  - profile_id, date, group_letter, reason, created_by
- `shift_rotation_deploy_audit` — every publish/edit/rollback event with full diff
- `shift_rotation_exclusions` — command-tier roles auto-excluded from org-wide deployments (seeded with admin/oic/2ic/staff_officer/supervisor)

Triggers:
- Block edits to `published` schedules (force new version)
- Auto-bump `version` on publish
- Conflict detection function `detect_rotation_conflicts(scope, range)` returning overlapping assignments

Keep existing `shift_rotation_config` and `shift_rotation_overrides` as the legacy fallback so today's tracker keeps working during migration.

## Phase 2 — Admin scheduling UI

New page `/admin/shift-rotations` (command-tier only):

- List of schedules with status badges (Draft / Published / Archived) and version
- Schedule editor:
  - Anchor date picker, pattern builder (chips A/B/C/D + add/remove), cycle length auto-derived, timezone selector (default Africa/Accra)
  - Date-range assignment table (scope picker: Organization / Department / Role / Staff)
  - 28-day live preview grid showing generated groups
  - Conflict warnings banner (calls `detect_rotation_conflicts`)
- Publish flow: confirm dialog → writes audit row → marks published → invalidates tracker queries
- Rollback: clones previous version into new draft

Reuses `ShiftRotationSettings` styling and `useShiftRotationConfig` patterns.

## Phase 3 — Resolver + My Shift Tracker integration

New helper `resolveShiftForDate(profile, date)` with this precedence:
1. Individual override
2. Most-specific published assignment (staff > role > department > org)
3. Legacy `shift_rotation_overrides` / `shift_rotation_config` fallback

- Extend `useShiftRotationConfig` to accept `profileId` and call the resolver
- `MyShiftTracker.tsx` renders resolved groups; shows source badge ("Org schedule v3", "Manual override", etc.)
- Exclude command-tier roles from org-wide assignments via `shift_rotation_exclusions`
- Realtime: subscribe to `shift_rotation_schedules` + `shift_rotation_assignments` + `shift_rotation_individual_overrides`

## Phase 4 — Notifications, audit & bulk tools (Should-Have)

- Notification fan-out on publish (uses existing `notifications` table + `role-based-notifier` edge function)
- Audit log viewer at `/admin/shift-rotations/audit` (filter by schedule, actor, date)
- Bulk reassignment dialog: pick staff list → assign to schedule or set individual overrides for a date range
- CSV export of generated calendar per schedule (reuses `download-utils.ts`)

## Phase 5 — Polish & nice-to-haves (Could-Have, opt-in)

- Drag-and-drop on the preview grid to create individual overrides inline
- Mobile-friendly admin view (stacked cards under `md`)
- Optional Lovable-AI rotation recommender that suggests patterns from past coverage gaps (gated behind a feature flag)

---

## Technical notes

- All new tables: RLS using existing `has_role` / `is_command_tier` helpers
- No edits to `auth/storage/realtime` schemas
- No CHECK constraints on time-based fields — use validation triggers
- New code uses semantic Tailwind tokens only
- Realtime via `postgres_changes` invalidating React Query keys
- Timezone stored on schedule; resolver converts using `date-fns-tz` (already a transitive dep — confirm before phase 3)

## Suggested checkpoint

After **Phase 2** (admin can build & preview a schedule but nothing is wired into the tracker yet) — quick visual confirmation before the resolver swap in Phase 3.

## Out of scope (call out for later)

- Hard integration with attendance/payroll
- Cross-command schedule sharing
- Public REST API for third-party schedulers

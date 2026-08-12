# Command-Tier Capability Self-Check Panel

Add a permission inspector to the Admin Console so you can look up any staff account and see exactly which command-tier capabilities they can use today — before you grant anything new.

## What you'll see

A new "Capability check" card at the top of the Admin Console:

- Searchable staff picker (name, staff ID, email). Defaults to your own account, so it doubles as a self-check.
- Result summary: the account's application roles, whether they are a command-tier role holder, and their command authority level.
- A capability checklist covering every capability used by grants (all, detention, reports, attendance, roster, staff administration, inventory, GPS), each marked Allowed or Not allowed, with the reason: granted by role tier, granted individually (with expiry), or none.
- Active individual grants listed with capability, granted-by, expiry, and status.
- A "Re-check" action so the answer always reflects the live database, plus a note that results come from the same server-side checks the app enforces.

```text
Capability check
Staff: [ Search staff...            v ]   [ Re-check ]

Roles: supervisor           Command tier: no      Authority level: 2

Capability                 Effective    Source
All command capabilities   Not allowed  —
Holding / Detention Center Allowed      Individual grant (expires 30 Sep 2026)
Reports & approvals        Not allowed  —
Duty roster & rotations    Allowed      Role tier
...
```

## Rules

- Visible to System Administrators and officers who can manage command tier. Anyone else sees nothing new.
- Read-only: the panel never creates, changes, or revokes a grant.
- The verdicts are computed by the database using the same functions the rest of the system enforces, so the panel cannot show a permissive answer the backend would refuse.
- Looking up your own account is always allowed.

## Technical notes

- New migration adds `public.command_capability_report(_target uuid)` — a `SECURITY DEFINER`, `STABLE` function with `search_path = public` that returns one row per capability plus role/authority metadata by calling the existing `has_command_capability`, `is_command_tier`, and `command_authority_level` functions, and reading `user_roles` / `command_tier_grants`. It raises an exception unless `auth.uid() = _target` or `can_manage_command_tier(auth.uid())`. `EXECUTE` granted to `authenticated` and `service_role` only (no `public`/`anon`), matching the existing grant pattern for these helpers.
- New component `src/components/admin/CapabilitySelfCheckPanel.tsx`: React Query call to the RPC keyed by target user, staff list reused from the same `profiles` select pattern as `CommandTierGrantsPanel`, capability labels imported from the exported `COMMAND_CAPABILITIES` list so the two panels never drift.
- `src/pages/AdminConsole.tsx` renders the panel below the hero, gated on `isAdmin || canManageCommandTier`; existing sections stay untouched.
- Semantic tokens only for badges/status colours; table wrapped in the standard `overflow-x-auto` + `min-w-[700px]` pattern.

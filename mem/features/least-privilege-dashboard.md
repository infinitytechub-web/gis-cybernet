---
name: Role dashboards & field-level least privilege
description: Role-specific dashboard compositions, sensitive field masking layer, and the admin-tier retiering of security modules
type: feature
---

**Dashboard hierarchy (ISO-style, fixed order):** Header → Key figures → Action needed → My work → Administration & Security (admin tier only) → Operations → Information.
Compositions live in `src/components/dashboard/`: `StaffDashboard` (personal only), `CommandDashboard` (oversight/queues), `AdminSecurityBand` (security + system health). `src/pages/Dashboard.tsx` is a thin orchestrator; data split by privilege in `src/hooks/useDashboardData.ts`.

**Module tiers (`src/lib/rbac.ts`):** audit logs, session management, RUM, access matrix, sensitive access log, IP blocks/firewall, settings, branding and retention are **admin tier only** (admin/oic/2ic) — not the whole command tier. `unit-dashboard` and `in-cab` are no longer all-staff.

**Field-level visibility (`src/lib/field-visibility.ts` + `src/components/Sensitive.tsx`):**
groups = contact, identity, medical, detainee, next_of_kin, financial. Rules in order: record owner → admin tier → field allow-list → delegated capability (`field:<group>`, `field:<field>`, `*`). Masks: `tail`, `email`, `date`, `full`. Reveals are audited via `logAdminAudit`.
Applied at: staff directory phone, staff profile phone, Holding Center detail drawer (ID number, phone, address, NoK, emergency contact), detention printout and detention CSV/PDF export.

Client masking is UX; RLS + SECURITY DEFINER RPCs remain the enforcement boundary. Anonymous EXECUTE has been revoked on every public SECURITY DEFINER function except `get_public_branding` and `get_public_app_settings`.

Tests: `src/test/rbac.test.ts` (module tiers, all-staff allow-list) and `src/test/field-visibility.test.ts`.

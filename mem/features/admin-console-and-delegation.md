---
name: Admin Console & Delegated Command Capabilities
description: /admin hub page, command_tier_grants delegation UI, Standard Bail forms, and multi-source map tile failover
type: feature
---
**Admin Console** — `src/pages/AdminConsole.tsx` at `/admin` (sidebar: "Admin Console", first item in the Administration group). Pure hub of links grouped into Identity & access, Staff administration, Branding & communications, Security & audit, Operations & data. Items tagged `tier: "admin"` only render for `isAdmin`; each destination still enforces its own permissions. Branding deep-links via `/settings?tab=branding` (Settings reads `?tab=` through `useSearchParams`).

**Delegated command privileges** — command-tier management is no longer admin-only: `canManageCommandTier` (Admin, OIC, 2IC) in AuthContext gates `/command-roles`. `src/components/admin/CommandTierGrantsPanel.tsx` (mounted at the bottom of CommandRoles) grants a single capability (`*`, detention, reports, attendance, roster, staff_admin, inventory, gps) to any staff member via `command_tier_grants`, with optional expiry, reason, and revoke. Server-side enforcement is `has_command_capability()`.

**Standard Bail** — `src/components/detention/StandardBailTab.tsx`, "Standard Bail" tab in Holding Center. CRUD + print on `detention_bail_records`; optional link to a `detention_records` row pre-fills bailee particulars. Delete restricted to admin/oic/2ic; print uses `openPrintWindow` from `src/lib/safe-print.ts` (no `safePrintHtml` export exists).

**Map tile failover** — `src/lib/leaflet-base-layers.ts` walks an ordered per-view chain (Google → OSM/Esri/OpenTopo) on `google-tiles-failed` and again after 6 `tileerror`s in 10s; emits `map-tiles-failover` (plus legacy `google-tiles-fallback-applied`).

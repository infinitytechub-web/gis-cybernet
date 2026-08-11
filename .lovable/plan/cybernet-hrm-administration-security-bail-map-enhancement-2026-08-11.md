# Cybernet HRM — Administration, Security, Bail & Map Enhancement

Eight work items, grouped so nothing existing breaks. Each item ends with verification.

## 1. Standard Bail form (Holding & Detention Center)

New "Standard Bail" tab beside Active Custody / Archive / Analytics.

- New `detention_bail_records` table: optional link to a custody record, bailee details (name, ID, contact, address), offence/reason, bail type, bail amount and currency, conditions, surety details (name, relationship, ID, contact, address), grant date, return/report date, and the authorization block — authorized-by name, rank/position, signature (typed name + drawn/uploaded signature image), authorization date, authorization status (pending / authorized / declined).
- Standalone or detainee-linked: picking a detainee prefills bailee details; leaving it blank allows walk-in cases.
- Table view with row actions **View**, **Edit**, **Delete**, **Print**.
  - View: read-only drawer showing the complete record.
  - Edit: same validated form, updates in place.
  - Delete: typed confirmation, restricted to authorized roles.
  - Print: clean A4 bail document with letterhead, signature block and CONFIDENTIAL footer, matching the existing print/PDF style.
- Field validation (required fields, numeric amount, date sanity, phone format).
- Access rules: detention staff and command tier can create/view/edit; delete restricted to command tier; the authorization block is only editable by authorized approvers, enforced by a database trigger (same pattern as the statement-approver guard). Every create/edit/delete/authorize is captured by the audit trigger.

## 2. Admin password management — post-deployment fix

Full audit of the password/credential path, then removal of whatever blocks a legitimate admin.

- Re-check the `admin-reset-password`, `admin-delete-staff-account`, `admin-recovery`, `repair-missing-auth`, `reset-and-create-accounts` and `bulk-create-accounts` functions for consistent admin checks, CSRF handling and error surfacing (real message, not "non-2xx status code").
- Verify the CSRF fetch patch is applied before any client call and that the production origin is accepted.
- Review the profile/auth database triggers and policies for rules that block admin writes (the SAO trigger fix is already in place — confirm no sibling trigger does the same).
- Sweep for stale/duplicate password components, dead endpoints and obsolete auth helpers; remove or consolidate them.
- End-to-end check: admin resets a password, forces a change, unlocks an account, and the staff account signs in with the temporary password.

## 3. System Branding Management (enterprise upgrade)

Upgrade the existing Branding tab into a full module surfaced as **Admin Console → System Branding**.

- Adds organization name, system description and contact information (email, phone, address, website) to the branding record.
- Sections: Identity, Logos & Favicon, Login page, Dashboard, Header/Footer, Theme colours, Contact & description.
- Live preview panel (login card + header/sidebar mock) with an explicit Publish step, so nothing goes live until saved.
- Image validation: type allow-list, size cap, dimension guidance and a warning when a logo is too small/large for its slot.
- Every branding save writes an audit-log entry recording which fields changed.
- Values keep living in the settings record, so they survive redeploys.

## 4. Global brand-name replacement

Replace "Amasaman Sector Command" with "Cybernet HRM System" everywhere it occurs. Confirmed occurrences span ~36 files: `index.html`, `public/manifest.json`, page components (Reports, Analytics, Interlink, Enforcement, Operations, Holding Center, GPS Addresses, Guard Schedule Import), export/print libraries (record PDF/DOCX, branded letter, guard schedule, interlink, compliance, excuse-duty templates, export utils), settings/staff components, an edge function (`send-record-email`), the audit scheduler, and one test file. Historical SQL migration files are left untouched (rewriting applied migrations is unsafe); current database defaults/settings rows are updated via a data update instead.

Afterwards a repo-wide search must return zero matches outside `supabase/migrations/`.

## 5. Command-tier model (both changes)

- **Delegated assignment:** Admin, OIC and 2IC can assign, modify, remove and view command-tier role assignments (today only Admin can). Database policies on the role table are rewritten so those three roles may write command-tier rows, with a guard preventing anyone from escalating themselves or granting above their own level.
- **Explicit permission grants:** a per-staff grant layer lets Admin/OIC/2IC authorize an individual non-command staff member for a specific command-tier capability. Feature gates change from "is command tier" to "is command tier OR holds a grant for this capability", checked by a security-definer database function so it is enforced server-side, not just in the UI.
- The Command Roles screen gains a Grants section (assign, view, revoke, expiry) and both role changes and grants are written to the command-role audit trail.

## 6. Live GPS map — automatic tile failover

Current behaviour: one-shot fallback from Google tiles to OSM. Upgrade to a resilient chain.

- Ordered source chain (Google proxy → OSM/Carto → Esri → OpenTopo) with per-source health tracking.
- On repeated tile errors the map switches to the next healthy source without reloading the map or losing GPS tracking.
- Exponential-backoff retry re-promotes a recovered source; tile results are cached and requests de-duplicated to avoid hammering the proxy.
- Geolocation watch is independent of tiles: markers and live tracking keep updating during any tile outage.
- If every source fails, a clear "base map unavailable — tracking still active" state is shown over a neutral grid instead of a blank map.
- Applied to every map surface (live GPS widget, command vault map, operations/enforcement maps, route history).

## 7. Admin Console (hub)

New `/admin` route: a single console page with grouped cards linking to the existing administrative screens — user & staff management, password management, roles & permissions, command tier, system branding, system configuration, security & authentication, audit trail, backup/restore, security updates, GPS/map configuration, notifications, data import/export, recycle bin.

- Cards are filtered by the viewer's actual authorization; the console itself is route-guarded.
- Sidebar keeps one "Admin Console" entry for administrators, and scattered admin links in ordinary menus are pointed at the console.
- Each linked screen keeps its own server-side checks — the hub adds navigation, never becomes the security boundary. Existing routes stay valid.

## 8. System-wide verification

- TypeScript check and production build.
- Database linter and security scan; fix anything introduced by these changes.
- Browser smoke test of: bail create/view/edit/delete/print, admin password reset, branding publish and propagation, command-tier assignment plus grant, map failover (simulated tile outage), and Admin Console access as admin vs ordinary staff.
- Console/network error sweep on the touched pages.
- Final report listing every item above with COMPLETED / VERIFIED status.

## Technical notes

- New tables: `detention_bail_records`, plus a command-tier grants table. Both get explicit grants, RLS, policies, `updated_at` triggers and audit coverage.
- New trigger guards: bail authorization block, command-tier grant escalation.
- New security-definer helper for the "command tier or explicit grant" check, used by both policies and the client role hook.
- Map work centralizes in `src/lib/leaflet-base-layers.ts` and `src/lib/google-tile-layer.ts` so all surfaces inherit failover.
- Order of execution: database migrations first (bail, grants, policies), then Admin Console + branding, then command-tier wiring, then map failover, then the name replacement sweep, then verification.

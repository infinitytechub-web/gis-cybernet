# Enterprise Fleet Management + System-Wide Hardening

Delivered in five phases (fleet last, as chosen). Each phase ends with typecheck, unit tests and a browser pass before the next begins.

## Phase 1 — System-wide fixes (quick wins)

**Ghana phone validation (all staff contact fields)**
- New `src/lib/ghana-phone.ts`: normalises to 10 local digits, detects network from prefix (MTN 024/054/055/059, Telecel 020/050, AirtelTigo 026/056/027/057), rejects anything else, flags suspicious/forged patterns (repeated digits, wrong length, invalid prefix).
- New `GhanaPhoneInput` component: masked entry, live network badge, inline error.
- Applied to every form that captures staff contact info (My Profile, staff create/edit, profile contacts, profile change requests, bulk upload validation, front-desk/detention staff contacts).
- Server-side enforcement: a shared SQL validation function plus BEFORE INSERT/UPDATE triggers on `profiles.phone` and `profile_contacts`, and the same check inside the bulk-upload edge function — so an API call cannot bypass the UI.

**Status controls**
- Operations: Open / In Progress / Closed / Resolved as the canonical set, with a DB check-style validation trigger, consistent badges, filters, dashboard counters, notifications and audit entries.
- Holding/Detention: Detained / Released / Transferred surfaced as the primary selectable statuses (existing legacy values such as bail, repatriated, court remain readable so no historical record breaks).

**Build/version identity**
- `vite.config.ts` already injects a build timestamp. Reformat it as `ITI - DD/MM/YYYY - Version` with the compact form `ITI18082026v1.0.0`, sourced from the actual build date plus `package.json` version, and show it in the footer, Dashboard and Admin Console.

**Admin session management**
- New `/admin/sessions` page: active sessions with device, IP, location, last-seen and current-session marker.
- Sign out one session, or sign out all — the latter visible only to Super/System Administrators and explicitly granted users (existing command-tier grant mechanism).
- Server-side invalidation via an admin edge function (revokes refresh tokens / forces sign-out), so reopening the app cannot restore a killed session. Every termination written to the audit trail with actor, target, reason and device.

## Phase 2 — Front Desk & Processing audit

Systematic pass over both modules: every route, query, mutation, RLS/grant path, form validation, loading and empty state, and each workflow end to end (application intake → processing → approval → dispatch). Findings fixed in place and confirmed with a browser-driven walkthrough plus new tests for the paths that were broken.

## Phase 3 — Organizational hierarchy + RBAC

- New `org_units` tree: self-referencing table with a level enum (regional_command, sector_command, directorate, department, section, unit), code, name, parent, active flag. Existing `departments` rows linked/migrated in.
- `staff_org_assignments`: which staff can access which org node, with inheritance down the tree.
- SQL helpers (`org_descendants`, `user_can_access_org`) used by RLS so backend enforcement matches the UI.
- Admin UI: tree builder (create/rename/move/deactivate) and an assignment screen for granting staff access to specific levels, assets and dashboards.
- `src/lib/rbac.ts` extended with org-scope checks; new fleet modules registered in the module registry so routes, nav and Admin Console tiles gate automatically.

## Phase 4 — Fleet database, ingest and services

Tables (all with grants, RLS, timestamps, audit): `fleet_vehicles`, `fleet_devices`, `fleet_drivers`, `fleet_driver_assignments`, `fleet_positions` (time-series, indexed), `fleet_trips`, `fleet_geofences` (incl. no-go zones and border corridors), `fleet_geofence_events`, `fleet_alerts`, `fleet_alert_rules`, `fleet_incidents`, `fleet_fuel_readings`, `fleet_sensor_events` (door/boot, tamper, jamming), `fleet_commands` (immobilization/recovery requests with approval chain), `fleet_media` (dashcam evidence), `fleet_messages` (in-cab), `fleet_assets`, `fleet_recovery_cases`, `fleet_audit_log`. Every table scoped to an `org_unit_id`.

Services:
- `fleet-ingest` edge function — device-agnostic position/telemetry endpoint with per-device API-key auth, replay-safe upserts, and a rules pass that raises geofence, unauthorized-movement, border, panic/SOS, crash, tamper and jamming alerts.
- `fleet-simulator` — generates realistic movement so tracking, geofencing, replay and alerting are demonstrable without hardware.
- Alert/notification engine reusing the existing notification + role-based-notifier plumbing.
- Import/export: CSV/XLSX for vehicles, drivers, devices, geofences; CSV/PDF for trips, alerts and analytics.

## Phase 5 — Fleet frontend

- **Live map** (`/fleet`): 24/7 tracking on the existing Google-proxied tile stack with offline/poor-connectivity resilience (cached last-known positions, queued actions, degraded-mode banner) reusing the current GPS offline cache pattern.
- **Route replay**: timeline scrubber, speed/stop markers, export.
- **Geofences**: draw/edit zones and no-go areas, per-zone rules and schedules.
- **Alerts & incidents**: unified inbox, severity, acknowledge/assign/resolve, SLA view, full audit.
- **Vehicles / Drivers / Assets / Devices** registries with driver identification and tamper status.
- **Fuel monitoring** with consumption charts and theft-suspicion flags.
- **Recovery workflow**: case file, live pursuit view, evidence, closure report.
- **Immobilization, dashcam evidence, two-way in-cab messaging**: full authorization-gated workflows (request → approval by authorised command tier → audited record), with hardware dispatch left as a documented integration point per your choice.
- **Analytics**: fleet KPIs, utilisation, driver behaviour, alert trends, exports and print.
- **Mobile command centre**: responsive layouts and bottom-nav entries so the whole suite is usable on phones.

## Phase 6 — Final verification

Typecheck, full unit suite, RBAC matrix test extended to fleet modules, database linter and security scan, Playwright smoke pass over new routes (fleet map, replay, geofences, alerts, sessions, front desk, processing, operations, detention), plus phone-validation and status-consistency regression tests. A written pass/fail report per area at the end.

## Notes

- Branding, naming and implementation are entirely original — Powerfleet/MiX is used only as a functional reference.
- Real device hardware is not connected; the ingest API + simulator stand in for it, and switching to a vendor feed later is a single adapter.

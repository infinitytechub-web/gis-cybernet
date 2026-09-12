# Interface Security Hardening, RBAC Least-Privilege and Navigation Restructure

Goal: no unauthorised person can see or reach staff personal data, security tools or administrative functions — through any screen, menu, widget, notification, link, download or request — and the menus are reorganised to the way security organisations separate administrative work from everyday work.

The database scanners currently report no open findings, so this work targets the interface, the menus and the rules behind each screen rather than re-fixing already-closed items. Anything already correct is left untouched.

## Phase 1 — Full surface inventory (no behaviour change)

Produce a single audit sheet covering every screen, menu entry, dashboard widget, notification source, list, export and direct link, recording for each: who can currently open it, what personal or confidential data it shows, and whether the same data is also protected on the server side. This sheet becomes the checklist for Phases 2-5 and the final report.

Focus areas known to concentrate sensitive data: staff records and KYC, medical, banking/loans, detention and enforcement, holding centre, cyber/firewall/IP blocking, audit and session tools, command vault, imports, and every widget on the main dashboard.

## Phase 2 — Close exposure gaps

For every gap the sheet records:

- Restrict lists, searches, filters, autocomplete and notification text to the records the person's role and command allow — names, phone numbers, addresses, identification, medical and financial details are hidden or masked otherwise.
- Enforce the same rule on the server for each screen, so typing a link, changing an identifier, or replaying a request returns nothing extra.
- Gate every preview, download, print and delete of a document behind an authorisation check tied to the owning person and command.
- Remove sensitive values from page source, browser storage, link addresses and error messages; error text becomes generic while the detail goes to the audit trail.
- Default to deny wherever a permission check cannot complete.

## Phase 3 — Reorganise menus, dashboard and controls

- Split navigation into clear groups: My Work, Command, Operations, People & Records, Reports, and a separated Administration & Security area that only holds administrative and security tools.
- Show only entries the person can actually use; nothing appears that leads to a refusal screen.
- Rebuild the main dashboard so each role sees a coherent set of widgets ordered by importance, with confidential figures replaced by role-appropriate summaries.
- Add consistent search, select and quick-scroll controls to long lists so restricted lists stay usable.

## Phase 4 — Role-by-role testing

Sign in as one account per role and command level (administrator, OIC, 2IC, staff officer, supervisor, shift supervisor, front desk, storekeeper, medical, command officer, ordinary officer) and for each:

- open every allowed screen and confirm it works,
- attempt every disallowed screen, record link, document link, export and request directly and confirm refusal,
- attempt to raise their own privileges through links, identifiers and browser tools and confirm refusal,
- check sign-out, session expiry, password change and re-use of an old session.

## Phase 5 — Audit trail, regression and sign-off

- Confirm failed sign-ins, permission changes, document access, downloads, edits, approvals and deletions are all recorded with the acting person, and add recording where missing.
- Re-run the security scan, the full test suite, the type check and the build, and repeat the role matrix once more.
- Deliver one report listing every issue found, what was changed, and confirmation of zero unauthorised data exposure, zero privilege-escalation paths and zero unprotected documents.

## Technical notes

- Central enforcement: extend the RBAC registry (`src/lib/rbac.ts`, `useRbac`, `RequireModule`, `ProtectedRoute`) plus `directory_permissions` / `can_directory_action` and command-scope helpers, rather than adding ad-hoc checks per page. Every UI gate must have a matching row-level policy or security-definer routine.
- Server-side: review RLS policies and RPC/edge-function authorisation for the sensitive tables (profiles and KYC, medical, loans/payments, detention, enforcement, cyber/firewall, audit, vault, imports), including grants for `anon`/`authenticated`; ensure storage objects are checked through the existing file-authorisation functions.
- Client-side leakage: audit React Query caches, `localStorage`/`sessionStorage`, query strings, CSV/PDF exports and toast/notification payloads for confidential fields.
- Navigation: restructure `AppSidebar.tsx`, `MobileBottomNav.tsx`, header menus and the dashboard widget set from the RBAC registry so visibility is derived, never hardcoded.
- Testing: extend Vitest coverage for permission helpers and drive Playwright sessions per role for direct-URL, download and escalation attempts.

## Scope note

No existing capability is removed. Where something is currently too widely visible it is narrowed to the correct roles and commands rather than deleted. Given the size of the system (about 100 screens), the audit sheet is produced first so the fixes are complete and reviewable rather than piecemeal.

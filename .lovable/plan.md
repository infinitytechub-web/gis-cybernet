# Dashboard Reorganization + Least-Privilege Access Control

Two connected pieces of work: a role-aware dashboard rebuilt around a clear information hierarchy, and a tightened least-privilege access model enforced in the UI, in the data layer, and in field-level visibility.

## Part 1 — Role-specific dashboards

The dashboard becomes a composition of sections resolved from the signed-in role, in a fixed hierarchy so the same information always sits in the same place:

```text
1  Header        role + posting + live clock
2  Key figures   4-6 KPI tiles, only those the role may act on
3  Action needed items awaiting THIS user (approvals, expiring docs, alerts)
4  My work       personal: my shift, my leave, my appraisal, my submissions
5  Operations    unit/section activity the role owns
6  Information   announcements, holidays, directory shortcuts
```

Three compositions:
- Staff / non-staff lower roles: sections 1, 3 (own items only), 4, 6. No system, security or command widgets. Non-staff functional roles (front desk, storekeeper, procurement officer, medical officer) additionally get only the Operations cards for their own module.
- Command tier (supervisor, staff officer and above): adds Operations oversight and command approval queues.
- Admin / OIC / 2IC: adds system health, security threats, audit and account-approval widgets.

Consistency and responsiveness across all three:
- One shared `DashboardSection` wrapper (heading, description, semantic `<section>` with `aria-labelledby`) so grouping and terminology are identical; single `<h1>`, section `<h2>`s.
- Grids: 1 column mobile, 2 tablet, 3-4 desktop; KPI tiles stay tappable at 44px minimum; tables keep the existing 700px min-width inside horizontal scroll.
- Terminology normalized against the module registry labels so a card, its sidebar entry, and its page title always read the same.

## Part 2 — Least privilege

**Module tiers tightened.** Audit Log Dashboard, Session Management, RUM Analytics, Sensitive Access Log, Admin Access Matrix, Command Role Audit and Shift Rules Audit move from the full command tier to Admin/OIC/2IC. Unit Dashboard and In-Cab Console stop being open to every authenticated user and become role-scoped (unit oversight roles; in-cab for fleet/patrol roles). Supervisors who genuinely need a restricted module get it through the existing delegated-grant mechanism, which is already audited.

**Field-level masking.** A new masking helper plus a `<Sensitive>` display component redacts values for roles without need-to-know, and never for the record's owner or the admin tier:
- Contact and identity: phone, personal email, Ghana Card, date of birth, address.
- Medical records, detainee identity details, next-of-kin.
- Financials: procurement and fuel amounts, unit budgets, vendor details.
Masked values render as a partial (`0244****21`), with an explicit reveal action for authorized roles that writes an audit entry.

**Navigation.** Sidebar, mobile bar, overflow menu and Admin Console tiles keep filtering through the same registry, and empty groups collapse instead of showing headings with no items. Hiding remains cosmetic only — enforcement is below.

**Backend enforcement.** For every module whose tier tightens, the tables and RPCs behind it are audited so policies are no looser than the module gate, and the privileged edge functions are confirmed to re-check authority server-side. Reads of sensitive tables continue to log through the existing sensitive-access-log pattern; reveal actions on masked fields are logged too.

## Technical notes

- `src/lib/rbac.ts` — retier the modules listed above; add a `sensitiveFields` concept keyed by module for the masking layer.
- `src/lib/field-visibility.ts` (new) — `canSeeField(role, field, ctx)` + `mask()` formatters; pure and unit-tested.
- `src/components/Sensitive.tsx` (new) — renders masked/plain value, optional audited reveal.
- `src/components/dashboard/DashboardSection.tsx` (new) + `src/pages/Dashboard.tsx` split into `StaffDashboard`, `CommandDashboard`, `AdminDashboard` compositions selected by resolved role.
- Apply `<Sensitive>` at the read surfaces: staff profile/directory, detention records, medical records, procurement/fuel amounts, unit budgets.
- Database: policy/grant audit pass over the retiered modules' tables via the linter and targeted policy reads; tighten anything looser than its gate. Any change ships as a migration for your approval.

## Verification

- Extend `src/test/rbac.test.ts`: retiered modules must deny plain staff and supervisors; no module may resolve to "everyone" except the personal ones; field-visibility matrix tests.
- Playwright: walk the restricted route list and the dashboard as staff and as admin, capturing allowed/denied and the three dashboard compositions.
- Backend probe: direct REST reads with a staff-level token against the tables behind the retiered modules and the masked fields, asserting denial or absence server-side.
- Report back the resulting allow/deny matrix and the security-memory update.

## Out of scope

- New roles or changes to the role hierarchy.
- Per-row department scoping beyond what org-unit scoping already does.

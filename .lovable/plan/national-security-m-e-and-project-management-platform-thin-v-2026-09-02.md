# National Security M&E and Project Management Platform — Thin Vertical Slice

Extend the existing Cybernet HRM into an integrated M&E, project and performance
management platform. This first delivery is a **thin vertical slice across all 20
navigation items**: every module gets a real table, real access control, real audit
and a working screen — shallow but end-to-end — so the full operating model and
traceability chain are visible. Later passes deepen each module (Gantt, form builder,
offline sync, dashboard builder, scheduled reports, Power BI feeds).

No existing HRM functionality changes. No duplicate master data: staff, departments,
org units, Ghana regions/districts, files, notifications, audit and auth are reused as-is.

## What you will be able to do after this slice

- Open a new **M&E and Project Management** section in the sidebar with all 20 items.
- Create a strategic objective, hang programs and projects under it, and break projects
  into workstreams, activities, tasks and milestones.
- Define KPIs and indicators, set targets per reporting period, and report results.
- Submit a field report from a phone with GPS, photos and evidence attachments.
- Verify or return a reported result as an M&E Officer; reported and verified values stay separate.
- Log risks (5x5 matrix), issues, incidents and corrective actions with escalation.
- Record budgets, expenditure and resource allocations that reference HRM/fleet/inventory records.
- See a national Command Center with KPI cards, portfolio health, risk exposure, incident
  status, pending approvals and overdue items, with drill-down.
- See a GIS map of regions/districts with projects, incidents, field reports and performance.
- Run reports and exports (PDF/Excel/CSV/print) that respect role, geography and classification.
- Review an M&E audit trail and configure objectives, measures, periods, thresholds,
  workflows, categories and notification rules in the Administration area.

Seeded with non-sensitive demonstration data (3 objectives, 4 programs, 10 projects,
5 regions, 20 activities, 50 tasks, 15 measures, 20 targets/results, 10 risks,
10 incidents, 10 field reports, 20 evidence records, 5 budgets), all tagged `is_demo`
so it can be purged in one action.

## Access model

Hybrid, as agreed. Three new roles are added to the existing `app_role` enum and the
label map: **M&E Officer**, **Project Manager**, **Field Officer**. Everything else
maps onto existing roles (command tier for executive views, supervisors for review,
staff for own tasks/reports) plus delegated `command_tier_grants` capabilities for
exceptions such as Programme Director or Auditor.

Every record carries owning org unit, responsible department, geographic scope,
responsible officer and data classification (Public / Internal / Confidential /
Restricted / Highly Restricted). Authorization evaluates role + org unit + geography
+ ownership + classification + action, enforced in RLS and mirrored in the UI registry.

## Technical scope

**Database** — one migration group, tables prefixed `me_`:

- Strategy: `me_pillars`, `me_objectives`
- Portfolio: `me_programs`, `me_projects`, `me_workstreams`
- Delivery: `me_activities`, `me_tasks`, `me_milestones`, `me_dependencies`
- Measurement: `me_measures` (single shared model, `classification` = kpi | indicator,
  `result_level` = input/activity/output/outcome/impact), `me_targets`, `me_results`
  (reported and verified values in separate columns), `me_reporting_periods`
- Results framework: `me_frameworks`, `me_framework_rows`, versioned
- Field reporting: `me_form_templates` (+ versions), `me_field_reports`
- Evidence: `me_evidence`, `me_verifications`
- Risk/issues/incidents: `me_risks`, `me_issues`, `me_corrective_actions`, `me_incidents`
- Resources and finance: `me_resource_allocations` (FK to `profiles`, `fleet_vehicles`,
  `inventory_items` — no new master records), `me_budgets`, `me_budget_lines`, `me_expenditures`
- Workflow/notifications/performance: `me_approvals`, `me_approval_steps`,
  `me_event_rules`, `me_scores` (with formula version, weights, timestamp), `me_settings`
- Audit: reuses `system_audit_log` and the existing `audit_record_changes` trigger;
  M&E-specific reads logged via the existing sensitive-access pattern

Each table follows project convention: `CREATE TABLE` → `GRANT` → `ENABLE RLS` →
policies, `created_at`/`updated_at` with the shared update trigger, soft archive via
`archived_at`, indexes on org unit, region, status, dates and parent FKs. Geography
reuses `ghana_districts` / `ghana_regional_capitals`; org reuses `org_units` and
`can_see_org_unit` / `can_manage_org_unit`.

Helper functions: `me_can_view(record_classification, org_unit, region)`,
`me_project_health(project_id)`, `me_measure_achievement(measure_id, period_id)`,
`me_data_quality_score(scope)`, `me_command_center(filters)` and
`me_recalculate_scores()` — all `security definer`, `search_path = public`, admin/role
guarded, returning aggregates so dashboards never pull raw rows.

**Frontend** — `src/lib/me-rbac.ts` module entries registered in the existing
`src/lib/rbac.ts` registry (20 module keys, one per nav item) so route guards, sidebar,
mobile bar and Admin Console stay in agreement. New collapsible sidebar group
"M&E and Project Management" following the existing accordion pattern, plus
`src/lib/nav-descriptions.ts` entries for hover tooltips. Pages under `src/pages/me/`,
hooks under `src/hooks/me/`, shared status badges, classification chip, risk matrix,
Kanban/list/calendar views and reuse of existing table, chart (Recharts), Leaflet map,
`DateInput` (DD/MM/YYYY), export (`download-utils`, `csv-safe`) and notification components.
Gantt/timeline ships as a read-only timeline in this slice.

**Escalation and notifications** — event rules stored in `me_event_rules`; an
`me-event-engine` edge function on a scheduled job evaluates overdue tasks/milestones/
reports, threshold breaches, critical risks/incidents, budget overruns, missing evidence
and data-quality failures, writing in-app notifications through the existing service and
recording every dispatch.

**APIs** — CRUD and workflow actions go through the existing Data API with RLS;
aggregate/analytics and workflow transitions go through audited RPCs and edge functions
following current CSRF, validation (Zod) and error-sanitisation conventions. Governed
export endpoints are documented for future Power BI use. Finance is held in-platform as
the interim source of truth, with `external_ref` and `sync_status` columns already present
so a real finance system can take over later without a redesign.

**Tests** — Vitest for health/achievement/risk-score/data-quality calculations, RBAC
matrix for all 20 modules (permitted and denied), classification filtering, workflow
transitions and audit writes; Playwright smoke coverage for Command Center load,
project creation, field report submission on a mobile viewport, verification and a
denied-access route.

## Sequence

1. Migration group 1: settings, classifications, periods, strategy, portfolio, delivery + RLS/grants/audit
2. Migration group 2: measurement, results framework, field reporting, evidence, verification
3. Migration group 3: risk, issues, incidents, corrective actions, resources, finance, approvals, events, scores
4. RBAC registry, new roles, routes, sidebar section, shared components
5. Module screens (all 20), shallow but complete: list, detail, create/edit, workflow actions, export
6. Command Center, GIS map, analytics, reports
7. Demo data seed (`is_demo`), calculation and traceability verification
8. Typecheck, tests, build, browser walkthrough of every route, Supabase linter review

## Notes

- Nothing in the existing HRM is removed or restructured; the new section is additive.
- Approved records become version-controlled rather than editable in place.
- Offline field-report drafts use local caching in this slice; full sync-conflict handling is a later pass.
- No external payment or government APIs are hard-coded.

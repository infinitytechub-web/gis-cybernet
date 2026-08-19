---
name: Maintenance, clock reason/photo, procurement budgets
description: Fleet maintenance module, patrol-log vehicle column, clock-in reason+photo, per-unit procurement budgets
type: feature
---
- Fleet tab `maintenance` (FleetMaintenanceTab): fleet_maintenance_schedules + fleet_maintenance_records; `fleet_maintenance_status()` RPC feeds the "Maintenance & servicing" card on Fleet Dashboard.
- Fleet Dashboard patrol log card has a Vehicle column: plate/call sign badge for vehicle patrols, "Foot patrol" badge when vehicle_id is null.
- Roster clock in/out opens a dialog: reason (mandatory when clocking for another officer) + optional photo uploaded to the private `attendance-photos` bucket; `roster_clock_action(_profile_id,_action,_notes,_reason,_photo_path)`.
- Procurement: purchase_requisitions.org_unit_id ties a request to a unit; `procurement_budgets` (unit + fiscal year) and `procurement_budget_status(_fiscal_year)` power the "Unit & branch budgets" panel and the overspend warning in the raise-request form. Only the storekeeper tier can set budgets.

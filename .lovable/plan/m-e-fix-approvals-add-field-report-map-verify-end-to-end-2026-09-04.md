# M&E: Fix Approvals, Add Field-Report Map, Verify End to End

## 1. Make submissions and approvals work again

The approval routines (`me_submit_for_approval`, `me_decide_approval`, `me_approval_queue`, plus `me_command_center`) currently run with the caller's own database rights, so writing the approval step rows is blocked by row-level security and nothing can leave draft.

Fix: recreate them as elevated (SECURITY DEFINER) routines with authorization enforced inside the function body:

- Submit: caller must be able to manage the record (existing `me_can_manage` / command-tier helper) and be within its classification clearance; re-submission of an already in-flight record is refused.
- Decide: caller must match the current step's reviewer authority (supervisor step vs command step); comment stays mandatory; each decision writes the step row with the acting user recorded.
- Queue and dashboard reads stay scoped by `me_can_view` / clearance so a user never sees records outside their scope.
- `search_path` pinned, execute granted to signed-in users only (revoked from anonymous).

## 2. Field-report GIS map on Command Center

New map card on the Command Center, driven by the report location fields already stored on each field report (region, district, latitude, longitude, status, reported date):

- Leaflet map (same base-layer/provider setup used by the other maps in the app) with clustered markers for reports that have coordinates.
- Marker colour by report status (draft / submitted / under review / verified) with a legend.
- Click a marker to open a details panel: reference, title, summary, region and district, status, reported date, and a link through to the full report record.
- Region roll-up strip beside the map: report counts per region, clicking a region filters both the map and the existing Command Center figures.
- Reports with no coordinates are listed separately as "location not recorded" so nothing is silently hidden.
- Empty and loading states, keyboard-reachable list alternative to the markers.

## 3. Verification

- Create a strategic objective, send it for approval, approve it through both steps in the Approvals inbox, and confirm the record reaches approved status in the app and in the database.
- Confirm the objective and the field-report figures show on the Command Center under the new access rules, and that a staff user without M&E authority is refused both the submit and the decide actions.
- Extend `tests/e2e/me-workflow.spec.ts` with the map card assertions (marker/region roll-up visible, clicking a marker reveals its details).

## Technical notes

- One migration recreates `me_submit_for_approval`, `me_decide_approval`, `me_approval_queue` and `me_command_center` as `SECURITY DEFINER ... SET search_path = public`, with in-body checks replacing the RLS reliance; step rows are inserted with the acting reviewer id so `me_approval_steps` policies are satisfied.
- Map data comes from a new `me_field_report_map(_region text)` definer function returning id, ref_code, title, summary, status, region, district name, lat/lng, reported_at — filtered by `me_can_view` and clearance — so the client needs one round trip and never selects the table directly.
- Frontend: `src/components/me/FieldReportMap.tsx` (Leaflet + markercluster, `leaflet-base-layers.ts` providers, `map_access_audit` logging as on other maps) rendered inside `CommandCenterDashboard.tsx`; region selection lifted into the existing `region` state so all metrics stay in sync.
- Colours and badges use semantic tokens only; dates render `DD/MM/YYYY` via the shared formatter.

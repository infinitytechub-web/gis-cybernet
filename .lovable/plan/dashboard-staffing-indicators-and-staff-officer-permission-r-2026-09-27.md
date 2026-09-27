# Dashboard staffing indicators and Staff Officer permission regressions

## Goal
Extend the existing staffing alert and seven-day trend treatment across administrator-facing dashboards, then add repeatable UI and API tests proving Staff Officers remain confined to their command and assigned modules.

## Dashboard changes
- Reuse the existing KPI card’s semantic category accents, warning/danger states, and accessible trend arrows rather than introducing another card style.
- Move staffing thresholds into a shared utility so command analytics, the main system dashboard, standalone command dashboard, unit dashboard, and command administration use the same definitions.
- Add meaningful indicators where staffing data exists:
  - strength/fill-rate warnings against authorised strength;
  - low active-rate and absence warnings;
  - vacancy and unfilled-appointment warnings;
  - missing department/rank/profile-data warnings on the administration dashboard;
  - seven-day headcount and active-strength movement from the existing scoped analytics snapshots.
- Preserve each dashboard’s current permissions and navigation. Indicators link only to destinations the signed-in administrator can already open.
- Keep personal-only staff cards unchanged unless they already expose an actionable personal warning; no restricted aggregate data will be added there.

## Automated permission regression coverage
- Expand unit-level RBAC tests to prove a Staff Officer receives no restricted module through role defaults or permission-matrix overrides, and receives only an exact active per-person grant.
- Add a dedicated read-only browser/API regression suite for a real Staff Officer fixture. The suite will:
  - verify restricted and unassigned module links are absent and direct navigation is denied;
  - verify an assigned HR/analytics page may open only when granted;
  - request a known officer and unit from another command through the UI and confirm no identity or record is rendered;
  - directly probe profiles/HR records, analytics functions, staff documents, and command-scoped functions with the Staff Officer token and require empty or authorization-denied responses;
  - verify same-command records remain available, preventing a false-positive test caused by a broken account or blanket denial;
  - assert the fixture is actually a Staff Officer and that the tested module is unassigned before testing denial.
- Extend the existing test helper contract with Staff Officer credentials and safe read/RPC helpers. The suite will skip with an explicit setup reason when those protected CI credentials are unavailable.

## Verification
- Run focused RBAC tests, the new Staff Officer browser/API suite when its credentials are available, the broader regression suite, and the project’s automatic build check.
- Exercise administrator dashboards at desktop and phone widths, checking that alert text, arrows, and cards remain readable and do not overlap.
- Record any credential-blocked live checks explicitly; tests will never create, edit, or delete personnel data.

## Technical notes
- Existing `command_analytics_snapshots` and `command_analytics_baseline` remain the historical source; no duplicate analytics store is needed.
- Database policies/functions remain the enforcement boundary. UI checks are tested separately and are never treated as sufficient protection.
- No role grants, production records, or unrelated security findings will be changed.

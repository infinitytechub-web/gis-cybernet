# Staff Forms & Dashboard Reliability Plan

## Goal
Ensure System Administrators can open and edit any staff record quickly from the dashboard, with every part of the personnel form reachable.

## Verified current state
- Staff Management already limits the table to 25 records per page and uses memoized rows, preventing form typing from redrawing the full staff list.
- The edit dialog already contains the complete A–L personnel form, with a fixed header/footer, an independently scrollable body, sticky section tabs, Previous/Next controls, and loading feedback for extended sections.
- The dashboard’s staff search currently opens the staff profile page rather than the edit form, so direct dashboard-to-edit access is not yet wired.
- The latest application build is passing, with no current runtime or console errors recorded.

## Implementation
1. Add a clear **Edit staff** action to administrator dashboard staff-search results while preserving the existing profile-view action.
2. Deep-link that action to Staff Management with the selected staff record identified, then securely open its edit form after the authorized staff list loads.
3. Reject invalid, unavailable, or unauthorized edit links with a clear message and leave the Staff page usable.
4. Keep the existing lightweight table rendering and complete A–L dialog layout; adjust only any accessibility or viewport issue found during browser testing.
5. Ensure closing or saving the form removes the edit link state so refresh/back navigation does not reopen it unexpectedly.

## Validation
- Test as a System Administrator from Dashboard search → Edit staff → complete A–L form → save.
- Measure form-open responsiveness and confirm typing remains smooth with the full staff dataset loaded.
- Check desktop and compact/mobile viewports for reachable tabs, fields, Previous/Next controls, close control, and Update Staff button.
- Test direct-link refresh, invalid record, unauthorized user, cancel, and successful update paths.
- Run focused tests, the full test suite, type checking, and confirm the preview build/error logs remain clean.

## Scope
No database schema or unrelated module changes are planned unless testing proves an existing Staff save/read permission is blocking this exact flow.

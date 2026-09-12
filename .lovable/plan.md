# Verify one new officer's sign-in end to end

Walk a single real officer (one of the 119 newly created accounts) through the full first-day journey and fix anything that blocks it. The account stays in place afterwards.

## Steps

1. **Pick the officer**
   Choose one active officer from the recent staff-list import who has a sign-in account and a command posting. Record their staff ID, sign-in email and command.

2. **Confirm the account exists and is usable**
   Check the account was created, the email is confirmed, and the first-login "must change password" flag is set. If any of these is missing, repair it for this officer.

3. **First login**
   Sign in with the one-time password from the account sheet and confirm the app sends them straight to the change-password screen instead of the dashboard.

4. **Change password**
   Set a new password that satisfies the current password rules, confirm the change succeeds and the first-login flag clears, then sign in again with the new password.

5. **Confirm their landing page loads**
   Verify the officer arrives at their own command portal (not the admin dashboard), and that the command dashboard shows their command: officers list, ranks, and their own record. Check that nothing outside their command is visible.

6. **Fix and re-verify**
   Any error, blank panel, permission denial or slow load found in steps 2-5 gets fixed and the affected step repeated until it passes clean.

## Outcome reported back

- The officer's staff ID, command, and their new password (so you can hand it over or reset it).
- Pass/fail for each step, and a note on anything that had to be fixed.

## Technical notes

- Verification is done by driving the running app in a headless browser (login form, change-password screen, command portal, command dashboard) plus direct database checks of the profile, role, org unit, and account state.
- Landing-page routing comes from `Index.tsx` (admin to `/dashboard`, everyone else to `/command-portal`); the first-login gate lives in `ProtectedRoute.tsx` / `ForcePasswordChange.tsx`.
- Command scoping is checked through the existing `my_command_context()` / `my_command_officers()` routines and the directory permission matrix gates, so a failure will be traced to role, org unit assignment, or a matrix switch — not patched around.
- No new officer records are created and none are deleted; only the chosen officer's password changes.

## Goal

Lock in the RBAC fixes from the previous turn with automated regression tests so a future trigger or RLS change can't silently re-break admin staff management.

## Scope

Three new Playwright e2e specs under `tests/e2e/`, following the existing
`admin-reset-password.spec.ts` style (direct REST/edge-function calls with a
signed-in admin token, no UI driving). Each spec is skipped when its env
vars are missing so local runs don't fail.

## New files

### 1. `tests/e2e/admin-edit-profile.spec.ts`
Verifies admins can update fields that the `restrict_profile_updates`
trigger blocks for everyone else.

Cases (admin token, PostgREST PATCH `/rest/v1/profiles`):
- Update non-restricted field (`other_names`) → 200/204.
- Update restricted field `rank_id` → 200/204 (admin bypass).
- Update `department_id` (including to/from MISD) → 200/204.
- Update `staff_id`, `shift_group`, `unit`, `account_locked`, `login_enabled`, `status` → all succeed.
- Non-admin staff token attempting the same restricted updates → 4xx with the trigger's "Only admins can change …" message.

Each test snapshots the original value first and restores it in `afterAll` so the run is idempotent.

### 2. `tests/e2e/admin-delete-staff-account.spec.ts`
Mirrors `admin-reset-password.spec.ts` shape against
`/functions/v1/admin-delete-staff-account`.

Cases:
- Unauthenticated → 401.
- Authenticated non-admin → 403.
- Admin + missing `profile_id` → 400.
- Admin + reason shorter than 4 chars → 400.
- Admin + unknown `profile_id` → 404.
- Admin + reserved staff_id (`ADMIN-001`) → 400 "protected system account".
- Admin + self profile → 400 "cannot delete your own account".
- Admin + valid stub profile (env `E2E_DELETE_TARGET_PROFILE_ID`, expected to be a `PEND-*` stub that may have `shift_assignment_overrides` rows) → 200, regression-guard for the "append-only" cascade bug fixed earlier.
- Follow-up GET on `profiles?id=eq.<id>` returns empty → confirms hard delete.

### 3. `tests/e2e/admin-password-change-flows.spec.ts`
Covers the end-to-end password lifecycle so any future change to
`must_change_password`, RLS on `failed_login_attempts`, or
`admin_reset_failed_attempts` is caught.

Cases (chained, single admin session):
1. Admin calls `admin-reset-password` for `E2E_RESET_TARGET_PROFILE_ID` → 200 with new `temporary_password`.
2. Target user logs in with temp password → succeeds, session JWT carries `user_metadata.must_change_password === true`.
3. Target hits any protected REST endpoint and is allowed (token is valid) but client-side gate would force `/change-password` (asserted via the metadata flag).
4. Target calls `supabase.auth.updateUser({ password: newStrongPw, data: { must_change_password: false } })` → 200.
5. Re-login with `newStrongPw` → succeeds; metadata flag now false.
6. Old temp password no longer works → 400 invalid creds.
7. Admin re-resets again to leave the account in a known state for the next CI run.

## Support changes

- `tests/support/auth.ts`: add a small `signInToken(email, password)` helper that returns just the access token (the existing helper only seeds localStorage). Both new specs need raw tokens.
- No production code changes.

## Env vars (documented in each spec header, all optional → skip)

Already present:
`E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`,
`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`,
`E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`,
`E2E_RESET_TARGET_PROFILE_ID`, `E2E_ORPHAN_PROFILE_ID`.

New:
- `E2E_ADMIN_PROFILE_ID` — admin's own profile id (self-delete guard test).
- `E2E_EDIT_TARGET_PROFILE_ID` — disposable profile safe to mutate.
- `E2E_DELETE_TARGET_PROFILE_ID` — disposable stub profile safe to delete.
- `E2E_MISD_DEPARTMENT_ID`, `E2E_OTHER_DEPARTMENT_ID`, `E2E_ALT_RANK_ID` — values used by the edit spec.

## CI wiring

`playwright.e2e.config.ts` already auto-discovers `tests/**/*.spec.ts`, so the new files are picked up without config changes. The existing `.github/workflows/*` job that runs `npm run test:e2e` will execute them; missing env vars cause clean `test.skip()` rather than failures.

## Out of scope

- No UI-driving tests (the existing flows are pure API-level, much more stable).
- No vitest unit tests — these regressions are inherently integration-level (RLS + triggers + edge function).
- No changes to the edge functions or migrations themselves.

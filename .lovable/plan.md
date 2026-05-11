## Goal

Make TOTP enrolment in `src/pages/MfaGate.tsx` self-healing so a stale or duplicate unverified factor never blocks the admin. Any enrolment error should auto-clean and retry once, and the user should always have a visible "Regenerate" escape hatch.

## Changes (single file: `src/pages/MfaGate.tsx`)

1. **Extract `cleanupUnverifiedFactors()` helper**
   - Calls `supabase.auth.mfa.listFactors()`, unenrolls every factor where `status !== "verified"`.
   - Swallows individual unenroll errors (best-effort) but returns a count for logging.
   - Replaces the two inline cleanup loops in `useEffect` and `handleEnrol`.

2. **Harden `handleEnrol` with auto-retry (no user-visible block)**
   - Wrap `supabase.auth.mfa.enroll(...)` in a try/catch.
   - On error whose message matches `/already exists|friendly.?name|unverified|duplicate/i`:
     - Run `cleanupUnverifiedFactors()` again.
     - Retry `enroll(...)` once with a fresh friendlyName suffix (append a short random token alongside the timestamp to guarantee uniqueness).
   - Only surface a toast if the retry also fails. Toast becomes actionable: "Could not start 2FA setup. Tap Regenerate to try again."
   - Always clear stale `factorId`, `qrUri`, `secret`, `code` before enrolling so a previous attempt's data never lingers in state.

3. **Add a "Regenerate QR / secret" control on the `verify-enrol` screen**
   - Small ghost button under the manual-key block: "Regenerate code" (icon: `RefreshCw`).
   - Handler: unenroll the current `factorId` (best effort), call `cleanupUnverifiedFactors()`, then re-run `handleEnrol()`. Shows `busy` state on the button.
   - Lets the admin recover instantly if their authenticator rejected the secret, without signing out.

4. **Friendly-name uniqueness**
   - Change suffix from `new Date().toISOString()` only → `${ISO}-${crypto.randomUUID().slice(0,8)}` so two rapid attempts can never collide on the Supabase unique constraint.

5. **Telemetry-light logging**
   - On retry path, `console.warn` with the original error message (no PII) so future debugging is easier. No new tables, no new RPCs.

## Non-goals

- No DB migrations, no edge function changes, no auth config changes.
- `verify` / `recovery` / `signOut` flows untouched.
- No UI redesign — only one new button + tightened toasts.

## Verification

- Reload `/2fa` as GIS-ASC-0007 with a stale unverified factor present → should land on QR screen without an error toast.
- Click "Regenerate code" → new QR + new secret render; old factor is gone from `listFactors()`.
- Enter a valid TOTP from the latest secret → reaches `/dashboard`.

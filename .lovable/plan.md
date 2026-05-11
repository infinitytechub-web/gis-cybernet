## Goal

Stop displaying the raw TOTP secret anywhere in the UI. Replace the current "manual setup key" input + copy button with a secure, scan-only enrolment experience, and route any "lost authenticator" case through the existing backup-code recovery flow rather than re-exposing secrets.

## Scope

Single file: `src/pages/MfaGate.tsx`. No DB / edge function / auth config changes. Chat-side secret leakage is a conversational artefact and cannot be edited from code — the in-app changes below ensure no future secret is ever rendered or copyable from the interface.

## Changes

1. **Remove the plaintext secret block (lines ~270–280 area)**
   - Delete the `Manual setup key` card containing `<Input value={secret} ...>` and the `Copy` button.
   - Remove `handleCopySecret`, the `Copy` icon import, and the `secret`-related JSX.
   - Keep `secret` in state only as an internal value passed to `QRCode.toCanvas` — never rendered.

2. **Scan-only QR experience**
   - Keep the canvas QR (already rendered locally, no third-party calls).
   - Add a short helper line under the QR: "Scan this QR with Google Authenticator, Authy, or 1Password. The secret is never displayed for your protection."
   - Add a "Can't scan? Use recovery instead" link that routes to the existing backup-code flow (`setPhase("recovery")` is already wired for the verify path; for enrolment we route to a new tiny `enroll-help` view — see step 3).

3. **Add an `enroll-help` info view (no secret reveal)**
   - New phase string `"enroll-help"`.
   - Content: short instructions explaining that for security the manual key is not shown; if they cannot scan the QR they should:
     a. Sign out and contact a system administrator to reset their 2FA, OR
     b. Use a recovery code (only valid if they had previously enrolled and saved codes).
   - Buttons: `Back to QR` (returns to `verify-enrol`), `Use a recovery code` (sets phase to `recovery`), `Sign out`.

4. **Keep the "Regenerate code" button**
   - Already added; rotates the QR safely without exposing the secret. Behaviour unchanged.

5. **Tighten clipboard / DOM hygiene**
   - Ensure the `secret` string is never written to `document.title`, never logged, never put in any `data-*` attribute. Audit current code — only used for QR rendering.
   - Remove the `secret` variable from any `console.warn` in `handleEnrol` / `tryEnrolOnce`.

6. **Verify-phase (returning admin) untouched**
   - Existing `Lost your authenticator? Use a recovery code` link continues to work.

## Verification

- Reload `/2fa` as GIS-ASC-0007 → QR renders, no secret string visible anywhere on the page (DOM inspect confirms).
- Click "Can't scan?" → lands on `enroll-help` view with no secret.
- Click "Regenerate code" → new QR renders, still no secret shown.
- Recovery flow from the verify screen still consumes a backup code and re-enrols (no secret reveal).

## Out of scope

- Removing the secret from prior chat messages (cannot be done from code).
- Any change to the backup-code generation, RPC, or audit tables.

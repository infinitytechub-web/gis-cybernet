# Build Versioning + System-wide Ghana Phone Validation

## 1. Automatic build version (date + daily sequence)

Today the footer, Dashboard and Session Management show `ITI180820261.0.0`, built from a
hard-coded release date constant in `src/lib/build-version.ts` — it only changes when
someone edits that file. New behaviour:

- Each build stamps a unique fingerprint (build timestamp + short hash) at compile time.
- On the first load after a deployment, the app registers that fingerprint with the backend.
  The backend assigns the next sequence number for that calendar day and stores the release.
- Displayed version becomes `ITI25082026-01`, `ITI25082026-02`, … resetting each day.
  Every deployment gets its own row, so the identifier is never edited by hand.
- Until the first registration resolves, the UI shows the local date-based fallback, so
  nothing ever renders blank.

Where it appears (all read the same helper, so no format drift):
- App footer (with tooltip: exact build time and sequence)
- Dashboard build chip
- Session Management build line
- New **System information** card in Admin Console showing current version, build time,
  first-seen time, and a **Deployment history** table of the last 50 releases (date,
  sequence, version id, first seen, registered by).

Deployment history is stored in the database, giving the audit trail the requirement asks for.

## 2. Ghana phone validation coverage

The central rules already exist (`src/lib/ghana-phone.ts`, the edge-function mirror, and
`gh_phone_*` SQL triggers), with two validators: strict staff/Ghana-only and
Ghana-strict/international-tolerant for applicant biodata. Keeping those rules as-is (no new
library). Work is coverage + enforcement:

- Sweep every form that accepts a telephone number and make sure it uses `GhanaPhoneInput`,
  `ContactPhoneInput`, or `MultiContactInput` rather than a plain text input: staff
  registration and edit, bulk staff/roster imports (per-row validation with a clear row
  error in the preview step), profile and biodata forms, front desk and processing forms,
  supplier and vendor forms, contact and interlink contact forms, detention/bail contacts,
  night guard and roster dialogs.
- Add a repo guard test that fails when a new phone field is wired to a raw input, so future
  forms cannot silently skip validation.
- Bulk imports: invalid or fabricated numbers are reported per row in the preview and blocked
  at commit, instead of failing with a raw database error.

## 3. Server-side enforcement

- Confirm/extend the `gh_phone_*` triggers so every table column that stores a phone number
  is guarded — including new tables added below — so a direct API call cannot bypass the UI.
- Every edge function that accepts a phone number normalises it through the shared
  `_shared/ghana-phone.ts` helpers before writing, and returns a friendly message
  ("Not a licensed Ghana mobile number", "This number looks fabricated") with no internal
  detail such as table names or SQL text.
- Numbers are stored canonically: `0XXXXXXXXX` for Ghana, `+<digits>` for foreign contacts.
- Existing records are untouched; validation applies on insert and on edit of the phone value,
  so legitimate historical data keeps working until it is next edited.
- Tests: unit tests for the shared validators, plus direct API-level checks that posting an
  invalid number straight to the backend (bypassing the UI) is rejected.

## 4. Payment and loan forms (scaffold)

New minimal, role-gated modules that use the shared phone validator from day one:

- **Payments** — record a payment request: payer name, validated phone, amount, method,
  reference, purpose, status.
- **Loans** — staff loan application: applicant, validated phone, amount, repayment months,
  purpose, status.

Both get their own tables with row-level security (staff see their own records, command tier
and admin see all), phone-guard triggers, audit timestamps, and sidebar entries gated by the
existing role registry.

## Technical notes

- `vite.config.ts` injects `__APP_BUILD_FINGERPRINT__` (build time + content hash);
  `src/lib/build-version.ts` loses the hard-coded `RELEASE_DATE_COMPACT` and resolves the
  version from a small React Query hook.
- New table `app_build_releases` (fingerprint unique, build date, daily sequence, version id,
  first seen, registered by) plus a security-definer RPC that atomically claims the next daily
  sequence and returns the release row; read access for admin/command tier.
- New tables `payment_requests` and `loan_applications` with grants, RLS, updated_at triggers
  and `gh_phone_guard_contact_columns` triggers.
- No changes to existing business logic, approval workflows, or stored phone data.

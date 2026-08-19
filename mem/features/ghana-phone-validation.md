---
name: Ghana Phone Validation
description: System-wide Ghana mobile number validation (MTN/Telecel/AirtelTigo) with forged-number detection on client, edge functions and DB triggers
type: feature
---

All staff and contact phone fields must be genuine Ghana mobile numbers: 10 local digits starting 0, prefix on MTN (024/054/055/059/025/053), Telecel (020/050) or AirtelTigo (026/056/027/057). +233 / 233 / 00233 forms accepted and normalised to the local form.

Forged/placeholder numbers are rejected (not just warned): repeated subscriber digits, 1234567 / 7654321 / 0123456 / 1111111 / 0000000, repeating pairs (1212123).

Enforcement layers:
- Client: `src/lib/ghana-phone.ts` (`validateGhanaPhone`, `validateGhanaPhoneList`, `isSuspiciousGhanaPhone`, `assertGhanaPhoneList`) + `GhanaPhoneInput`; `MultiContactInput mode="list" ghana` for multi-number fields.
- Edge functions: `supabase/functions/_shared/ghana-phone.ts` (`normalizeGhanaPhoneList` rejects invalid + suspicious).
- DB: `gh_phone_*` functions and triggers on profiles, profile_contacts, inventory_suppliers, procurement_vendors, app_settings.contact_phone, detention_visitor_log, permits.host_phone, visa_applications.host_phone, visa_extensions.host_phone.

Detainee/next-of-kin foreign numbers are intentionally NOT Ghana-restricted (detention_records.phone, next_of_kin_phone).
Tests: `src/test/ghana-phone.test.ts`.

## Contact forms (biodata) — Ghana-strict, international-tolerant

Front Desk / Processing applicants and detainees can be foreign nationals, so those
fields use the *contact* validator instead of the strict staff one:

- Client: `validateContactPhone` / `assertContactPhoneList` (`src/lib/ghana-phone.ts`),
  UI component `ContactPhoneInput`, and `<MultiContactInput mode="list" ghanaAware />`.
- Edge functions: `validateContactPhone` / `assertContactPhoneList` in `supabase/functions/_shared/ghana-phone.ts`.
- SQL: `gh_phone_is_foreign_dialled`, `gh_phone_contact_canonical`,
  `gh_phone_contact_canonical_list`, and the generic BEFORE INSERT/UPDATE trigger
  `gh_phone_guard_contact_columns(<col>, ...)`.

Rules: local or +233 numbers must pass the full Ghana check (10 digits, licensed
MTN/Telecel/AirtelTigo prefix, not fabricated); an explicit foreign dialling code is
accepted when it has 8–15 digits and is not a repeated/sequential pattern. Stored
canonically (`0XXXXXXXXX` for Ghana, `+<digits>` for foreign).

Trigger-guarded columns: `detention_records(phone, next_of_kin_phone)`,
`detention_bail_records(bailee_phone, surety_phone)`, `permits(phone)`,
`visa_applications(phone)`, `visa_extensions(phone)`, `passport_applications(phone)`,
`official_applications(phone)`, `enquiry_applications(phone)` — plus the existing
strict guards on `profiles`, `profile_contacts`, host phones, suppliers, vendors,
visitor log and `app_settings.contact_phone`.

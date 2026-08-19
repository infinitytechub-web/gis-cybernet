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

---
name: Applicant Category (ECOWAS / Non-ECOWAS)
description: Auto-classified ECOWAS vs Non-ECOWAS column on visa_applications, visa_extensions, permits + Processing UI sub-tabs and GIS standard fields
type: feature
---
- DB column `applicant_category` ('ecowas'|'non_ecowas') on `visa_applications`, `visa_extensions`, `permits`.
- BEFORE INSERT/UPDATE trigger `set_applicant_category` auto-derives from `nationality` via `is_ecowas_country()` (covers 15 ECOWAS states + common demonyms: Ghanaian, Nigerian, Ivorian, Beninese, Togolese, Senegalese, Malian, Nigerien, etc.).
- GIS standard fields added:
  - visa_applications: visa_class, duration_of_stay_days, letter_of_invitation, biometrics_captured, ecowas_id_number, yellow_fever_cert
  - visa_extensions: extension_duration_days, ecowas_id_number, biometrics_captured
  - permits: ecowas_id_number, biometrics_captured, yellow_fever_cert, police_clearance, medical_clearance
- UI: `src/components/processing/CategoryTabs.tsx` reusable All / ECOWAS / Non-ECOWAS sub-tabs with counts; rendered at top of ProcessingVisaApplications, ProcessingVisaExtensions, ProcessingPermits. ECOWAS-only fields (ecowas_id_number) conditionally rendered in review dialogs.
- "New Visa Application" dialog in `src/pages/Processing.tsx` uses CountryCombobox; live derived category badge shown next to dialog title.

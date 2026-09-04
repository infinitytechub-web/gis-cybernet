# Personnel Bio-Data & Service Record Form

Rebuild the Add/Edit staff form on Staff / Employees into the full Personnel Bio-Data & Service Record form, section A to L, in the exact order given. Everything already working (photo upload, Staff ID, status, names, gender, Ghana Card with format check, Ghana phone validation and extra contacts, rank, department, command posting, category and intake, blood group, marital status, date of birth with age, date joined service, unit, shift group, appointment and portfolios, weapon training, audit trail, permissions) is kept as-is and simply moved into its correct section — nothing is duplicated or removed.

## What the user will see

The form opens as a sectioned record with lettered headings and a section switcher, so long sections stay readable on phone, tablet and desktop:

```text
A Form administration     G Previous employment
B Personal identification H Family & dependants
C Residential & contact   I Bank / salary (restricted)
D Physical & personal     J Service / transfer history
E Medical & welfare       K Staff declaration
F Education               L Command / HR verification
```

New in each section (only the missing items):

- **A** Date of completion, Service/Organization, Sector/Command, Station/Unit, IS/No.
- **B** Other name(s), place of birth, hometown, region of origin (searchable select of Ghana regions), date of appointment, cadet intake and recruit intake shown separately. Surname/First name keep their current labels' meaning.
- **C** Current place of stay, residential address, digital address, postal address, residential telephone, Mobile No. 1 / Mobile No. 2 (from the existing contacts feature), email.
- **D** Height (cm), uniform size (S–XXL), shoe size, religion, three hobby/interest lines, three special-skill lines.
- **E** Medical condition(s)/allergies and welfare notes — visible and editable only to authorised personnel; hidden for everyone else with a clear notice.
- **F** Schools/institutions table: name & location, from, to, qualification — add, edit, remove rows.
- **G** Employment history table: employer, position, from, to, reason for leaving; plus last position held and reason for leaving previous workplace.
- **H** Spouse (name, telephone, address), next of kin (name, relationship, telephone, address), number of children, father and mother with telephones, and an emergency contacts table (name, relationship, telephone, address).
- **I** Bank name, branch, account number — restricted to Finance/HR authorised personnel, account number masked for others.
- **J** Read-only roll-up of the existing posting/transfer history (from station/command and region, to station/command and region, effective date) with a link to the postings screen, so nothing is entered twice.
- **K** Staff declaration text with staff name, Staff ID/IS No., signature capture and date, saved with who signed and when.
- **L** Checked by / Verified by / Approved by rows with name, rank/position, signature and date, each stamped with the acting user.

Dates use DD/MM/YYYY, phone numbers use the existing Ghana validation, and required fields are validated before saving with inline messages.

### Admin-only configuration

Under Admin Console a new **Bio-Data Form Setup** panel, visible only to Admin/Super Admin, allows:

- Managing dropdown option lists used by the form (regions of origin, religions, uniform sizes, relationships, banks, qualifications, reasons for leaving) — add, rename, reorder, deactivate.
- Adding extra fields to any section (label, type: text/number/date/select/yes-no, required flag) and extra repeating tables with their own columns, which then appear in the form for everyone.
- Removing/hiding fields and tables the command does not use.

Non-admins can fill the form but cannot change its structure.

## Technical outline

Database (one migration, with GRANTs, RLS and update triggers):

- New `profiles` columns: `other_names`, `place_of_birth`, `hometown`, `region_of_origin`, `is_number`, `date_of_appointment`, `cadet_intake`, `recruit_intake`, `current_place_of_stay`, `residential_address`, `digital_address`, `postal_address`, `residential_phone`, `height_cm`, `uniform_size`, `shoe_size`, `religion`, `hobbies` (text[]), `special_skills` (text[]), `service_organization`, `sector_command`, `station_unit`, `form_completed_on`, `number_of_children`.
- New tables: `staff_education`, `staff_employment_history`, `staff_family_details` (spouse/NOK/parents, one row per profile), `staff_emergency_contacts`, `staff_bank_details`, `staff_medical_welfare`, `staff_biodata_verifications` (declaration + checked/verified/approved rows).
- Restricted tables (`staff_bank_details`, `staff_medical_welfare`): read/write only for the owner where appropriate plus admin/command-tier and the relevant capability, following the existing `can_access_staff_profile` / capability-grant pattern; every read logged through the existing sensitive-access log pattern.
- Config tables: `biodata_option_sets` + `biodata_options`, `biodata_custom_fields`, `biodata_custom_tables` + `biodata_custom_columns`, with values stored in `biodata_custom_values`. Write policies limited to `admin`; read for authenticated.
- Section J reads existing `postings_transfers`; region names come from existing `ghana_regional_capitals`/`ghana_districts`.

Frontend:

- New `src/components/staff/biodata/` with one component per section plus `BioDataForm.tsx` orchestrating state, validation (zod) and save; `src/pages/Staff.tsx` dialog swapped to render it, keeping the existing save mutation path and audit logging and extending it for the new tables.
- Repeating-row editor component shared by education, employment, emergency contacts and admin-defined tables.
- Searchable select built on the existing combobox pattern for region, bank and other long lists.
- Admin panel component `BioDataFormSetup.tsx` mounted in Admin Console.
- Existing exports and the staff table keep working; new fields become available to Staff Profile view where sections already exist.

Verification: create and edit a real staff record filling every section, confirm rows land in each table, confirm a non-authorised user cannot see medical or bank data, confirm admin-added options and custom fields appear, and check the form on mobile and tablet widths.

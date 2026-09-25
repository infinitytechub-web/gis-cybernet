# Staff Bio-Data Form Reliability and Approved Email Contacts

## What will change

- Keep the Personnel Bio-Data & Service Record as the standard responsive web form; PDF remains an export/print format only.
- Verify both **Add Staff** and **Edit Staff** load every section (A–M), including related records, restricted-section notices, KYC, dependants, sign-offs, and custom fields.
- Prevent partial or failed related-data requests from leaving the form in an endless loading state; show a clear retryable error while preserving the fields that did load.
- Improve the dialog layout so its header, section navigation, content, and save controls remain reachable on desktop, tablet, and phone, including short-height computer screens.
- Preserve field editability and keyboard/screen-reader access, while retaining role-based disabled and restricted fields.
- Keep heavy document-generation libraries lazy-loaded only when PDF, Word, Excel, or CSV is selected.

## Approved outside email contacts

- Reuse the existing external contact directory rather than create a second competing address book.
- Add an approval state and approval audit details to outside contacts.
- Only system administrators can approve, revoke, or delete outside contacts; authorized command users can propose contacts.
- Email recipient pickers show registered staff plus approved outside contacts, clearly labelled as external.
- The email service independently enforces the same rule: registered staff addresses and approved active outside contacts only. Typing or manipulating an unapproved address remains blocked.
- Existing distribution lists cannot bypass approval; each recipient is checked again when an email is sent.

## Verification

- Test Add Staff and Edit Staff with a real authorized account at desktop, tablet, and phone widths.
- Visit every form section, confirm inputs remain visible/editable, repeating rows work, restricted sections behave correctly, and the save bar remains reachable.
- Confirm PDF, Word, Excel, and CSV controls remain available according to permissions.
- Test approved and unapproved outside recipients against the email service, including a direct manipulated request.
- Run focused tests and confirm the preview build is clean.

## Technical details

- Update the existing form provider to settle all related-data loading safely and expose load errors without discarding successful responses.
- Refine the existing dialog constraints and section navigation; no PDF viewer or duplicate form will be introduced.
- Extend `interlink_contacts` with approval metadata and server-enforced policies/RPCs, with explicit grants and audit logging.
- Update the shared recipient policy and email picker to use only approved contacts.

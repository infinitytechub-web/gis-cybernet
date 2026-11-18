# Function security rules

- Record email content and PDFs are generated server-side from exact caller-RLS records; recipients retain staff/approved-contact checks and arbitrary attachments are rejected — why: the organizational sender must not relay caller-written messages or files.
- Client profile notices identify a recorded review by request ID; server derives recipient, outcome and fixed details link and requires the recorded reviewer — why: role membership cannot authorize invented transactional notices.
- Staff-ID email resolution requires verified password proof; public passkey options are account-independent and credential-to-account binding occurs after signature verification — why: preserve sign-in without disclosing account emails or passkey enrollment.

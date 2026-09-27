# Architecture rules

- Keep personnel bio-data editing in the responsive web form; load related record sections separately and block saves after incomplete loads, so a failed fetch cannot overwrite existing details.
- Check record-email recipients on the server against staff addresses or administrator-approved external contacts on every send, including CC, BCC, bulk and saved lists; client pickers are convenience only.
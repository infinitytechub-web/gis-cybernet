# Attendance reporting
- Attendance reports read all pages of the invoker-scoped `attendance_report_rows` RPC, exclude deleted personnel and aggregate the full filtered dataset before display pagination; hours use complete nonnegative clock pairs and command groups use current postings — why: no duplicate registers, truncated totals, invented clock-outs or historical posting guesses.
# Armory integration
- Armory registers use command-scoped RPC writes, independently approved custody/stock changes and immutable events; documents reuse categorized Command Vault storage, while real personnel stay in existing profiles — why: preserve one identity and file-security boundary without demo authentication or duplicate staff.

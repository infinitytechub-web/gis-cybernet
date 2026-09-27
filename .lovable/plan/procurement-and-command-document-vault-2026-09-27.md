# Procurement and Command Document Vault

## Outcome
- Make Procurement practical on desktop, tablet, and mobile with unobstructed layouts, searchable lists, type-to-search selectors, 25-item paging, horizontal table movement, and page top/bottom controls.
- Convert Command Vault into a command-scoped secure document workspace with controlled upload, view, download, edit, archive, and audit history.

## Implementation
1. **Procurement usability**
   - Add a shared searchable/paged table wrapper to Procurement lists where records may exceed 25.
   - Add search and status/vendor/type filters to requisitions, RFQs, purchase orders, invoices, contracts, vendors, documents, stock, and report detail lists.
   - Replace long fixed option lists with searchable pickers where users select vendors, orders, or linked records.
   - Add clear horizontal scroll affordances to wide tables and page-level smooth Scroll to Top/Bottom controls.
   - Stack headers, actions, filters, form fields, charts, and dialogs safely at phone/tablet widths.

2. **Command Vault security model**
   - Add a required command ownership field, archive state, and immutable vault audit table.
   - Add server-side authorization helpers and row policies: Super Admin can operate service-wide; Regional Commander, OIC, 2IC, and Staff Officer can operate only within their assigned command reach and only when their role/module grant permits it.
   - Bind stored objects to command-specific paths and enforce the same command checks for storage access.
   - Preserve existing records by assigning their command from their linked officer/uploader where determinable, while preventing unscoped access.

3. **Vault interface and auditing**
   - Add command selection for Super Admin/authorized regional users and fixed assigned-command context for command officers.
   - Add search, category/status filters, 25-item paging, searchable officer selection, and responsive table/card presentation.
   - Replace destructive removal with archive; keep permanent purge outside the normal vault workflow.
   - Log upload, preview/view, download, metadata change, archive, and restore events with actor, command, file, timestamp, and safe context.
   - Add a permission-scoped activity view so authorized users can review their command’s sensitive access trail.

4. **Verification**
   - Test Procurement and Vault at phone, tablet, and desktop sizes, including menus, dialogs, charts, filters, tables, horizontal navigation, and top/bottom controls.
   - Run component/unit regression tests and the production build checks.
   - Exercise authorized and denied API cases for same-command, other-command, unauthorized Staff Officer, Regional Commander, and Super Admin access.
   - Exercise upload, preview, download, edit, archive, restore, realtime refresh, and audit readback with a real authorized account when available.

## Technical details
- Reuse the existing central module grants and command hierarchy helpers rather than adding client-only role checks.
- Use additive database changes, explicit authenticated/service grants, RLS, security-definer authorization helpers, immutable audit triggers/functions, and private storage policies.
- Keep file limits and accepted document types explicit, validate metadata client-side and server-side, and never expose private object URLs permanently.

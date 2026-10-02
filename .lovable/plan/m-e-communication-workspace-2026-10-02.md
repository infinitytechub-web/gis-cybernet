# M&E Communication Workspace

A secure messaging hub inside Monitoring & Evaluation, at **M&E → Communications** (`/me/communications`).

## What users get

**Dashboard cards at the top, updated automatically:**
- Messages sent (today / 7 days)
- Delivered vs. read rate
- Unread messages in my inbox
- Attachments scanned, with any blocked count
- Messages by audience (individual / department / command), shown as a small chart

**Compose (authorized administrators only)**
- Pick an audience: **one staff member**, **a department**, or **a command**. Each picker is searchable and type-to-search.
- Subject, message, and priority (Normal / Important / Urgent)
- Secure attachments, up to 5 files of 10 MB each. Every file is virus-scanned by the existing firewall before upload. Blocked files are refused, and the refusal is logged.
- Before sending, a preview shows how many people will receive the message.

**Inbox (every signed-in officer)**
- Lists messages sent to them, either directly or through their department or command.
- Unread messages are highlighted. Opening a message marks it read.
- Attachments download through short-lived secure links. Each download is logged.
- Recipients can reply inside the conversation thread.

**Sent / Tracking (senders and administrators)**
- Each message shows per-recipient status (Queued → Delivered → Read) with DD/MM/YYYY timestamps.
- Includes filters, search and 25-per-page pagination.
- Opening a sent message shows the full recipient list and its status.

**Live updates:** New messages, read receipts and card figures refresh in real time.

## Who can do what
- **Send to an individual:** Admin, OIC, 2IC, Head of Administration, Chief Staff Officer, Command Officer, M&E Officer and Project Manager.
- **Send to a department or command:** the same roles, but only for commands within their own command scope. A Super Admin can send to any command.
- Staff Officers can send only to their assigned command, and only if a Super Admin grants them the communications module.
- **Everyone else:** read their inbox and reply only.
- These rules apply on the server as well as in the app, so they can't be bypassed.

## Audit
Every send, read, reply, attachment upload, download, scan block and permission denial is written to an audit log that can't be changed. That log appears under M&E Audit, and its Purge button follows the existing purge rules.

## Technical details
- Tables:
  - `me_messages`: sender, audience type and target, subject, body, priority, thread parent, org unit
  - `me_message_recipients`: message and recipient profile, plus delivered and read timestamps
  - `me_message_attachments`: storage path, sha256 and scan verdict
  - `me_message_audit`: immutable through a trigger and added to the purge allowlist
  - Every table gets its required GRANTs and RLS: senders see their own sent messages, recipients see their own recipient rows, and admins see everything. Staff Officers are also bound by the restrictive command scope.
- Sending goes through a `me_send_message` security-definer function. It:
  - checks the sender's role
  - checks the sender's command scope with `can_manage_org_unit` / `has_org_access`
  - expands the department or command (including sub-units) into active, non-deleted profiles
  - inserts the recipient rows as delivered
  - writes the audit record
  - All of this happens in one transaction.
- Other functions:
  - `me_mark_read`: marks a message read
  - `me_message_stats`: provides the card figures, scoped to the caller
- Attachments go to the private `secure-uploads` bucket through `uploadSecureFile`, then get linked to the message. Download links come from the server after it confirms the caller is the sender or a recipient.
- Real-time updates come from publishing `me_message_recipients` and `me_messages`, with React Query invalidation.
- New component: `src/components/me/CommunicationsWorkspace.tsx` (cards, Compose, Inbox, Sent). The route and module key `me-communications` are added to the M&E routes and the RBAC map.
- Tests:
  - RBAC unit tests for who can send
  - a database check that a Staff Officer can't target another command
  - a build/typecheck run

## Out of scope
- Email or SMS delivery. Messages appear only inside the app.
- Editing or deleting a message after it's sent, which keeps the record intact.

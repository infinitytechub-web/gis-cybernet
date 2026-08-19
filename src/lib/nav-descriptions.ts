/**
 * Plain-language descriptions of what each navigation destination does.
 * Surfaced as hover tooltips in the sidebar so staff can tell menus and
 * submenus apart without opening them. Keyed by route path.
 */
export const NAV_DESCRIPTIONS: Record<string, string> = {
  "/": "Daily overview: occurrences, queues and key figures at a glance.",
  "/command-console": "Live alerts, incidents, patrols, fuel and readiness for your command.",
  "/analytics": "Charts and trends across attendance, staffing and operations.",
  "/reports": "Submit, review and download official unit reports.",

  "/staff": "Staff records: create, edit and manage employee profiles.",
  "/directory": "Searchable contact directory of all personnel.",
  "/departments": "Departments and unit structure with assigned staff counts.",
  "/roles": "Ranks, roles and designations used across the system.",

  "/my-shift": "Track your own shift, clock status and rotation.",
  "/in-cab": "Two-way messaging with patrol crews and vehicles.",
  "/attendance": "Daily attendance marks, late/absent tracking and corrections.",
  "/shifts": "Office shift definitions and working windows.",
  "/roster": "Build and publish the duty roster by shift group.",
  "/guard-schedule": "Guard duty schedule builder with export and publishing.",
  "/leave": "Apply for leave or pass and follow approval progress.",
  "/holidays": "Public and station holidays used in scheduling.",
  "/postings": "Raise and approve postings, transfers and reassignments.",
  "/postings/history": "Full history of past postings and transfers.",
  "/appraisals": "Staff performance appraisals and scoring.",
  "/staff-approvals": "Approve or decline staff requests routed to you.",

  "/front-desk": "Visa, passport and permit intake at the front counter.",
  "/processing": "Pre-front-desk vetting and processing of applications.",

  "/operations": "Planned operations, deployments and outcomes.",
  "/holding": "Detainee intake, custody records, bail and releases.",
  "/enforcement": "Enforcement actions, arrests and field reporting.",
  "/ipse": "Immigration Police Support & Enforcement casework.",
  "/misd": "MISD / CYBER investigations, incidents and threat intel.",
  "/compliance": "Document expiry, certifications and equipment compliance.",

  "/health-lab": "Medical records, appointments and health inventory.",

  "/my-profile": "View and request changes to your own profile.",
  "/my-portal": "Your personal inbox of requests, files and notices.",
  "/excuse-duty": "Submit an excuse duty (sick leave) form.",
  "/excuse-duty/mine": "Your submitted excuse duty forms and their status.",

  "/stores": "Stores and inventory: stock, issuance and audits.",
  "/unit-dashboard": "Readiness, strength and activity for your unit only.",
  "/fleet": "Vehicle tracking, geofences, fuel, maintenance and alerts.",

  "/procurement": "Requisitions, quotes, purchase orders and budgets.",

  "/admin": "Administrator hub for system-wide configuration.",
  "/announcements": "Publish notices to the whole command or a department.",
  "/roster/import": "Import a duty roster spreadsheet with preview before commit.",
  "/guard-schedule/import": "Import a guard schedule file and match staff.",
  "/staff-approvals/pending": "Approve, merge or delete pending staff records.",
  "/staff-approvals/accounts": "Approve new staff login accounts.",
  "/staff-approvals/profile-changes": "Review requested edits to staff profiles.",
  "/shift-rotation-approvals": "Approve proposed shift rotation changes.",
  "/command-roles": "Grant or revoke command-tier authority.",
  "/admin/sessions": "Active sessions, lockouts and forced sign-outs.",
  "/org-structure": "Command hierarchy and key appointments.",
  "/admin-access-matrix": "Fine-tune which roles can reach each module.",
  "/command-role-audit": "Audit trail of command role grants and removals.",
  "/role-assignments": "Assign system roles to individual staff.",
  "/staff-mapping-import": "Bulk import staff and map them to units.",
  "/audit-log": "System-wide audit trail of sensitive actions.",
  "/rum-analytics": "Real-user performance and error monitoring.",
  "/branding": "Customize names, logos, colours, login screen and emails.",
  "/settings": "System settings, security policies and thresholds.",
  "/shift-window-audit": "Changes to attendance windows and shift rules.",
  "/sensitive-access-log": "Who read sensitive records, and when.",
  "/ip-blocks": "Blocked IP addresses and devices.",
  "/attendance/connections": "Third-party attendance platform integrations.",

  "/command-vault": "Confidential files restricted to command tier.",
  "/command-vault/gps": "GPS hub for tracked routes and map access.",
  "/interlink": "Dispatch, schedule and audit inter-agency correspondence.",
  "/commands": "Confidentiality commands and their assigned officers.",
  "/recycle-bin": "Recover or permanently remove deleted records.",
  "/settings?area=security": "Authentication, MFA, lockouts, firewall and security audit settings.",
  "/settings?area=system": "Organization info, branding, integrations, backup and maintenance.",

  // Parent (click-to-expand) menu labels.
  "My Duty": "Your own shift tracking and in-cab console.",
  "Attendance & Shifts": "Daily attendance marks and office shift windows.",
  "Rosters & Schedules": "Duty roster and guard schedule builders.",
  "Leave & Holidays": "Leave and pass requests plus the holiday calendar.",
  "Postings & Transfers": "Raise postings and transfers, and review their history.",
  "Appraisals & Approvals": "Performance appraisals and requests awaiting your decision.",
  Approvals: "Staff, account, profile and rotation requests awaiting a decision.",
  "Access & Roles": "Roles, command authority, access matrix and sessions.",
  "Security & Audit": "Audit trails, sensitive access and network blocks.",
  "Data & Imports": "Bulk imports and system performance monitoring.",
  Configuration: "Announcements, branding, security and system settings.",
};

/** Description for a route path or parent menu label, or undefined when none is defined. */
export function navDescription(url: string): string | undefined {
  return NAV_DESCRIPTIONS[url];
}

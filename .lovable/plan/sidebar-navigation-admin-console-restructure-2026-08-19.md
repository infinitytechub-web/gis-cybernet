# Sidebar Navigation & Admin Console Restructure

Reorganize navigation and administrative settings around existing features only. No business logic, workflows, database rules, or route-level permissions change — this is structure, grouping and visibility.

## 1. Collapsible sidebar groups

Today the sidebar renders every group as a flat, always-open list. Some groups are long (Workforce Operations has 11 entries; Administration has 20+ for admins), which forces heavy scrolling.

Changes:
- Any group with more than four permitted items becomes a click-to-expand accordion header; groups with four or fewer stay flat as they are now.
- Clicking a parent toggles it; only that group's children render when open.
- The group containing the current route opens automatically, and open/closed state persists across navigation and page reloads (stored per user in local storage), so menu position is preserved.
- Long groups get split into smaller, clearly labelled parents so no group is a wall of links:
  - Workforce Operations -> My Duty (my shift tracker, in-cab, my forms), Attendance & Shifts, Rosters & Schedules, Leave & Postings, Appraisals.
  - Administration -> Approvals, Access & Roles, Security & Audit, Data & Imports, Configuration.
- Item counts show on collapsed parents where a pending badge exists (Front Desk / Processing), so notifications stay visible without expanding.
- Icon-collapsed sidebar keeps working: parents show their icon with a flyout of children on hover/click, and the existing hover indicator plus description tooltips are kept.
- Keyboard and screen-reader support: parents are real buttons with `aria-expanded` and `aria-controls`, Enter/Space toggles, focus rings unchanged.
- Mobile/tablet: same accordion inside the existing off-canvas sheet; only one long group needs to be open at a time, cutting scroll height substantially.

## 2. Admin Console sections

The console keeps its card-hub format but is regrouped into the two requested top-level areas, each with sub-sections, mapped only to surfaces that exist:

**Security Settings**
- Authentication & passwords, MFA/2FA and MFA recovery
- RBAC: roles, role assignments, command roles & grants, permission overrides, access matrix
- User access & permissions approvals (pending staff, accounts, profile changes)
- Session management, login and account-lockout policy, locked accounts, login audit
- Device & login monitoring, presence log, IP blocks & firewall, firewall alerts
- Audit logs: system audit trail, command role audit, sensitive access log, security audit
- Data protection: retention policy, HRM export DLP, recycle bin
- File & upload security, quarantine inbox, security incident monitoring, security updates

**System Settings**
- Organization & system information
- Branding & customization (incl. login screen and email branding)
- General application settings
- Notification settings and email configuration/test
- Integration/API settings (shift connections and connection permissions)
- Data import/export (roster import, guard PDF import, staff mapping import)
- Backup & maintenance (system backup)

Items requested but with no existing functionality — currency/regional settings, payment configuration, version/update management — are left out rather than shown as empty shells.

## 3. Settings page split

`/settings` today is a single strip of 26 tabs. It becomes two grouped areas reached from the Admin Console:
- Security Settings area: roles, permissions, lockouts, locked accounts, login audit, presence, 2FA, MFA recovery, firewall, firewall alerts, security audit, HRM export DLP, security updates, recycle bin.
- System Settings area: app settings, branding, interlink branding, portfolios, accounts, shift connections, shift connection permissions, shift rotation, system info, system backup, email test.

Both keep the exact same tab components and behaviour; only the grouping and entry point change. Existing `/settings` URLs and deep links keep working by redirecting to the right area and tab.

## 4. Access control

- Visibility keeps using the existing central RBAC registry, so a card or menu entry only renders when the account can actually reach that route. Nothing new is exposed.
- Segregation of duties is reflected in the layout: audit and monitoring surfaces sit apart from the configuration surfaces that they audit, and admin-only entries stay flagged as such.
- Backend enforcement is untouched — route guards, row-level policies and privileged function permissions remain the authority; the UI grouping is presentation only. A short note is added to the console explaining that the structure follows recognized information-security grouping principles without asserting certification.

## Technical notes

- `src/components/AppSidebar.tsx`: introduce a nested nav model (`{ label, items | children }`), render collapsible parents with the existing `Collapsible` primitive and `SidebarMenuSub`, persist open state, auto-open the active branch. RBAC filtering (`canPath`) applies before deciding whether a group exceeds four items.
- `src/lib/nav-descriptions.ts`: add descriptions for the new parent labels so tooltips stay informative.
- `src/pages/AdminConsole.tsx`: replace the flat `SECTIONS` array with two top-level areas each holding sub-sections; keep the tier badges and `visible()` filter.
- `src/pages/Settings.tsx`: split the tab list into two grouped tab sets driven by a query param (`?area=security|system`), preserving every existing tab component and adding a redirect for legacy tab values.
- Add tests: sidebar grouping/expansion behaviour and an RBAC assertion that no console card or menu item appears for a role lacking route access.

# Side Menu Reorganisation

## Goal
A clean, top-to-bottom menu with 5 sections, clear names, only the items each person may open, and no tooltips spilling off phone screens.

## New layout (top to bottom)
```text
1. My Work            Overview, My Dashboard, My Letters & Documents,
                      My Duty (Shift Roster, In-Cab Console),
                      Pay & Loans, Staff Vault, Excuse Duty (my submissions)
2. Command            Command Console, Command Dashboard, Analytics, Reports,
                      Command Workspace, Command Analytics, Departments, Roles,
                      Confidentiality Commands, Command Vault
3. Human Resource     (unchanged sub-menus: Staff Records, Attendance & Shifts,
                      Rosters, Leave, Excuse Duty, Postings, Appraisals, HR Reports)
4. Operations         Immigration (Front Desk, Processing), Operational Security,
                      Logistics, Procurement, Clinic, M&E (all four sub-menus)
5. Administration     (unchanged sub-menus)
```
- "Pay & Loans", "Secure Workspace", "Immigration & Enforcement", "M&E" and "People & Organization" stop being separate sections and become sub-menus inside the groups above.

## Clearer names
- "Dashboard" becomes "Overview".
- "My Portal" becomes "My Letters & Documents".
- Remove the duplicate link that points to the same page twice; "My Duty" keeps only personal shift items so it no longer overlaps Attendance & Shifts.

## Access by role
- Plain Staff accounts see only My Work (plus any module a Super Admin has granted them).
- Command, Human Resource management, Operations and Administration appear only for roles allowed to open them. First step: sign in as a Staff account and list which visible items should not be there, then correct the page permission list those items use. Page-level security already on the server is not changed.

## Phone tooltips
- Turn off hover descriptions on touch screens and narrow widths; on desktop keep them, limited to the screen width so text never cuts off.

## Technical details
- Edit `src/components/AppSidebar.tsx` group arrays and `renderGroup` calls; rename labels in `src/lib/rbac.ts` and `src/lib/nav-descriptions.ts` (keep URLs, keys and routes unchanged so bookmarks work).
- Tooltip: skip `TooltipContent` when `useIsMobile()` or `(hover: none)`; add `collisionPadding` and `max-w-[min(16rem,calc(100vw-2rem))]`.
- Verify with Playwright at 375px and 1280px as Staff and Super Admin; add a small test that a Staff role's visible menu contains no Administration/HR-management paths.
- Stored open/closed state in localStorage uses group labels; old keys simply default closed.

---
name: Appointments & Portfolios
description: Staff appointment combobox mirrors 25 app_role labels; portfolios are many-to-many with admin CRUD tab
type: feature
---

- `profiles.current_appointment` (text) — mirrors a value from public.app_role; set via combobox in Staff form. Does NOT grant the role; grants are still done via Role Management.
- `portfolios` (id, name, description) — admin-managed catalog. Seeded with 9 initial entries.
- `profile_portfolios` (profile_id, portfolio_id) — many-to-many join. Command tier (admin/oic/2ic/staff_officer/supervisor) can assign; only admin can create new portfolios.
- UI: `src/components/staff/AppointmentAndPortfolios.tsx` used inside `src/pages/Staff.tsx`. Admin CRUD at Settings → Portfolios tab (`src/components/settings/PortfoliosTab.tsx`).
- Keep `APPOINTMENT_ROLES` (AppointmentAndPortfolios.tsx) and `KNOWN_ROLES` (RoleAssignmentsAdmin.tsx) in sync whenever app_role enum changes.

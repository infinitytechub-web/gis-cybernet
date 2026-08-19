---
name: Roster clock-in/out
description: roster_clock_action RPC + Clock in/out column on the staff roster with late/early alerts
type: feature
---
Staff roster (Command Console / Unit Dashboard) has a "Clock in / out" column.
- RPC `roster_clock_action(_profile_id, _action, _notes)` (SECURITY DEFINER, authenticated) does all authorisation and status logic: allowed for self, admin, oic, 2ic, staff_officer, or `is_supervisor_for_profile`.
- Expected window comes from the officer's current `shift_assignments` → `shifts.start_time/end_time` plus `get_effective_attendance_window(shift_id)` (grace, early check-in, late check-out).
- Clock-in past start+grace marks attendance `late` and returns a late alert; clock-out before shift end returns an early-departure alert. Returned `severity` drives success vs warning toast in `useRosterClock`.

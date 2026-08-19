/**
 * STAFF ROSTER — one query that assembles the operational roster used by the
 * Command Console and the Unit Dashboard: who is posted where, what roles they
 * hold, how to reach them, their photo, and how many patrols they have led.
 *
 * Role rows live in `user_roles` keyed by the auth user id, which maps to
 * `profiles.user_id` (NOT `profiles.id`) — the roster resolves that for callers.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrl } from "@/lib/photo-utils";
import { yearsOfService, timeUntilRetirement } from "@/lib/postings-analytics";
import type { AppRole } from "@/lib/types";

export interface RosterMember {
  id: string;                 // profiles.id
  user_id: string | null;     // auth user id (role key)
  staff_id: string | null;
  full_name: string;
  rank: string | null;
  department: string | null;
  org_unit_id: string | null;
  branch: string | null;      // org unit name
  unit: string | null;        // free-text posting
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  photo_signed_url: string | null;
  status: string | null;
  roles: AppRole[];
  patrols_led: number;
  /** Today's attendance status (present/late/absent/excused) or null if unmarked. */
  attendance_today: string | null;
  attendance_check_in: string | null;
  /** Today's clock-out time, null while the officer is still on duty. */
  attendance_check_out: string | null;
  /** Days marked present or late in the last 30 days, and days recorded. */
  attendance_present_30d: number;
  attendance_days_30d: number;
  /* ── Service (tenure) ─────────────────────────────────────────────────── */
  /** Date the officer joined the service (ISO date) or null if unrecorded. */
  date_joined_service: string | null;
  /** Full calendar years of service, 0 when unrecorded. */
  service_years: number;
  /** Residual months after the full years. */
  service_months: number;
  /** Human label, e.g. "10y 4m" or null when unrecorded. */
  service_label: string | null;
  /** Whole years until retirement (dob + retirement age); null when unknown. */
  years_to_retirement: number | null;
  /** True once past the retirement date. */
  retired: boolean;
}

/** Format a tenure as "10y 4m" (or "4m" / "—"). */
export function formatService(years: number, months: number): string {
  if (years <= 0 && months <= 0) return "—";
  if (years <= 0) return `${months}m`;
  return months > 0 ? `${years}y ${months}m` : `${years}y`;
}


/** Roles that can be designated from the roster (operational + command tier). */
export const ROSTER_ASSIGNABLE_ROLES: AppRole[] = [
  "oic",
  "2ic",
  "chief_staff_officer",
  "head_of_administration",
  "staff_officer",
  "command_officer",
  "supervisor",
  "deputy_supervisor",
  "shift_leader",
  "front_desk",
  "storekeeper",
  "procurement_officer",
  "medical_officer",
  "special_duties",
  "staff",
];

/** Key appointments surfaced as filled / vacant tiles on the roster. */
export const KEY_APPOINTMENTS: AppRole[] = ["oic", "2ic", "storekeeper", "procurement_officer"];

export function useStaffRoster() {
  return useQuery({
    queryKey: ["staff-roster"],
    staleTime: 60_000,
    queryFn: async (): Promise<RosterMember[]> => {
      const today = new Date();
      const todayKey = today.toISOString().slice(0, 10);
      const windowStart = new Date(today.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);

      const [{ data: profiles, error }, { data: roleRows }, { data: patrolRows }, { data: attRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, user_id, staff_id, first_name, last_name, phone, email, photo_url, status, unit, org_unit_id, date_joined_service, date_of_birth, retirement_age, ranks(name, abbreviation), departments(name), org_units(name)",
          )
          .order("last_name")
          .limit(2000),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("patrol_logs").select("patrol_leader_id").limit(5000),
        supabase
          .from("attendances")
          .select("profile_id, date, status, check_in")
          .gte("date", windowStart)
          .lte("date", todayKey)
          .limit(20000),
      ]);
      if (error) throw error;

      const rolesByUser = new Map<string, AppRole[]>();
      for (const r of roleRows ?? []) {
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push(r.role as AppRole);
        rolesByUser.set(r.user_id, list);
      }

      const patrolsByLeader = new Map<string, number>();
      for (const p of patrolRows ?? []) {
        if (!p.patrol_leader_id) continue;
        patrolsByLeader.set(p.patrol_leader_id, (patrolsByLeader.get(p.patrol_leader_id) ?? 0) + 1);
      }

      // Attendance: today's mark plus a 30-day presence tally per profile.
      const attToday = new Map<string, { status: string | null; check_in: string | null }>();
      const attTally = new Map<string, { present: number; days: number }>();
      for (const a of attRows ?? []) {
        if (!a.profile_id) continue;
        const t = attTally.get(a.profile_id) ?? { present: 0, days: 0 };
        t.days += 1;
        if (a.status === "present" || a.status === "late") t.present += 1;
        attTally.set(a.profile_id, t);
        if (a.date === todayKey) {
          attToday.set(a.profile_id, { status: (a.status as string) ?? null, check_in: a.check_in ?? null });
        }
      }

      const rows: RosterMember[] = (profiles ?? []).map((p: any) => {
        const joined = p.date_joined_service ?? null;
        const tenure = yearsOfService(joined, today);
        const retirement = p.date_of_birth
          ? timeUntilRetirement(p.date_of_birth, p.retirement_age ?? 60, today)
          : null;
        return {
          id: p.id,
          user_id: p.user_id ?? null,
          staff_id: p.staff_id ?? null,
          full_name:
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.staff_id || "Unnamed",
          rank: p.ranks?.name ?? null,
          department: p.departments?.name ?? null,
          org_unit_id: p.org_unit_id ?? null,
          branch: p.org_units?.name ?? null,
          unit: p.unit ?? null,
          phone: p.phone ?? null,
          email: p.email ?? null,
          photo_url: p.photo_url ?? null,
          photo_signed_url: null,
          status: p.status ?? null,
          roles: (p.user_id ? rolesByUser.get(p.user_id) : undefined) ?? [],
          patrols_led: patrolsByLeader.get(p.id) ?? 0,
          attendance_today: attToday.get(p.id)?.status ?? null,
          attendance_check_in: attToday.get(p.id)?.check_in ?? null,
          attendance_present_30d: attTally.get(p.id)?.present ?? 0,
          attendance_days_30d: attTally.get(p.id)?.days ?? 0,
          date_joined_service: joined,
          service_years: tenure.years,
          service_months: tenure.months,
          service_label: joined ? formatService(tenure.years, tenure.months) : null,
          years_to_retirement: retirement ? (retirement.retired ? 0 : retirement.years) : null,
          retired: retirement?.retired ?? false,
        };
      });

      // Sign photos in parallel; failures degrade to initials.
      await Promise.all(
        rows.map(async (r) => {
          if (r.photo_url) {
            try {
              r.photo_signed_url = await getSignedPhotoUrl(r.photo_url);
            } catch {
              r.photo_signed_url = null;
            }
          }
        }),
      );

      return rows;
    },
  });
}

/** Grant a role to a staff member (idempotent — duplicates are ignored). */
export function useGrantRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id,role", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-roster"] });
      qc.invalidateQueries({ queryKey: ["command-roster"] });
    },
  });
}

/** Revoke a role from a staff member. */
export function useRevokeRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-roster"] });
      qc.invalidateQueries({ queryKey: ["command-roster"] });
    },
  });
}

/** Holders of each key appointment, for the vacancy tiles. */
export function useKeyAppointments(roster: RosterMember[]) {
  return useMemo(
    () =>
      KEY_APPOINTMENTS.map((role) => ({
        role,
        holders: roster.filter((r) => r.roles.includes(role)),
      })),
    [roster],
  );
}

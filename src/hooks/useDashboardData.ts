import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, subDays } from "date-fns";

/**
 * Dashboard data access, split by privilege so a lower-privileged role never
 * even issues the queries behind restricted widgets (least privilege applies to
 * the requests too, not just what is rendered).
 */

export const today = () => new Date().toISOString().split("T")[0];

/** Personal figures — safe for every authenticated user. */
export function usePersonalDashboardData() {
  const { user } = useAuth();
  const day = today();

  const myLeave = useQuery({
    queryKey: ["dash", "my-leave", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, type, status, start_date, end_date")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const myAttendanceToday = useQuery({
    queryKey: ["dash", "my-attendance", user?.id, day],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendances")
        .select("id, status, check_in")
        .eq("date", day)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const holidays = useQuery({
    queryKey: ["dash", "holidays", day],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("name, date")
        .gte("date", day)
        .order("date")
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  return {
    myLeave: myLeave.data ?? [],
    myPendingLeave: (myLeave.data ?? []).filter((l) => l.status === "pending").length,
    myAttendanceToday: myAttendanceToday.data ?? null,
    holidays: holidays.data ?? [],
  };
}

/** Workforce oversight figures — command tier and above only. */
export function useOversightDashboardData(enabled: boolean) {
  const day = today();

  const counts = useQuery({
    queryKey: ["dash", "oversight-counts", day],
    enabled,
    queryFn: async () => {
      const [staff, active, attendance, leave, postings] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("attendances").select("*", { count: "exact", head: true }).eq("date", day),
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("postings_transfers").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      return {
        staffCount: staff.count ?? 0,
        activeStaff: active.count ?? 0,
        todayAttendance: attendance.count ?? 0,
        pendingLeave: leave.count ?? 0,
        pendingPostings: postings.count ?? 0,
      };
    },
  });

  const weeklyAttendance = useQuery({
    queryKey: ["dash", "weekly-attendance"],
    enabled,
    queryFn: async () => {
      const days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), 6 - i), "yyyy-MM-dd"));
      const { data, error } = await supabase
        .from("attendances")
        .select("date, status")
        .gte("date", days[0])
        .lte("date", days[6]);
      if (error) throw error;
      return days.map((d) => {
        const rows = (data || []).filter((a) => a.date === d);
        return {
          day: format(new Date(d), "EEE"),
          present: rows.filter((a) => a.status === "present").length,
          late: rows.filter((a) => a.status === "late").length,
          absent: rows.filter((a) => a.status === "absent").length,
        };
      });
    },
  });

  const deptDistribution = useQuery({
    queryKey: ["dash", "dept-distribution"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("department_id, departments(name)")
        .eq("status", "active");
      if (error) throw error;
      const counts: Record<string, { value: number; id: string }> = {};
      (data || []).forEach((p: any) => {
        const name = p.departments?.name || "Unassigned";
        const id = p.department_id || "unassigned";
        if (!counts[name]) counts[name] = { value: 0, id };
        counts[name].value += 1;
      });
      return Object.entries(counts)
        .map(([name, { value, id }]) => ({ name, value, id }))
        .sort((a, b) => b.value - a.value);
    },
  });

  const recentLeave = useQuery({
    queryKey: ["dash", "recent-leave"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, type, status, start_date, end_date, profiles(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const staffStatus = useQuery({
    queryKey: ["dash", "staff-status"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("status");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((p) => {
        counts[p.status] = (counts[p.status] || 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    },
  });

  return {
    counts: counts.data,
    weeklyAttendance: weeklyAttendance.data ?? [],
    deptDistribution: deptDistribution.data ?? [],
    recentLeave: recentLeave.data ?? [],
    staffStatus: staffStatus.data ?? [],
  };
}

/** System health & configuration integrity — administration tier only. */
export function useSystemHealthData(enabled: boolean) {
  const health = useQuery({
    queryKey: ["dash", "system-health"],
    enabled,
    queryFn: async () => {
      const [profilesRes, withAccountRes, deptsRes, ranksRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, user_id, department_id, rank_id, phone", { count: "exact" }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).not("user_id", "is", null),
        supabase.from("departments").select("id", { count: "exact", head: true }),
        supabase.from("ranks").select("id", { count: "exact", head: true }),
        supabase.from("user_roles").select("id", { count: "exact", head: true }),
      ]);

      const profiles = profilesRes.data || [];
      const totalProfiles = profilesRes.count ?? 0;
      const withAccounts = withAccountRes.count ?? 0;
      const missingDept = profiles.filter((p) => !p.department_id).length;
      const missingRank = profiles.filter((p) => !p.rank_id).length;
      const missingPhone = profiles.filter((p) => !p.phone).length;

      return {
        totalProfiles,
        withAccounts,
        loginCoverage: totalProfiles > 0 ? Math.round((withAccounts / totalProfiles) * 100) : 0,
        departments: deptsRes.count ?? 0,
        ranks: ranksRes.count ?? 0,
        roleAssignments: rolesRes.count ?? 0,
        missingDept,
        missingRank,
        missingPhone,
        dataCompleteness:
          totalProfiles > 0
            ? Math.round(((totalProfiles * 3 - missingDept - missingRank - missingPhone) / (totalProfiles * 3)) * 100)
            : 0,
      };
    },
  });

  const healthWidgetEnabled = useQuery({
    queryKey: ["dash", "health-widget-enabled"],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("enable_system_health_widget")
        .limit(1)
        .maybeSingle();
      return (data as any)?.enable_system_health_widget ?? true;
    },
  });

  return { systemHealth: health.data, healthWidgetEnabled: healthWidgetEnabled.data ?? true };
}

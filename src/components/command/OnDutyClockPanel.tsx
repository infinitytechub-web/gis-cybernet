import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useStaffRoster } from "@/hooks/useStaffRoster";
import { RosterClockInForm } from "@/components/command/RosterClockInForm";

/** Clock-in/out for Staff On Duty; reuses the roster's server-attributed clock action. */
export function OnDutyClockPanel() {
  const { user, isAdmin, isAdminOrSupervisor } = useAuth();
  const canOthers = Boolean(isAdmin || isAdminOrSupervisor);
  const { data: roster = [], isLoading } = useStaffRoster();
  const clockable = useMemo(() => roster.filter((r) => canOthers || (r.user_id && r.user_id === user?.id)), [roster, canOthers, user?.id]);
  const selfMember = useMemo(() => roster.find((r) => r.user_id && r.user_id === user?.id) ?? null, [roster, user?.id]);
  const summary = useMemo(() => {
    const active = roster.filter((r) => r.status === "active");
    const n = (s: string) => active.filter((r) => r.attendance_today === s).length;
    const present = n("present"), late = n("late"), marked = present + late + n("absent") + n("excused");
    return { strength: active.length, present, late, marked, rate: active.length ? Math.round(((present + late) / active.length) * 100) : null };
  }, [roster]);
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading clock-in…</p>;
  if (!clockable.length && !selfMember) return <p className="text-sm text-muted-foreground">You are not on a roster you can clock for.</p>;
  return <RosterClockInForm clockable={clockable} canClockOthers={canOthers} selfMember={selfMember} summary={summary} />;
}

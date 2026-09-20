/**
 * An officer's own leave standing for the current year.
 *
 * Reads `leave_due_overview()` with no unit: at 'self' scope the server returns
 * only the caller's own row, so nothing from other officers can appear here.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/date-format";

export interface MyLeaveRow {
  profile_id: string;
  full_name: string | null;
  unit_name: string | null;
  grade: string | null;
  entitlement: number;
  taken: number;
  remaining: number;
  last_leave_end: string | null;
  state: string;
}

export const LEAVE_STATE_BADGE: Record<string, { label: string; className: string }> = {
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800" },
  due: { label: "Due", className: "bg-amber-100 text-amber-800" },
  on_track: { label: "On track", className: "bg-sky-100 text-sky-800" },
  taken: { label: "Fully taken", className: "bg-emerald-100 text-emerald-800" },
};

/** The signed-in officer's own row from the scoped leave report. */
export function useMyLeaveStanding(profileId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["portal-my-leave-standing"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leave_due_overview", { _org_unit_id: null });
      if (error) throw error;
      return (data ?? []) as unknown as MyLeaveRow[];
    },
  });

  const mine = useMemo(
    () => query.data?.find((r) => r.profile_id === profileId) ?? null,
    [query.data, profileId],
  );

  return { ...query, mine };
}

export function MyLeaveStandingCard({ profileId }: { profileId: string | null | undefined }) {
  const { mine, isLoading } = useMyLeaveStanding(profileId);
  const state = mine ? LEAVE_STATE_BADGE[mine.state] ?? LEAVE_STATE_BADGE.on_track : null;
  const usedPct =
    mine && Number(mine.entitlement) > 0
      ? Math.min(100, Math.round((Number(mine.taken) / Number(mine.entitlement)) * 100))
      : 0;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">My leave standing ({new Date().getFullYear()})</CardTitle>
        <CardDescription>
          Working days only — weekends and public holidays are not counted against your leave.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your leave…
          </div>
        ) : !mine ? (
          <p className="text-sm text-muted-foreground">
            No leave entitlement is recorded for you yet. Ask your command to check your posting.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {state && <Badge className={state.className}>{state.label}</Badge>}
              {mine.grade && (
                <Badge variant="outline">{mine.grade === "senior" ? "Senior grade" : "Junior grade"}</Badge>
              )}
              {mine.unit_name && <Badge variant="secondary">{mine.unit_name}</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Entitlement", value: `${Number(mine.entitlement)} days` },
                { label: "Days taken", value: `${Number(mine.taken)} days` },
                { label: "Days remaining", value: `${Number(mine.remaining)} days` },
                {
                  label: "Last leave ended",
                  value: mine.last_leave_end ? formatDate(mine.last_leave_end) : "—",
                },
              ].map((t) => (
                <div key={t.label} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{t.label}</p>
                  <p className="text-sm font-semibold">{t.value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Progress value={usedPct} aria-label="Leave used" />
              <p className="text-xs text-muted-foreground">{usedPct}% of your leave used</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default MyLeaveStandingCard;

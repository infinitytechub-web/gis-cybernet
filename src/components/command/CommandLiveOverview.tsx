/**
 * Live overview of one command, for the commander's own command.
 *
 * The snapshot comes from `command_dashboard_live`, which resolves the signed-in
 * officer's posting and permission scope on the server — an out-of-scope unit id
 * returns nothing even if it is passed in. Refreshes every 30 seconds.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, ShieldAlert, Users, UserMinus, CheckCircle2, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface LiveData {
  allowed: boolean;
  reason?: string;
  unit?: { id: string; name: string | null; type: string | null } | null;
  totals?: {
    officers: number;
    active: number;
    positions: number;
    vacancies: number;
    authorised_strength?: number;
    posted_strength?: number;
    unfilled_appointments?: number;
    portal_reached: number;
  };
  officers?: { shift_group: string | null; status: string | null }[];
  ranks?: { rank: string; level: number | null; officers: number }[];
  vacancies?: { id: string; title: string | null; level: string | null; notes: string | null }[];
}

const DENIAL_TEXT: Record<string, string> = {
  no_profile: "Your account is not linked to a staff record yet.",
  not_authorized: "You have not been posted to a command, or viewing is switched off for your role.",
  no_command: "You have not been posted to a command yet.",
  out_of_scope: "That command is outside the scope allowed for your role.",
};

export function CommandLiveOverview({ unitId }: { unitId: string | null }) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["command-admin-live", unitId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("command_dashboard_live", { _org_unit_id: unitId });
      if (error) throw error;
      return (data ?? { allowed: false, reason: "not_authorized" }) as unknown as LiveData;
    },
  });

  const totals = data?.totals;
  const officers = data?.officers ?? [];

  const shifts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of officers) {
      const key = o.shift_group ?? "Unassigned";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [officers]);

  const authorised = Number(totals?.authorised_strength ?? totals?.positions ?? 0);
  const posted = Number(totals?.posted_strength ?? totals?.active ?? 0);
  const fillRate = authorised > 0 ? Math.min(100, Math.round((posted / authorised) * 100)) : 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your command…
        </CardContent>
      </Card>
    );
  }

  if (!data?.allowed) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 py-8 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" aria-hidden="true" />
          {DENIAL_TEXT[data?.reason ?? "not_authorized"] ?? "This command is not available to you."}
        </CardContent>
      </Card>
    );
  }

  const tiles = [
    { label: "Officers on strength", value: totals?.officers ?? 0, icon: Users },
    { label: "Currently active", value: totals?.active ?? 0, icon: CheckCircle2 },
    { label: "Vacancies", value: totals?.vacancies ?? 0, icon: UserMinus },
    { label: "Unfilled appointments", value: totals?.unfilled_appointments ?? 0, icon: Layers },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{data.unit?.name ?? "My command"}</CardTitle>
            <div className="flex items-center gap-2">
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
              </Button>
            </div>
          </div>
          <CardDescription>Live figures for your own command and its sub-units, refreshed every 30 seconds.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-md border p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <t.icon className="h-3.5 w-3.5" aria-hidden="true" /> {t.label}
                </div>
                <p className="mt-1 text-xl font-bold">{t.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Progress value={fillRate} aria-label="Strength filled" />
            <p className="text-xs text-muted-foreground">
              {posted} posted of {authorised} authorised ({fillRate}% filled)
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Shift groups</CardTitle>
            <CardDescription>How your officers are spread across the duty groups.</CardDescription>
          </CardHeader>
          <CardContent>
            {shifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No officers to group yet.</p>
            ) : (
              <ul className="space-y-2">
                {shifts.map(([group, count]) => (
                  <li key={group} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{group === "Unassigned" ? "Unassigned" : `Group ${group}`}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Ranks held</CardTitle>
            <CardDescription>Officers by rank, in order of seniority.</CardDescription>
          </CardHeader>
          <CardContent>
            {(data.ranks ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No ranks recorded for this command.</p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead className="text-right">Officers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.ranks ?? []).map((r) => (
                      <TableRow key={r.rank}>
                        <TableCell>{r.rank}</TableCell>
                        <TableCell className="text-right font-medium">{r.officers}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Unfilled appointments</CardTitle>
            <Badge variant="secondary">{(data.vacancies ?? []).length}</Badge>
          </div>
          <CardDescription>Named posts in your command with nobody in them.</CardDescription>
        </CardHeader>
        <CardContent>
          {(data.vacancies ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Every named appointment is filled.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[500px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Appointment</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.vacancies ?? []).map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.title ?? "—"}</TableCell>
                      <TableCell>{v.level ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{v.notes ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default CommandLiveOverview;

import { useEffect, useId, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, subDays } from "date-fns";
import { Users, ClipboardCheck, UserCheck, RefreshCw, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRbac } from "@/hooks/useRbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { attendanceTrend, pendingRepatriations } from "@/lib/command-operations-dashboard";


// Read every page of small, caller-scoped rows, never silently cap totals.
async function collect<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await read(offset, offset + 499);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

export function CommandOperationsDashboard() {
  const { user } = useAuth();
  const { can, holdingReadOnly } = useRbac();
  const detentionAccess = can("detention");
  const attendanceAccess = can("attendance-overview");
  const approvalAccess = detentionAccess && !holdingReadOnly;
  const days = "7";
  const to = format(new Date(), "yyyy-MM-dd");
  const from = format(subDays(new Date(), Number(days) - 1), "yyyy-MM-dd");
  const qc = useQueryClient();
  const id = useId();
  const counts = useQuery({
    queryKey: ["command-operations-dashboard", user?.id, "counts"],
    enabled: !!user && detentionAccess,
    refetchInterval: 60_000,
    queryFn: async () => {
      const total = await supabase.from("detention_records").select("id", { count: "exact", head: true }).is("deleted_at", null);
      if (total.error) throw total.error;
      const custody = await supabase.from("detention_records").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "in_custody");
      if (custody.error) throw custody.error;
      return { total: total.count ?? 0, custody: custody.count ?? 0 };
    },
  });
  const approvals = useQuery({
    queryKey: ["command-operations-dashboard", user?.id, "approvals"],
    enabled: !!user && approvalAccess,
    refetchInterval: 60_000,
    queryFn: async () => {
      const bail = await supabase.from("detention_bail_records").select("id,detention_records!inner(id)", { count: "exact", head: true })
        .is("deleted_at", null).is("detention_records.deleted_at", null).eq("authorization_status", "pending");
      if (bail.error) throw bail.error;
      const repatriations = await collect((start, end) => supabase.from("repatriation_details")
        .select("detention_id,detention_records!inner(id)").is("detention_records.deleted_at", null).is("detention_records.repatriated_at", null).order("id").range(start, end));
      const signatures = await collect((start, end) => supabase.from("approval_recommendations")
        .select("record_id,tier,decision").eq("workflow", "repatriation").order("id").range(start, end));
      return { bail: bail.count ?? 0, repatriation: pendingRepatriations(repatriations.map((row) => row.detention_id), signatures) };
    },
  });
  const attendance = useQuery({
    queryKey: ["command-operations-dashboard", user?.id, "attendance", from, to],
    enabled: !!user && attendanceAccess,
    refetchInterval: 60_000,
    queryFn: async () => {
      const result = await supabase.rpc("attendance_validation", { _period: "day", _from: from, _to: to });
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
  useEffect(() => {
    const refresh = () => { void qc.invalidateQueries({ queryKey: ["command-operations-dashboard"] }); };
    const channel = supabase.channel(`command-operations-dashboard-${id}`);
    for (const table of ["detention_records", "detention_bail_records", "repatriation_details", "approval_recommendations", "attendances"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, qc]);
  const trend = useMemo(() => attendanceTrend(attendance.data ?? [], from, to), [attendance.data, from, to]);
  const totals = trend.reduce((sum, day) => ({ present: sum.present + day.present, late: sum.late + day.late, absent: sum.absent + day.absent, excused: sum.excused + day.excused }), { present: 0, late: 0, absent: 0, excused: 0 });
  const value = (loading: boolean, error: unknown, count: number | undefined) => error ? "Unavailable" : loading ? "…" : count ?? 0;

  return <section className="min-w-0 space-y-6" aria-labelledby="command-dashboard-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="command-dashboard-heading" className="text-xl font-semibold">Command Dashboard</h2><p className="text-sm text-muted-foreground">Authorized commands · live records</p></div>
      <Button variant="outline" size="sm" onClick={() => void qc.invalidateQueries({ queryKey: ["command-operations-dashboard"] })}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Refresh</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {detentionAccess && <Card><CardContent className="space-y-3 p-5"><div className="flex items-center gap-2 text-primary"><Users className="h-5 w-5" aria-hidden="true" /><h3 className="text-sm font-medium">Total detainees</h3></div><p className="text-3xl font-bold">{value(counts.isPending, counts.error, counts.data?.total)}</p><p className="text-sm text-muted-foreground">In custody: {value(counts.isPending, counts.error, counts.data?.custody)}</p><Button variant="link" className="h-auto p-0" asChild><Link to="/command-operations?tab=holding">Holding Center<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>}
      {approvalAccess && <Card><CardContent className="space-y-3 p-5"><div className="flex items-center gap-2 text-primary"><ClipboardCheck className="h-5 w-5" aria-hidden="true" /><h3 className="text-sm font-medium">Pending approvals</h3></div><p className="text-3xl font-bold">{value(approvals.isPending, approvals.error, approvals.data ? approvals.data.bail + approvals.data.repatriation : undefined)}</p><p className="text-sm text-muted-foreground">Bail authorization: {value(approvals.isPending, approvals.error, approvals.data?.bail)} · Repatriation: {value(approvals.isPending, approvals.error, approvals.data?.repatriation)}</p><Button variant="link" className="h-auto p-0" asChild><Link to="/command-operations?tab=holding">Review approvals<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>}
      {attendanceAccess && <Card><CardContent className="space-y-3 p-5"><div className="flex items-center gap-2 text-primary"><UserCheck className="h-5 w-5" aria-hidden="true" /><h3 className="text-sm font-medium">Attendance · last 7 days</h3></div><p className="text-3xl font-bold">{value(attendance.isPending, attendance.error, totals.present + totals.late)}</p><p className="text-sm text-muted-foreground">Recorded present or late</p><Button variant="link" className="h-auto p-0" asChild><Link to="/attendance/overview">Attendance trends<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>}
    </div>
    {[counts.error, approvals.error, attendance.error].some(Boolean) && <p role="alert" className="text-sm text-destructive">Some dashboard records could not be loaded. Refresh to try again.</p>}
    {!attendanceAccess && <p className="text-sm text-muted-foreground">Attendance reporting access is not assigned to your account.</p>}
    {!detentionAccess && <p className="text-sm text-muted-foreground">Holding Center access is not assigned to your account.</p>}
  </section>;
}
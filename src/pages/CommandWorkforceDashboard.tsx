import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Building2, Users, CalendarClock, CalendarOff, ClipboardCheck, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePagedList } from "@/hooks/usePagedList";
import { useRbac } from "@/hooks/useRbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListPagination } from "@/components/ui/list-pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QuickUserSearch } from "@/components/dashboard/QuickUserSearch";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { DashboardSyncStatus } from "@/components/dashboard/DashboardSyncStatus";
import { dashboardRetry } from "@/lib/dashboard-integrity";
import { formatDate } from "@/lib/date-format";
import { APPRAISAL_STATES, appraisalDetailLink } from "@/lib/appraisal-workflow";
import { filterWorkforceRows, parseCommandWorkforce, type WorkforceRow } from "@/lib/command-workforce";

type View = "staff" | "shifts" | "leave" | "appraisals";
const labels: Record<View, string> = { staff: "Staff", shifts: "Shifts", leave: "Leave", appraisals: "Appraisals" };
export default function CommandWorkforceDashboard() {
  const { user } = useAuth();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [year, setYear] = useState(() => String(new Date().getUTCFullYear()));
  const query = useQuery({
    queryKey: ["command-workforce", user?.id, day, year], enabled: !!user && !!day,
    refetchInterval: 60_000, retry: dashboardRetry,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("command_workforce_dashboard", { _day: day, _year: Number(year) });
      if (error) throw error;
      return parseCommandWorkforce(data);
    },
  });
  const data = query.isError ? undefined : query.data;
  return <div className="min-w-0 space-y-5">
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-1"><h1 className="flex items-center gap-2 text-2xl font-semibold"><Building2 className="h-6 w-6 shrink-0 text-primary" aria-hidden="true"/>Command HR Dashboard</h1>
        {data?.command && <p className="break-words text-lg font-medium text-primary">{data.command.name}</p>}
        <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" aria-hidden="true"/>Assigned command</Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-96">
        <div><Label htmlFor="workforce-day">Duty date</Label><DateInput id="workforce-day" value={day} onChange={e => { if (e.target.value) setDay(e.target.value); }}/></div>
        <div><Label htmlFor="workforce-year">Appraisal year</Label><Select value={year} onValueChange={setYear}><SelectTrigger id="workforce-year"><SelectValue/></SelectTrigger><SelectContent>{Array.from({ length: 12 }, (_, i) => String(new Date().getUTCFullYear() + 1 - i)).map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select></div>
      </div>
    </header>
    <DashboardSyncStatus updatedAt={query.dataUpdatedAt} failed={query.isError} fetching={query.isFetching} onRetry={() => void query.refetch()}/>
    {query.isLoading && <p role="status">Loading command records…</p>}
    {query.isError && <Alert variant="destructive"><AlertDescription>Command records could not be loaded. Your command posting and Human Resource permissions are required. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></AlertDescription></Alert>}
    {data && !data.assigned && <Alert><AlertDescription>No command is assigned to your staff record.</AlertDescription></Alert>}
    {data?.assigned && <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile title="Command personnel" value={data.staff.length} icon={Users} sub="Non-deleted personnel"/>
        <KpiTile title="Staff assigned shifts" value={data.shift_staff} icon={CalendarClock} sub={formatDate(day)}/>
        <KpiTile title="Staff on approved leave" value={data.leave_staff} icon={CalendarOff} sub={formatDate(day)}/>
        <KpiTile title="Appraisals awaiting review" value={data.appraisal_access ? data.appraisals?.filter(r => r.status === "submitted" || r.status === "under_review").length ?? 0 : "Restricted"} icon={ClipboardCheck} sub={year}/>
      </div>
      <Tabs defaultValue="staff" className="min-w-0">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-5">{(Object.keys(labels) as View[]).map(view => <TabsTrigger key={view} value={view} className="min-h-10">{labels[view]}</TabsTrigger>)}<TabsTrigger value="quick-search" className="min-h-10">Quick User Search</TabsTrigger></TabsList>
        <TabsContent value="quick-search" className="mt-4 min-w-0"><QuickUserSearch /></TabsContent>
        {(Object.keys(labels) as View[]).map(view => <TabsContent key={view} value={view} className="mt-4 min-w-0">
          {view === "appraisals" && !data.appraisal_access ? <Alert><AlertDescription>Appraisal access is not authorized for your account.</AlertDescription></Alert> :
            <WorkforceList key={`${view}-${day}-${year}`} view={view} rows={data[view] ?? []}/>}
        </TabsContent>)}
      </Tabs>
    </>}
  </div>;
}
function WorkforceList({ view, rows }: { view: View; rows: WorkforceRow[] }) {
  const { canPath } = useRbac();
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("all");
  const filtered = filterWorkforceRows(rows, search, status);
  const pager = usePagedList(filtered, { resetKey: `${search}|${status}` });
  const statuses = Array.from(new Set(rows.map(r => r.status).filter((s): s is string => !!s))).sort();
  const statusLabel = (value: string) => view === "appraisals" ? APPRAISAL_STATES[value] ?? value : value.replace(/_/g, " ");
  const detail = (r: WorkforceRow) => view === "staff" ? [r.rank, r.unit].filter(Boolean).join(" · ") : view === "shifts" ? `${r.shift ?? "Shift"} · ${r.start_time?.slice(0,5) ?? "—"} – ${r.end_time?.slice(0,5) ?? "—"}` : view === "leave" ? `${formatDate(r.start_date)} – ${formatDate(r.end_date)}` : r.period_month ? `${String(r.period_month).padStart(2,"0")}/${r.period_year}` : `Annual ${r.period_year}`;
  const action = (r: WorkforceRow) => {
    if (view !== "appraisals" || !r.staff_profile_id || !r.period_year || !canPath(`/appraisals/officer/${r.staff_profile_id}`)) return null;
    return <Button asChild variant="outline" size="sm"><Link to={appraisalDetailLink({ staff_profile_id: r.staff_profile_id, period_year: r.period_year, period_month: r.period_month ?? null })}>Open review</Link></Button>;
  };
  return <section aria-label={`${labels[view]} records`} className="space-y-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1"><Label htmlFor={`workforce-search-${view}`}>Search {labels[view].toLowerCase()}</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true"/><Input id={`workforce-search-${view}`} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" placeholder="Staff name, rank, unit or shift"/></div></div>
      {!!statuses.length && <div className="sm:w-52"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label={`${labels[view]} status`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{statuses.map(s => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent></Select></div>}
    </div>
    <p className="text-sm text-muted-foreground" aria-live="polite">{filtered.length} {labels[view].toLowerCase()} records</p>
    {!filtered.length && <p className="py-6 text-sm text-muted-foreground">No {labels[view].toLowerCase()} records match.</p>}
    {!!filtered.length && <>
      <div className="space-y-3 md:hidden">{pager.pageItems.map(r => <Card key={r.id}><CardContent className="space-y-2 p-4"><h3 className="break-words font-medium">{r.name}</h3><p className="break-words text-sm text-muted-foreground">{detail(r)}</p><div className="flex flex-wrap items-center gap-2">{r.status && <Badge variant="secondary" className="capitalize">{statusLabel(r.status)}</Badge>}{action(r)}</div></CardContent></Card>)}</div>
      <div className="hidden md:block"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Officer</TableHead><TableHead>{view === "staff" ? "Rank / Unit" : view === "shifts" ? "Shift / Hours" : "Period"}</TableHead>{view !== "shifts" && <TableHead>Status</TableHead>}{view === "appraisals" && <TableHead>Review</TableHead>}</TableRow></TableHeader><TableBody>{pager.pageItems.map(r => <TableRow key={r.id}><TableCell className="font-medium">{r.name}</TableCell><TableCell>{detail(r)}</TableCell>{view !== "shifts" && <TableCell><Badge variant="secondary" className="capitalize">{statusLabel(r.status ?? "—")}</Badge></TableCell>}{view === "appraisals" && <TableCell>{action(r)}</TableCell>}</TableRow>)}</TableBody></Table></div>
      <ListPagination {...pager} label={labels[view].toLowerCase()}/>
    </>}
  </section>;
}
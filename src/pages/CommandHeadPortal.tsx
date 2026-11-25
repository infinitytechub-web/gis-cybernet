import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Building2, CalendarClock, CalendarOff, ClipboardCheck, Crosshair, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRbac } from "@/hooks/useRbac";
import { useProcurementBudgets } from "@/hooks/useProcurementRequests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { DashboardSyncStatus } from "@/components/dashboard/DashboardSyncStatus";
import { LeaveApprovalQueue } from "@/components/leave/LeaveApprovalQueue";
import { CommandApprovalQueue } from "@/components/hr/CommandApprovalQueue";
import { CommandPortalRecords } from "@/components/command/CommandPortalRecords";
import { CommandPortalProcurement } from "@/components/command/CommandPortalProcurement";
import { parseCommandWorkforce } from "@/lib/command-workforce";
import { commandPortalScope } from "@/lib/command-head-portal";
import { readRecordPages } from "@/lib/read-record-pages";
import { dashboardRetry } from "@/lib/dashboard-integrity";
import { formatDate } from "@/lib/date-format";
import { appraisalDetailLink } from "@/lib/appraisal-workflow";

const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CommandHeadPortal() {
  const { user } = useAuth();
  const { can, loading: permissionsLoading } = useRbac();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [year, setYear] = useState(() => String(new Date().getUTCFullYear()));
  const [view, setView] = useState("approvals");
  const workforce = useQuery({
    queryKey: ["command-workforce", user?.id, day, year], enabled: !!user && !!day,
    refetchInterval: 60_000, retry: dashboardRetry,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("command_workforce_dashboard", { _day: day, _year: Number(year) });
      if (error) throw error;
      return parseCommandWorkforce(data);
    },
  });
  const data = workforce.isError ? undefined : workforce.data;
  const units = useQuery({
    queryKey: ["command-portal-units", user?.id, data?.command?.id], enabled: !!user && !!data?.assigned,
    refetchInterval: 60_000, retry: dashboardRetry,
    queryFn: () => readRecordPages((from, to) => supabase.from("org_units").select("id, parent_id, name").order("id").range(from, to)),
  });
  const scope = useMemo(() => data && units.isSuccess && !units.isError ? commandPortalScope(data, units.data) : null, [data, units.data, units.isSuccess, units.isError]);
  const budgets = useProcurementBudgets(Number(year), !!scope && !permissionsLoading && can("procurement"));
  const budgetRows = budgets.isError ? [] : (budgets.data ?? []).filter(row => scope?.unitIds.includes(row.org_unit_id));
  const approvedLeave = data?.leave.filter(row => row.status === "approved" && (row.start_date ?? "") <= day && (row.end_date ?? "") >= day) ?? [];
  const approvalTypes = [
    { key: "leave", title: "Leave requests", module: "leave-approvals" },
    { key: "personnel", title: "Transfers & promotions", module: "hr" },
    { key: "procurement", title: "Procurement", module: "procurement" },
  ].filter(item => !permissionsLoading && can(item.module));
  const reviews = data?.appraisal_access ? data.appraisals?.filter(row => ["submitted", "under_review"].includes(row.status ?? "")) ?? [] : [];

  return <div className="min-w-0 space-y-5">
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="min-w-0 space-y-2"><p className="text-xs font-medium uppercase text-muted-foreground">My Work</p>
        <h1 className="flex items-start gap-2 text-2xl font-semibold"><Building2 className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />Command Head Portal</h1>
        {data?.command && <p className="break-words text-lg font-medium text-primary">{data.command.name}</p>}
        {data?.assigned && <Badge variant="outline">Assigned command</Badge>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:w-96">
        <div><Label htmlFor="command-portal-day">Duty / leave date</Label><DateInput id="command-portal-day" value={day} onChange={event => { if (event.target.value) setDay(event.target.value); }} /></div>
        <div><Label htmlFor="command-portal-year">Financial year</Label><Select value={year} onValueChange={setYear}><SelectTrigger id="command-portal-year"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 8 }, (_, i) => String(new Date().getUTCFullYear() + 1 - i)).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      </div>
    </header>
    <DashboardSyncStatus updatedAt={workforce.dataUpdatedAt} failed={workforce.isError || units.isError} fetching={workforce.isFetching || units.isFetching} onRetry={() => { void workforce.refetch(); if (data?.assigned) void units.refetch(); if (scope && can("procurement")) void budgets.refetch(); }} />
    {workforce.isLoading && <p role="status">Loading command records…</p>}
    {workforce.isError && <Alert variant="destructive"><AlertDescription>Command records could not be loaded. <Button variant="outline" size="sm" onClick={() => void workforce.refetch()}>Retry</Button></AlertDescription></Alert>}
    {data && !data.assigned && <Alert><AlertDescription>No command is assigned to your staff record.</AlertDescription></Alert>}
    {data?.assigned && <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile title="Assigned to duty" value={data.shift_staff} icon={CalendarClock} sub={formatDate(day)} />
        <KpiTile title="On approved leave" value={data.leave_staff} icon={CalendarOff} sub={formatDate(day)} />
        <KpiTile title="Pending leave" value={data.leave.filter(row => row.status === "pending").length} icon={ClipboardCheck} sub="Awaiting decision" />
        <KpiTile title="Budget allocations" value={!can("procurement") ? "Restricted" : !scope || budgets.isLoading || budgets.isError ? "—" : budgetRows.length} icon={Wallet} sub={`Procurement · ${year}`} />
      </div>
      {units.isLoading && <p role="status">Loading command scope…</p>}
      {units.isError && <Alert variant="destructive"><AlertDescription>Command scope could not be loaded. Approval and budget records are unavailable. <Button variant="outline" size="sm" onClick={() => void units.refetch()}>Retry</Button></AlertDescription></Alert>}
      <Tabs value={view} onValueChange={setView} className="min-w-0">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 lg:grid-cols-4">
          <TabsTrigger value="roster" className="min-h-11">Duty roster</TabsTrigger><TabsTrigger value="leave" className="min-h-11">Leave</TabsTrigger>
          <TabsTrigger value="budgets" className="min-h-11">Budgets</TabsTrigger><TabsTrigger value="approvals" className="min-h-11">Pending approvals</TabsTrigger>
        </TabsList>
        <TabsContent value="roster" className="min-w-0 space-y-4 pt-3"><h2 className="text-lg font-semibold">Duty roster · {formatDate(day)}</h2><CommandPortalRecords key={day} view="roster" rows={data.shifts} /></TabsContent>
        <TabsContent value="leave" className="min-w-0 space-y-4 pt-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Staff on leave · {formatDate(day)}</h2>{can("leave-approvals") && <Button variant="outline" size="sm" onClick={() => setView("approvals")}>Review leave requests</Button>}</div><CommandPortalRecords key={day} view="leave" rows={approvedLeave} /></TabsContent>
        <TabsContent value="budgets" className="min-w-0 space-y-4 pt-3"><h2 className="text-lg font-semibold">Procurement budgets · {year}</h2>
          {!can("procurement") ? <p className="text-sm text-muted-foreground">Budget access is not authorized for your account.</p> : !scope ? null : budgets.isError ? <p role="alert" className="text-sm text-destructive">Budgets could not be loaded. <Button variant="outline" size="sm" onClick={() => void budgets.refetch()}>Retry</Button></p> : budgets.isLoading ? <p role="status">Loading budgets…</p> : !budgetRows.length ? <p className="py-6 text-sm text-muted-foreground">No procurement budget or spending recorded for your command in {year}.</p> : <>
            <div className="divide-y md:hidden">{budgetRows.map(row => <article key={row.org_unit_id} className="space-y-3 py-4"><h3 className="break-words font-medium">{row.org_unit_name}</h3><dl className="grid grid-cols-2 gap-3 text-sm">{[["Budget", row.budget_amount], ["Committed", row.committed], ["Pending", row.pending], ["Remaining", row.remaining]].map(([title, amount]) => <div key={title}><dt className="text-muted-foreground">{title}</dt><dd className="break-words font-medium">{money(Number(amount), row.currency)}</dd></div>)}</dl><Badge variant={row.over_budget ? "destructive" : "outline"}>{row.over_budget ? "Over budget" : row.utilisation_pct == null ? "No allocation" : `${row.utilisation_pct}% used`}</Badge></article>)}</div>
            <div className="hidden min-w-0 overflow-x-auto md:block"><Table className="min-w-[700px]"><TableHeader><TableRow>{["Command / Unit", "Budget", "Committed", "Pending", "Remaining", "Used"].map(title => <TableHead key={title}>{title}</TableHead>)}</TableRow></TableHeader><TableBody>{budgetRows.map(row => <TableRow key={row.org_unit_id}><TableCell className="font-medium">{row.org_unit_name}</TableCell>{[row.budget_amount, row.committed, row.pending, row.remaining].map((amount, i) => <TableCell key={i}>{money(amount, row.currency)}</TableCell>)}<TableCell><Badge variant={row.over_budget ? "destructive" : "outline"}>{row.utilisation_pct == null ? "No allocation" : `${row.utilisation_pct}%`}</Badge></TableCell></TableRow>)}</TableBody></Table></div>
          </>}
        </TabsContent>
        <TabsContent value="approvals" className="min-w-0 space-y-5 pt-3">
          {scope && approvalTypes.length > 0 && <Tabs defaultValue={approvalTypes[0]?.key} className="min-w-0"><TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3">{approvalTypes.map(item => <TabsTrigger key={item.key} value={item.key} className="min-h-10">{item.title}</TabsTrigger>)}</TabsList>
            {can("leave-approvals") && <TabsContent value="leave" className="min-w-0 pt-3"><LeaveApprovalQueue profileIds={scope.profileIds} /></TabsContent>}
            {can("hr") && <TabsContent value="personnel" className="min-w-0 pt-3"><CommandApprovalQueue scope={scope} /></TabsContent>}
            {can("procurement") && <TabsContent value="procurement" className="min-w-0 pt-3"><CommandPortalProcurement scope={scope} /></TabsContent>}
          </Tabs>}
          {scope && can("armory-weapons") && <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><h2 className="flex items-center gap-2 text-base font-semibold"><Crosshair className="h-4 w-4 text-primary" aria-hidden="true" />Armory custody, transfers & inspections</h2><Button asChild variant="outline" size="sm"><Link to={`/armory-weapons/approvals?command=${data.command?.id}`}>Review armory approvals</Link></Button></div>}
          {reviews.length > 0 && <section className="space-y-3 border-t pt-4"><h2 className="text-base font-semibold">Performance reviews · {year}</h2>{reviews.map(row => row.staff_profile_id && row.period_year && <div key={row.id} className="flex flex-wrap items-center justify-between gap-2"><span className="break-words text-sm">{row.name}</span><Button asChild variant="outline" size="sm"><Link to={appraisalDetailLink({ staff_profile_id: row.staff_profile_id, period_year: row.period_year, period_month: row.period_month ?? null })}>Open review</Link></Button></div>)}</section>}
        </TabsContent>
      </Tabs>
    </>}
  </div>;
}

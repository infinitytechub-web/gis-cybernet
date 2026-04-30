import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, History, ChevronLeft, ChevronRight, Filter, X as XIcon, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABEL, COMMAND_TIER_ROLES, roleLabel } from "@/lib/role-labels";
import type { AppRole } from "@/lib/types";
import { downloadCSVString } from "@/lib/download-utils";

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

const PAGE_SIZE = 25;

type Action = "all" | "assign" | "remove" | "change";

export default function CommandRoleAudit() {
  const { isAdmin } = useAuth();

  const [staffSearch, setStaffSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");
  const [actionFilter, setActionFilter] = useState<Action>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(0);

  const queryKey = useMemo(() => [
    "command-role-audit-page",
    { staffSearch: staffSearch.trim().toLowerCase(), roleFilter, actionFilter,
      startDate: startDate?.toISOString() ?? null,
      endDate: endDate?.toISOString() ?? null,
      page },
  ], [staffSearch, roleFilter, actionFilter, startDate, endDate, page]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("command_role_audit")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (roleFilter !== "all") {
        // role filter matches either from_role OR to_role
        q = q.or(`from_role.eq.${roleFilter},to_role.eq.${roleFilter}`);
      }
      if (actionFilter !== "all") {
        q = q.eq("action", actionFilter);
      }
      if (startDate) {
        q = q.gte("created_at", startDate.toISOString());
      }
      if (endDate) {
        // include the entire end date day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      const term = staffSearch.trim();
      if (term) {
        // match on staff name or staff id (server-side ilike)
        q = q.or(`target_name.ilike.%${term}%,target_staff_id.ilike.%${term}%`);
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      q = q.range(from, to);

      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
    enabled: isAdmin,
    placeholderData: (prev) => prev,
  });

  const total = data?.count ?? 0;
  const rows = data?.rows ?? [];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!(staffSearch || roleFilter !== "all" || actionFilter !== "all" || startDate || endDate);

  const clearAll = () => {
    setStaffSearch(""); setRoleFilter("all"); setActionFilter("all");
    setStartDate(undefined); setEndDate(undefined); setPage(0);
  };

  const exportCsv = () => {
    if (!rows.length) return;
    const csv = toCsv(
      ["When", "Action", "Target", "Staff ID", "From", "To", "Changed by"],
      rows.map((r: any) => [
        r.created_at ? format(new Date(r.created_at), "yyyy-MM-dd HH:mm") : "",
        r.action ?? "",
        r.target_name ?? r.target_user_id ?? "",
        r.target_staff_id ?? "",
        r.from_role ? roleLabel(r.from_role) : "",
        r.to_role ? roleLabel(r.to_role) : "",
        r.changed_by_name ?? r.changed_by ?? "",
      ]),
    );
    downloadCSVString(csv, `command-role-audit-page-${page + 1}.csv`);
  };

  if (!isAdmin) {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Admin only</AlertTitle>
        <AlertDescription>The Command-Role audit log is restricted to administrators.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <History className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Command Role Audit Log</h1>
          <p className="text-xs text-muted-foreground">
            Immutable record of every command-tier role assignment, change, or removal.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-sm flex items-center gap-1.5"><Filter className="h-4 w-4" /> Filters</CardTitle>
              <CardDescription className="text-[11px]">All filters apply server-side. Results paginate at {PAGE_SIZE} per page.</CardDescription>
            </div>
            <div className="flex gap-2">
              {hasFilters && (
                <Button size="sm" variant="ghost" onClick={clearAll} className="gap-1 text-[11px]">
                  <XIcon className="h-3 w-3" /> Clear
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length} className="gap-1 text-[11px]">
                <Download className="h-3 w-3" /> Export page
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <div className="lg:col-span-2">
              <label className="text-[10px] uppercase text-muted-foreground mb-1 block">Staff (name or ID)</label>
              <Input
                value={staffSearch}
                onChange={(e) => { setStaffSearch(e.target.value); setPage(0); }}
                placeholder="e.g. Mensah or GIS-001"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground mb-1 block">Role</label>
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v as any); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {COMMAND_TIER_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABEL[r] ?? roleLabel(r)}</SelectItem>
                  ))}
                  <SelectItem value="staff">Staff (demoted)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground mb-1 block">Action</label>
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v as Action); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  <SelectItem value="assign">Assign</SelectItem>
                  <SelectItem value="change">Change</SelectItem>
                  <SelectItem value="remove">Remove</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-1 lg:col-span-1">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground mb-1 block">From</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("h-8 w-full px-2 text-xs justify-start gap-1", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="h-3 w-3" />
                      {startDate ? format(startDate, "dd MMM") : "Any"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setPage(0); }} className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground mb-1 block">To</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("h-8 w-full px-2 text-xs justify-start gap-1", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="h-3 w-3" />
                      {endDate ? format(endDate, "dd MMM") : "Any"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setPage(0); }} className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Results</CardTitle>
            <CardDescription className="text-[11px]">
              {isLoading ? "Loading…" : `${total.toLocaleString()} entr${total === 1 ? "y" : "ies"} • Page ${page + 1} of ${pageCount}`}
              {isFetching && !isLoading && <Loader2 className="inline ml-2 h-3 w-3 animate-spin" />}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={page === 0 || isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))} className="h-7 px-2">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= pageCount || isFetching} onClick={() => setPage((p) => p + 1)} className="h-7 px-2">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded border overflow-x-auto" style={{ minWidth: 700 }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">When</TableHead>
                  <TableHead className="text-[10px]">Action</TableHead>
                  <TableHead className="text-[10px]">Target</TableHead>
                  <TableHead className="text-[10px]">From → To</TableHead>
                  <TableHead className="text-[10px]">Changed by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs italic text-muted-foreground py-8">
                      No entries match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[11px] whitespace-nowrap">
                      {r.created_at ? format(new Date(r.created_at), "dd MMM yyyy HH:mm") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(
                        "text-[10px]",
                        r.action === "assign" && "bg-emerald-600 hover:bg-emerald-600",
                        r.action === "remove" && "bg-destructive hover:bg-destructive",
                        r.action === "change" && "bg-amber-600 hover:bg-amber-600",
                      )}>{(r.action ?? "").toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell className="text-[11px]">
                      <div className="font-medium">{r.target_name ?? r.target_user_id ?? "—"}</div>
                      {r.target_staff_id && <div className="text-[10px] text-muted-foreground">{r.target_staff_id}</div>}
                    </TableCell>
                    <TableCell className="text-[11px]">
                      {r.from_role ? <Badge variant="outline" className="text-[10px]">{roleLabel(r.from_role)}</Badge> : <span className="italic text-muted-foreground">none</span>}
                      <span className="mx-1">→</span>
                      {r.to_role ? <Badge variant="outline" className="text-[10px]">{roleLabel(r.to_role)}</Badge> : <span className="italic text-muted-foreground">none</span>}
                    </TableCell>
                    <TableCell className="text-[11px]">{r.changed_by_name ?? r.changed_by ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

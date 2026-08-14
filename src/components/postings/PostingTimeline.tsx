import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportMenu } from "@/components/ui/export-menu";
import { format, parseISO } from "date-fns";
import { CalendarClock, ArrowRight, CheckCircle2, XCircle, Clock, Filter, X } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";

const statusMeta = (s: string) => {
  switch (s) {
    case "approved":
      return { icon: CheckCircle2, label: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" };
    case "rejected":
      return { icon: XCircle, label: "Rejected", className: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500" };
    default:
      return { icon: Clock, label: "Pending", className: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500" };
  }
};

const ALL = "__all__";

export function PostingTimeline() {
  const { user } = useAuth();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [departmentId, setDepartmentId] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["my-postings-timeline", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("postings_transfers")
        .select("*, from_dept:departments!postings_transfers_from_department_id_fkey(name), to_dept:departments!postings_transfers_to_department_id_fkey(name)")
        .eq("profile_id", profile!.id)
        .order("effective_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Departments referenced anywhere in this user's history (for the filter dropdown)
  const departmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((r: any) => {
      if (r.from_department_id && r.from_dept?.name) map.set(r.from_department_id, r.from_dept.name);
      if (r.to_department_id && r.to_dept?.name) map.set(r.to_department_id, r.to_dept.name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [records]);

  const filtered = useMemo(() => {
    return records.filter((r: any) => {
      if (fromDate && r.effective_date < fromDate) return false;
      if (toDate && r.effective_date > toDate) return false;
      if (status !== ALL && r.status !== status) return false;
      if (departmentId !== ALL && r.from_department_id !== departmentId && r.to_department_id !== departmentId) return false;
      return true;
    });
  }, [records, fromDate, toDate, status, departmentId]);

  const filtersActive = !!(fromDate || toDate || departmentId !== ALL || status !== ALL);
  const resetFilters = () => {
    setFromDate("");
    setToDate("");
    setDepartmentId(ALL);
    setStatus(ALL);
  };

  const buildExport = () => {
    if (filtered.length === 0) return null;
    const today = format(new Date(), "yyyy-MM-dd");
    return {
      title: "My Postings & Transfers Timeline",
      filename: `postings_timeline_${today}`,
      headers: ["Effective Date", "Type", "From Department", "To Department", "Status", "Remarks", "Recorded"],
      rows: filtered.map((r: any) => [
        format(parseISO(r.effective_date), "yyyy-MM-dd"),
        String(r.type ?? "—"),
        r.from_dept?.name ?? "—",
        r.to_dept?.name ?? "—",
        statusMeta(r.status).label,
        r.remarks ?? "",
        format(new Date(r.created_at), "yyyy-MM-dd"),
      ]),
      subtitle: `${filtered.length} of ${records.length} event${records.length === 1 ? "" : "s"}`,
    };
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-secondary">
            <CalendarClock className="h-5 w-5 text-primary" />
            Posting Timeline
          </CardTitle>
          <div className="flex items-center gap-3">
            {records.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Showing {filtered.length} of {records.length} event{records.length === 1 ? "" : "s"}
              </p>
            )}
            <ExportMenu
              label="Export"
              size="sm"
              variant="outline"
              formats={["pdf", "csv"]}
              getData={buildExport}
              disabled={filtered.length === 0}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {records.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Filters</span>
              {filtersActive && (
                <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" onClick={resetFilters}>
                  <X className="h-3 w-3 mr-1" /> Reset
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div>
                <Label htmlFor="timeline-from" className="text-xs">From</Label>
                <DateInput
                  id="timeline-from"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="timeline-to" className="text-xs">To</Label>
                <DateInput
                  id="timeline-to"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  min={fromDate || undefined}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All departments</SelectItem>
                    {departmentOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">Loading timeline...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">No posting events yet</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No events match the selected filters.{" "}
            <button onClick={resetFilters} className="text-primary hover:underline">Reset filters</button>
          </div>
        ) : (
          <ol className="relative border-l border-border ml-3 space-y-6" aria-label="Posting and transfer history">
            {filtered.map((r: any) => {
              const meta = statusMeta(r.status);
              const Icon = meta.icon;
              return (
                <li key={r.id} className="ml-6">
                  <span
                    className={`absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-background ${meta.dot}`}
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <time
                      className="text-sm font-semibold text-foreground"
                      dateTime={r.effective_date}
                    >
                      {format(parseISO(r.effective_date), "dd/MM/yyyy")}
                    </time>
                    <Badge variant="outline" className={`${meta.className} gap-1`}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                    <Badge variant="secondary" className="capitalize">{r.type}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{r.from_dept?.name ?? "—"}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-label="transferred to" />
                    <span className="font-medium text-foreground">{r.to_dept?.name ?? "—"}</span>
                  </div>
                  {r.remarks && (
                    <p className="mt-1.5 text-sm text-muted-foreground italic">"{r.remarks}"</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recorded {format(new Date(r.created_at), "dd/MM/yyyy")}
                    {r.status !== "pending" && r.updated_at && r.updated_at !== r.created_at && (
                      <> · {meta.label.toLowerCase()} {format(new Date(r.updated_at), "dd/MM/yyyy")}</>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

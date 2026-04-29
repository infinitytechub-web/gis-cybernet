import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { format, parseISO, subDays } from "date-fns";
import {
  ScrollText,
  Filter,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  CalendarRange,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type AuditAction = "created" | "updated" | "deleted";

type AuditEntry = {
  id: string;
  override_id: string | null;
  shift_id: string | null;
  action: AuditAction;
  changed_fields: string[] | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  performed_by: string | null;
  performed_by_name: string | null;
  created_at: string;
  shifts?: { name: string | null } | null;
};

const FIELD_LABELS: Record<string, string> = {
  grace_minutes: "Grace (min)",
  early_checkin_minutes: "Earliest in (min before)",
  late_checkout_minutes: "Latest out (min after)",
  enforce_window: "Enforce window",
  notes: "Notes",
  effective_from: "Effective from",
  effective_to: "Effective to",
};

const ACTION_TONE: Record<AuditAction, string> = {
  created: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  updated: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  deleted: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
};

const ACTION_ICON: Record<AuditAction, React.ComponentType<{ className?: string }>> = {
  created: Plus,
  updated: Pencil,
  deleted: Trash2,
};

function fmtVal(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "enforce_window") return value ? "On" : "Off";
  if (field === "effective_from" || field === "effective_to") {
    try { return format(parseISO(String(value)), "dd MMM yyyy"); } catch { return String(value); }
  }
  return String(value);
}

export default function ShiftWindowAudit() {
  const { user, role, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const canView = role === "admin" || role === "oic" || role === "2ic" || role === "staff_officer";

  const [actionFilter, setActionFilter] = useState<AuditAction | "all">("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const shiftsQuery = useQuery({
    queryKey: ["shifts-mini-for-audit"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("shifts").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const auditQuery = useQuery({
    queryKey: ["shift-window-audit", actionFilter, shiftFilter, from, to],
    enabled: canView,
    queryFn: async () => {
      let q = supabase
        .from("shift_window_override_audit")
        .select(
          "id, override_id, shift_id, action, changed_fields, old_values, new_values, performed_by, performed_by_name, created_at, shifts:shift_id(name)",
        )
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      if (shiftFilter !== "all") q = q.eq("shift_id", shiftFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AuditEntry[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!canView) return;
    const ch = supabase
      .channel("shift-window-audit-rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shift_window_override_audit" },
        () => queryClient.invalidateQueries({ queryKey: ["shift-window-audit"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [canView, queryClient]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return auditQuery.data ?? [];
    return (auditQuery.data ?? []).filter((r) => {
      const name = (r.performed_by_name ?? "").toLowerCase();
      const shift = (r.shifts?.name ?? "").toLowerCase();
      return name.includes(q) || shift.includes(q);
    });
  }, [auditQuery.data, search]);

  if (authLoading) {
    return (
      <div className="container mx-auto p-6 space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!user || !canView) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            Shift Window Rules — Audit Log
          </h1>
          <p className="text-sm text-muted-foreground">
            Every change to per-shift grace, early check-in and late check-out rules — with before / after values.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => auditQuery.refetch()}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Filters
          </CardTitle>
          <CardDescription>Filter changes by action type, shift, or date range.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">Action</Label>
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as AuditAction | "all")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="updated">Updated</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Shift</Label>
            <Select value={shiftFilter} onValueChange={setShiftFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shifts</SelectItem>
                {(shiftsQuery.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Search (user / shift)</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. John or Day shift" />
          </div>
        </CardContent>
      </Card>

      {auditQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <ScrollText className="h-8 w-8 opacity-50" />
            No audit entries match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const Icon = ACTION_ICON[r.action];
            const open = expanded[r.id] ?? false;
            const fields = r.changed_fields ?? Object.keys(r.new_values ?? r.old_values ?? {});
            return (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("gap-1 capitalize", ACTION_TONE[r.action])}>
                        <Icon className="h-3 w-3" />
                        {r.action}
                      </Badge>
                      <div>
                        <div className="font-semibold text-sm">
                          {r.shifts?.name ?? "Unknown shift"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          by {r.performed_by_name || "System"} · {format(parseISO(r.created_at), "dd MMM yyyy, HH:mm")}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded((e) => ({ ...e, [r.id]: !open }))}
                      className="h-7 px-2 gap-1.5 text-xs"
                    >
                      {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {open ? "Hide details" : "Show before / after"}
                    </Button>
                  </div>

                  {r.action === "updated" && (r.changed_fields?.length ?? 0) > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Changed: {(r.changed_fields ?? []).map((f) => FIELD_LABELS[f] ?? f).join(", ")}
                    </div>
                  )}

                  {(r.new_values?.effective_from || r.new_values?.effective_to ||
                    r.old_values?.effective_from || r.old_values?.effective_to) && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CalendarRange className="h-3.5 w-3.5" />
                      <span className="font-mono">
                        {fmtVal("effective_from", (r.new_values ?? r.old_values)?.effective_from)} →{" "}
                        {fmtVal("effective_to", (r.new_values ?? r.old_values)?.effective_to)}
                      </span>
                    </div>
                  )}

                  {open && (
                    <div className="rounded-md border bg-muted/20 overflow-x-auto">
                      <table className="w-full text-xs" style={{ minWidth: 700 }}>
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="text-left p-2 font-medium">Field</th>
                            <th className="text-left p-2 font-medium">Before</th>
                            <th className="text-left p-2 font-medium">After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields
                            .filter((f) => f !== "id" && f !== "shift_id" && f !== "created_at" && f !== "updated_at" && f !== "updated_by")
                            .map((f) => {
                              const before = r.old_values?.[f];
                              const after = r.new_values?.[f];
                              const changed = JSON.stringify(before) !== JSON.stringify(after);
                              return (
                                <tr key={f} className="border-t">
                                  <td className="p-2 font-medium">{FIELD_LABELS[f] ?? f}</td>
                                  <td className={cn("p-2 font-mono", changed && "text-red-600 dark:text-red-400 line-through")}>
                                    {fmtVal(f, before)}
                                  </td>
                                  <td className={cn("p-2 font-mono", changed && "text-emerald-700 dark:text-emerald-400 font-semibold")}>
                                    {fmtVal(f, after)}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExportMenu } from "@/components/ui/export-menu";
import { toast } from "@/hooks/use-toast";
import {
  Shield, Search, Filter, User, Clock, FileText, ArrowRightLeft,
  CalendarCheck, Building2, Megaphone, Award, CalendarOff, AlertTriangle,
  Users, Calendar as CalendarIcon, Trash2, Plus, Minus, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ENTITY_CONFIG: Record<string, { label: string; icon: typeof Shield }> = {
  profiles: { label: "Staff Profile", icon: Users },
  leave_requests: { label: "Leave Request", icon: CalendarOff },
  postings_transfers: { label: "Posting/Transfer", icon: ArrowRightLeft },
  attendances: { label: "Attendance", icon: CalendarCheck },
  departments: { label: "Department", icon: Building2 },
  shifts: { label: "Shift", icon: Clock },
  announcements: { label: "Announcement", icon: Megaphone },
  user_roles: { label: "User Role", icon: Award },
  shift_assignments: { label: "Shift Assignment", icon: FileText },
  holidays: { label: "Holiday", icon: CalendarIcon },
  report_schedules: { label: "Report Schedule", icon: FileText },
  security_incidents: { label: "Security Incident", icon: AlertTriangle },
};

const ACTION_COLORS: Record<string, string> = {
  created: "bg-green-700/30 text-green-200 border-green-600/40",
  updated: "bg-yellow-700/30 text-yellow-200 border-yellow-600/40",
  deleted: "bg-red-700/30 text-red-200 border-red-600/40",
};
const SKIP_FIELDS = new Set(["id", "created_at", "updated_at"]);

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  performed_by: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function DiffView({ details, action }: { details: Record<string, unknown>; action: string }) {
  if (action === "updated" && details.old && details.new) {
    const oldData = details.old as Record<string, unknown>;
    const newData = details.new as Record<string, unknown>;
    const allKeys = [...new Set([...Object.keys(oldData), ...Object.keys(newData)])].filter(k => !SKIP_FIELDS.has(k));
    const changedKeys = allKeys.filter(k => JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]));
    if (changedKeys.length === 0) return <p className="text-[10px] italic opacity-60">No visible changes</p>;
    return (
      <div className="space-y-1.5">
        {changedKeys.map(key => (
          <div key={key} className="rounded border border-[hsl(120,25%,20%)] overflow-hidden">
            <div className="px-2 py-0.5 bg-[hsl(120,20%,14%)] text-[10px] font-medium text-[hsl(120,20%,65%)]">{key.replace(/_/g, " ")}</div>
            <div className="flex items-start gap-1 px-2 py-1 bg-red-900/10">
              <Minus className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
              <span className="text-[10px] text-red-300 break-all">{formatValue(oldData[key])}</span>
            </div>
            <div className="flex items-start gap-1 px-2 py-1 bg-green-900/10">
              <Plus className="h-3 w-3 text-green-400 mt-0.5 shrink-0" />
              <span className="text-[10px] text-green-300 break-all">{formatValue(newData[key])}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }
  const data = details as Record<string, unknown>;
  const keys = Object.keys(data).filter(k => !SKIP_FIELDS.has(k));
  const Icon = action === "created" ? Plus : Minus;
  const colorClass = action === "created" ? "text-green-300" : "text-red-300";
  return (
    <div className="space-y-1">
      {keys.slice(0, 12).map(key => (
        <div key={key} className="flex items-start gap-1.5">
          <Icon className={`h-3 w-3 shrink-0 ${colorClass}`} />
          <span className="text-[10px] text-[hsl(120,20%,55%)] font-medium shrink-0">{key.replace(/_/g, " ")}:</span>
          <span className={`text-[10px] ${colorClass} break-all`}>{formatValue(data[key])}</span>
        </div>
      ))}
      {keys.length > 12 && <p className="text-[10px] italic opacity-60">…and {keys.length - 12} more fields</p>}
    </div>
  );
}

function AuditEntryCard({ entry, profiles }: { entry: AuditEntry; profiles: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const config = ENTITY_CONFIG[entry.entity_type] || { label: entry.entity_type, icon: FileText };
  const Icon = config.icon;
  const performerName = entry.performed_by ? (profiles[entry.performed_by] || "System") : "System";
  return (
    <div className="border border-[hsl(120,30%,25%)] rounded-lg p-3 bg-[hsl(120,20%,12%)]">
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-md bg-[hsl(120,30%,20%)] text-[hsl(120,40%,70%)] mt-0.5">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${ACTION_COLORS[entry.action] || "bg-gray-700/30 text-gray-200"}`}>
              {entry.action.toUpperCase()}
            </Badge>
            <span className="text-xs font-medium text-[hsl(120,20%,80%)]">{config.label}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-[hsl(120,15%,55%)]">
            <User className="h-3 w-3" /><span>{performerName}</span>
            <span>•</span>
            <Clock className="h-3 w-3" /><span>{format(new Date(entry.created_at), "MMM dd, HH:mm:ss")}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-[hsl(120,15%,55%)] hover:bg-[hsl(120,20%,18%)]" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {expanded && entry.details && (
        <div className="mt-2 p-2 rounded bg-[hsl(120,20%,8%)] border border-[hsl(120,30%,20%)] max-h-60 overflow-auto">
          <DiffView details={entry.details} action={entry.action} />
        </div>
      )}
    </div>
  );
}

export default function SystemAuditPanel() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [limit, setLimit] = useState(50);
  const [collapsed, setCollapsed] = useState(false);
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["dashboard-audit-log", limit],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as AuditEntry[];
    },
    refetchInterval: 10000,
  });

  const performerIds = [...new Set(logs.map(l => l.performed_by).filter(Boolean))] as string[];
  const { data: profilesRaw = [] } = useQuery({
    queryKey: ["dashboard-audit-profiles", performerIds.join(",")],
    queryFn: async () => {
      if (performerIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, staff_id")
        .in("user_id", performerIds);
      return data || [];
    },
    enabled: performerIds.length > 0,
  });

  const profiles: Record<string, string> = {};
  profilesRaw.forEach((p: any) => {
    if (p.user_id) profiles[p.user_id] = `${p.first_name} ${p.last_name} (${p.staff_id})`;
  });

  const filtered = useMemo(() => logs.filter(log => {
    if (entityFilter !== "all" && log.entity_type !== entityFilter) return false;
    if (actionFilter !== "all" && log.action !== actionFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const performer = log.performed_by ? (profiles[log.performed_by] || "").toLowerCase() : "";
      if (!log.entity_type.includes(s) && !log.action.includes(s) && !performer.includes(s)) return false;
    }
    return true;
  }), [logs, entityFilter, actionFilter, search, profiles]);

  const entityTypes = [...new Set(logs.map(l => l.entity_type))];

  const purgeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("system_audit_log").delete().lt("created_at", new Date().toISOString());
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-audit-log"] });
      toast({ title: "Purged", description: "All audit log entries cleared." });
    },
    onError: () => toast({ title: "Error", description: "Failed to purge logs.", variant: "destructive" }),
  });

  const getExportData = () => ({
    title: "System Audit Trail",
    filename: `audit-log-${format(new Date(), "yyyy-MM-dd-HHmmss")}`,
    subtitle: `${filtered.length} entries`,
    headers: ["Timestamp", "Action", "Entity Type", "Entity ID", "Performed By"],
    rows: filtered.map(log => [
      format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss"),
      log.action,
      ENTITY_CONFIG[log.entity_type]?.label || log.entity_type,
      log.entity_id || "",
      log.performed_by ? (profiles[log.performed_by] || log.performed_by) : "System",
    ]),
  });

  if (!isAdmin) return null;

  return (
    <Card className="border-[hsl(120,30%,25%)] bg-[hsl(120,18%,10%)] text-[hsl(120,15%,85%)]">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-2 text-[hsl(120,30%,70%)]">
          <Shield className="h-4 w-4 text-[hsl(120,40%,45%)]" />
          System Audit Trail
          <span className="text-[10px] font-normal opacity-70">(admin only · live)</span>
          <Badge variant="outline" className="ml-2 text-[10px] border-[hsl(120,30%,30%)] text-[hsl(120,20%,80%)]">
            {filtered.length} entries
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          <ExportMenu
            getData={getExportData}
            label="Export"
            size="sm"
            variant="default"
            className="h-7 text-[10px] bg-[hsl(120,30%,25%)] hover:bg-[hsl(120,30%,30%)] text-[hsl(120,20%,80%)] border border-[hsl(120,30%,30%)]"
            disabled={filtered.length === 0}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" className="h-7 text-[10px] bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-800/50" disabled={logs.length === 0 || purgeMutation.isPending}>
                <Trash2 className="h-3 w-3 mr-1" />Purge
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Purge all audit logs?</AlertDialogTitle>
                <AlertDialogDescription>
                  Permanently delete all {logs.length} entries. Consider exporting first.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => purgeMutation.mutate()}>Purge All</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-[hsl(120,15%,70%)]" onClick={() => setCollapsed(v => !v)} title={collapsed ? "Expand" : "Minimize"}>
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent>
          <div className="space-y-2 mb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[hsl(120,15%,45%)]" />
              <Input
                placeholder="Search activities..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-[hsl(120,18%,8%)] border-[hsl(120,25%,25%)] text-[hsl(120,15%,80%)]"
              />
            </div>
            <div className="flex gap-2">
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="h-7 text-[10px] bg-[hsl(120,18%,8%)] border-[hsl(120,25%,25%)] text-[hsl(120,15%,70%)] flex-1">
                  <Filter className="h-3 w-3 mr-1" /><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All entities</SelectItem>
                  {entityTypes.map(t => <SelectItem key={t} value={t}>{ENTITY_CONFIG[t]?.label || t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="h-7 text-[10px] bg-[hsl(120,18%,8%)] border-[hsl(120,25%,25%)] text-[hsl(120,15%,70%)] flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="updated">Updated</SelectItem>
                  <SelectItem value="deleted">Deleted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <ScrollArea className="h-[360px]">
            <div className="space-y-2 pr-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[hsl(120,40%,45%)]" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-[hsl(120,15%,45%)] text-sm">
                  <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No audit entries
                </div>
              ) : (
                <>
                  {filtered.map(entry => <AuditEntryCard key={entry.id} entry={entry} profiles={profiles} />)}
                  {filtered.length >= limit && (
                    <Button variant="ghost" size="sm" className="w-full text-[hsl(120,30%,50%)] hover:bg-[hsl(120,20%,15%)] text-xs" onClick={() => setLimit(l => l + 50)}>
                      Load more...
                    </Button>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}

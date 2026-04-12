import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { triggerDownload } from "@/lib/download-utils";
import {
  Shield, Search, Filter, User, Clock, FileText, ArrowRightLeft,
  CalendarCheck, Building2, Megaphone, Award, CalendarOff, AlertTriangle,
  Users, Calendar, ChevronDown, ChevronUp, Trash2, Download,
} from "lucide-react";

const ENTITY_CONFIG: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  profiles: { label: "Staff Profile", icon: Users, color: "bg-emerald-800/20 text-emerald-200" },
  leave_requests: { label: "Leave Request", icon: CalendarOff, color: "bg-amber-800/20 text-amber-200" },
  postings_transfers: { label: "Posting/Transfer", icon: ArrowRightLeft, color: "bg-violet-800/20 text-violet-200" },
  attendances: { label: "Attendance", icon: CalendarCheck, color: "bg-cyan-800/20 text-cyan-200" },
  departments: { label: "Department", icon: Building2, color: "bg-purple-800/20 text-purple-200" },
  shifts: { label: "Shift", icon: Clock, color: "bg-indigo-800/20 text-indigo-200" },
  announcements: { label: "Announcement", icon: Megaphone, color: "bg-red-800/20 text-red-200" },
  user_roles: { label: "User Role", icon: Award, color: "bg-yellow-800/20 text-yellow-200" },
  shift_assignments: { label: "Shift Assignment", icon: FileText, color: "bg-blue-800/20 text-blue-200" },
  holidays: { label: "Holiday", icon: Calendar, color: "bg-rose-800/20 text-rose-200" },
  report_schedules: { label: "Report Schedule", icon: FileText, color: "bg-fuchsia-800/20 text-fuchsia-200" },
  security_incidents: { label: "Security Incident", icon: AlertTriangle, color: "bg-orange-800/20 text-orange-200" },
};

const ACTION_COLORS: Record<string, string> = {
  created: "bg-green-700/30 text-green-200 border-green-600/40",
  updated: "bg-yellow-700/30 text-yellow-200 border-yellow-600/40",
  deleted: "bg-red-700/30 text-red-200 border-red-600/40",
};

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  performed_by: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

function AuditEntryCard({ entry, profiles }: { entry: AuditEntry; profiles: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const config = ENTITY_CONFIG[entry.entity_type] || { label: entry.entity_type, icon: FileText, color: "bg-gray-800/20 text-gray-200" };
  const Icon = config.icon;
  const performerName = entry.performed_by ? (profiles[entry.performed_by] || "System") : "System";

  return (
    <div className="border border-[hsl(120,30%,25%)] rounded-lg p-3 bg-[hsl(120,20%,12%)] hover:bg-[hsl(120,20%,15%)] transition-colors">
      <div className="flex items-start gap-3">
        <div className={`p-1.5 rounded-md ${config.color} mt-0.5`}>
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
            <User className="h-3 w-3" />
            <span>{performerName}</span>
            <span>•</span>
            <Clock className="h-3 w-3" />
            <span>{format(new Date(entry.created_at), "MMM dd, HH:mm:ss")}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[hsl(120,15%,55%)] hover:text-[hsl(120,20%,80%)] hover:bg-[hsl(120,20%,18%)]"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {expanded && entry.details && (
        <div className="mt-2 p-2 rounded bg-[hsl(120,20%,8%)] border border-[hsl(120,30%,20%)]">
          <pre className="text-[10px] text-[hsl(120,15%,60%)] whitespace-pre-wrap break-all max-h-40 overflow-auto">
            {JSON.stringify(entry.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function SystemAuditTray() {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [limit, setLimit] = useState(50);

  const queryClient = useQueryClient();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["system-audit-log", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as AuditEntry[];
    },
    refetchInterval: 15000,
  });

  // Fetch profile names for performed_by
  const performerIds = [...new Set(logs.map(l => l.performed_by).filter(Boolean))] as string[];
  const { data: profilesRaw = [] } = useQuery({
    queryKey: ["audit-profiles", performerIds.join(",")],
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
  profilesRaw.forEach((p: { user_id: string | null; first_name: string; last_name: string; staff_id: string }) => {
    if (p.user_id) profiles[p.user_id] = `${p.first_name} ${p.last_name} (${p.staff_id})`;
  });

  const filtered = logs.filter(log => {
    if (entityFilter !== "all" && log.entity_type !== entityFilter) return false;
    if (actionFilter !== "all" && log.action !== actionFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const performer = log.performed_by ? (profiles[log.performed_by] || "").toLowerCase() : "";
      if (!log.entity_type.includes(s) && !log.action.includes(s) && !performer.includes(s)) return false;
    }
    return true;
  });

  const entityTypes = [...new Set(logs.map(l => l.entity_type))];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-[hsl(120,30%,35%)] hover:text-[hsl(120,40%,45%)] hover:bg-[hsl(120,20%,90%)] dark:hover:bg-[hsl(120,20%,15%)]"
          title="System Audit Trail"
        >
          <Shield className="h-5 w-5" />
          {logs.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-[hsl(120,40%,30%)] text-white text-[9px] flex items-center justify-center font-bold">
              {logs.length > 99 ? "99+" : logs.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[420px] sm:w-[480px] p-0 border-l-2 border-[hsl(120,30%,25%)] bg-[hsl(120,18%,10%)] text-[hsl(120,15%,85%)]"
      >
        {/* Header */}
        <div className="p-4 border-b border-[hsl(120,30%,20%)] bg-[hsl(120,25%,14%)]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-[hsl(120,30%,70%)]">
              <Shield className="h-5 w-5 text-[hsl(120,40%,45%)]" />
              System Audit Trail
            </SheetTitle>
            <SheetDescription className="text-[hsl(120,15%,50%)] text-xs">
              Real-time log of all system activities
            </SheetDescription>
          </SheetHeader>

          {/* Filters */}
          <div className="mt-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[hsl(120,15%,45%)]" />
              <Input
                placeholder="Search activities..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-[hsl(120,18%,8%)] border-[hsl(120,25%,25%)] text-[hsl(120,15%,80%)] placeholder:text-[hsl(120,10%,40%)] focus-visible:ring-[hsl(120,40%,35%)]"
              />
            </div>
            <div className="flex gap-2">
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="h-7 text-[10px] bg-[hsl(120,18%,8%)] border-[hsl(120,25%,25%)] text-[hsl(120,15%,70%)]">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[hsl(120,18%,12%)] border-[hsl(120,25%,25%)] text-[hsl(120,15%,80%)]">
                  <SelectItem value="all">All Entities</SelectItem>
                  {entityTypes.map(t => (
                    <SelectItem key={t} value={t}>{ENTITY_CONFIG[t]?.label || t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="h-7 text-[10px] bg-[hsl(120,18%,8%)] border-[hsl(120,25%,25%)] text-[hsl(120,15%,70%)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[hsl(120,18%,12%)] border-[hsl(120,25%,25%)] text-[hsl(120,15%,80%)]">
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="updated">Updated</SelectItem>
                  <SelectItem value="deleted">Deleted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Log entries */}
        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="p-3 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[hsl(120,40%,45%)]" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-[hsl(120,15%,45%)] text-sm">
                <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No audit entries found
              </div>
            ) : (
              <>
                <p className="text-[10px] text-[hsl(120,15%,45%)] px-1">{filtered.length} entries</p>
                {filtered.map(entry => (
                  <AuditEntryCard key={entry.id} entry={entry} profiles={profiles} />
                ))}
                {filtered.length >= limit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-[hsl(120,30%,50%)] hover:text-[hsl(120,40%,60%)] hover:bg-[hsl(120,20%,15%)] text-xs"
                    onClick={() => setLimit(l => l + 50)}
                  >
                    Load more...
                  </Button>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  BarChart3, ShieldAlert, Plus, Search, RefreshCw, Download, FileText,
  FileSpreadsheet, Pencil, ChevronDown, ChevronRight, X, TrendingUp,
  TrendingDown, Minus, Clock, MapPin, CalendarDays, Printer, Users,
  Navigation, Map, CalendarIcon
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import OperationsMap from "@/components/enforcement/OperationsMap";
import { PrintColumnDialog, ViewDetailDialog, OperationRowActions, type OpRecord } from "@/components/enforcement/OperationActions";
import { GhanaGPSInput, canonicalizeGpsLocation, isValidGpsLocation } from "@/components/shared/GhanaGPSInput";
import { MugshotUpload } from "@/components/enforcement/MugshotUpload";
import { AuthorisedByPicker } from "@/components/enforcement/AuthorisedByPicker";
import { useEffect } from "react";
import { toast } from "sonner";
import { ExportMenu } from "@/components/ui/export-menu";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ALLOWED_ROLES = ["admin", "oic", "2ic", "supervisor", "shift_supervisor", "deputy_shift_supervisor"];
const SEVERITY_COLORS: Record<string, string> = { low: "bg-green-100 text-green-800", medium: "bg-yellow-100 text-yellow-800", high: "bg-orange-100 text-orange-800", critical: "bg-red-100 text-red-800" };
const STATUS_COLORS: Record<string, string> = { open: "bg-blue-100 text-blue-800", in_progress: "bg-amber-100 text-amber-800", closed: "bg-muted text-muted-foreground", resolved: "bg-green-100 text-green-800" };
const PIE_COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4"];

const OPERATION_TYPES = [
  { value: "arrest", label: "Arrest" },
  { value: "deportation", label: "Deportation" },
  { value: "patrol", label: "Patrol" },
  { value: "checkpoint", label: "Checkpoint" },
  { value: "interception", label: "Interception" },
  { value: "overstay", label: "Overstay" },
  { value: "illegal_entry", label: "Illegal Entry" },
];

const SEVERITIES = ["low", "medium", "high", "critical"];
const STATUSES = ["open", "in_progress", "closed", "resolved"];

type EnforcementOp = {
  id: string;
  operation_type: string;
  operation_date: string;
  location: string | null;
  description: string | null;
  severity: string;
  suspects_count: number;
  arrests_count: number;
  officer_in_charge: string | null;
  department_id: string | null;
  reported_by: string;
  status: string;
  outcome: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function getDateRange(period: string) {
  const now = new Date();
  const start = new Date(now);
  switch (period) {
    case "daily": start.setHours(0, 0, 0, 0); break;
    case "weekly": start.setDate(now.getDate() - 7); break;
    case "monthly": start.setMonth(now.getMonth() - 1); break;
    case "quarterly": start.setMonth(now.getMonth() - 3); break;
    case "annually": start.setFullYear(now.getFullYear() - 1); break;
  }
  return start.toISOString().split("T")[0];
}

function getPreviousDateRange(period: string) {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  switch (period) {
    case "daily":
      end.setDate(now.getDate() - 1); end.setHours(23, 59, 59);
      start.setDate(now.getDate() - 1); start.setHours(0, 0, 0, 0);
      break;
    case "weekly":
      end.setDate(now.getDate() - 7);
      start.setDate(now.getDate() - 14);
      break;
    case "monthly":
      end.setMonth(now.getMonth() - 1);
      start.setMonth(now.getMonth() - 2);
      break;
    case "quarterly":
      end.setMonth(now.getMonth() - 3);
      start.setMonth(now.getMonth() - 6);
      break;
    case "annually":
      end.setFullYear(now.getFullYear() - 1);
      start.setFullYear(now.getFullYear() - 2);
      break;
  }
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

const INITIAL_FORM = {
  operation_type: "patrol",
  operation_date: new Date().toISOString().split("T")[0],
  location: "",
  description: "",
  severity: "medium",
  suspects_count: 0,
  arrests_count: 0,
  status: "open",
  outcome: "",
  notes: "",
  officer_in_charge: "" as string,
  contact_details: "",
  mugshot_path: null as string | null,
  authorized_by: null as string | null,
};

// GhanaGPSButton was inlined here; the shared GhanaGPSInput component
// (manual digital address + live GPS capture) now lives in
// `src/components/shared/GhanaGPSInput.tsx` so every module that records a
// location stores the same canonical GPS string.


function StaffPickerDialog({ value, onChange, profiles }: {
  value: string;
  onChange: (id: string, name: string) => void;
  profiles: { id: string; first_name: string; last_name: string; user_id: string | null; ranks: { abbreviation: string } | null; departments: { name: string } | null }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return profiles;
    const q = search.toLowerCase();
    return profiles.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      (p.ranks?.abbreviation || "").toLowerCase().includes(q) ||
      (p.departments?.name || "").toLowerCase().includes(q)
    );
  }, [profiles, search]);

  const selectedStaff = useMemo(() => {
    if (!value) return null;
    return profiles.find(p => p.user_id === value || p.id === value) || null;
  }, [value, profiles]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-start text-left font-normal h-10">
          {selectedStaff ? (
            <span className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              {selectedStaff.ranks?.abbreviation && <span className="text-xs font-semibold text-primary">{selectedStaff.ranks.abbreviation}</span>}
              {selectedStaff.first_name} {selectedStaff.last_name}
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              Select officer / staff...
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Intel By (Officer)
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, rank or department..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" autoFocus />
        </div>
        <div className="max-h-[300px] overflow-y-auto border rounded-md divide-y">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No staff found</div>
          ) : (
            filtered.map(p => {
              const isSelected = value === (p.user_id || p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors cursor-pointer ${isSelected ? "bg-primary/10" : ""}`}
                  onClick={() => { onChange(p.user_id || p.id, `${p.first_name} ${p.last_name}`); setOpen(false); setSearch(""); }}
                >
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                    {p.first_name[0]}{p.last_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-1.5">
                      {p.ranks?.abbreviation && <Badge variant="outline" className="text-[10px] px-1 py-0 font-semibold">{p.ranks.abbreviation}</Badge>}
                      {p.first_name} {p.last_name}
                    </div>
                    {p.departments?.name && <div className="text-xs text-muted-foreground truncate">{p.departments.name}</div>}
                  </div>
                  {isSelected && <Badge variant="secondary" className="text-xs shrink-0">Selected</Badge>}
                </button>
              );
            })
          )}
        </div>
        {value && (
          <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => { onChange("", ""); setOpen(false); }}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear selection
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OperationForm({ form, setForm, onSubmit, onCancel, isPending, submitLabel, profiles }: {
  form: typeof INITIAL_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof INITIAL_FORM>>;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  submitLabel: string;
  profiles: { id: string; first_name: string; last_name: string; user_id: string | null; ranks: { abbreviation: string } | null; departments: { name: string } | null }[];
}) {
  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSubmit(); }}>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Operation Type *</Label>
          <Select value={form.operation_type} onValueChange={v => setForm(p => ({ ...p, operation_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPERATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Date *</Label>
          <Input type="date" value={form.operation_date} onChange={e => setForm(p => ({ ...p, operation_date: e.target.value }))} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Location</Label>
        <Input placeholder="e.g. Amasaman Barrier, Pokuase — or use the digital address / GPS below" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
        <GhanaGPSInput onAddress={(addr) => setForm(p => ({ ...p, location: addr }))} />
      </div>
      <div className="space-y-2">
        <Label>Intel By (Officer)</Label>
        <StaffPickerDialog value={form.officer_in_charge} onChange={(id) => setForm(p => ({ ...p, officer_in_charge: id }))} profiles={profiles} />
      </div>
      <div className="space-y-2">
        <Label>Contact Details</Label>
        <Input placeholder="Phone number, email or other contact info..." value={form.contact_details} onChange={e => setForm(p => ({ ...p, contact_details: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea placeholder="Brief description of the operation..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Severity *</Label>
          <Select value={form.severity} onValueChange={v => setForm(p => ({ ...p, severity: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SEVERITIES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status *</Label>
          <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Suspects Count</Label>
          <Input type="number" min={0} value={form.suspects_count} onChange={e => setForm(p => ({ ...p, suspects_count: parseInt(e.target.value) || 0 }))} />
        </div>
        <div className="space-y-2">
          <Label>Arrests Count</Label>
          <Input type="number" min={0} value={form.arrests_count} onChange={e => setForm(p => ({ ...p, arrests_count: parseInt(e.target.value) || 0 }))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Outcome</Label>
        <Input placeholder="e.g. Suspects detained, referred to HQ..." value={form.outcome} onChange={e => setForm(p => ({ ...p, outcome: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea placeholder="Additional notes..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
      </div>
      <div className="space-y-2">
        <Label>Suspect Mugshot Photo</Label>
        <MugshotUpload
          value={form.mugshot_path}
          onChange={(path) => setForm(p => ({ ...p, mugshot_path: path }))}
          folder="enforcement"
        />
      </div>
      <div className="space-y-2">
        <Label>Authorised By (OIC / 2IC) *</Label>
        <AuthorisedByPicker
          value={form.authorized_by}
          onChange={(id) => setForm(p => ({ ...p, authorized_by: id }))}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}

export default function Enforcement() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [period, setPeriod] = useState("monthly");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterOfficer, setFilterOfficer] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingOp, setEditingOp] = useState<EnforcementOp | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [showPrintCols, setShowPrintCols] = useState(false);
  const [viewingOp, setViewingOp] = useState<EnforcementOp | null>(null);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("enforcement-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "enforcement_operations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["enforcement-ops"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: operations = [], isLoading } = useQuery({
    queryKey: ["enforcement-ops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enforcement_operations")
        .select("*")
        .order("operation_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EnforcementOp[];
    },
    refetchInterval: 30_000,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-enforcement"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, user_id, rank_id, department_id, ranks(abbreviation), departments(name)")
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as { id: string; first_name: string; last_name: string; user_id: string | null; rank_id: string | null; department_id: string | null; ranks: { abbreviation: string } | null; departments: { name: string } | null }[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: typeof INITIAL_FORM) => {
      const canonicalLocation = canonicalizeGpsLocation(values.location);
      if (!isValidGpsLocation(canonicalLocation)) {
        throw new Error("Invalid GPS digital address. Use format XX-###-#### e.g. GA-123-4567");
      }
      if (!values.authorized_by) {
        throw new Error("Please select the authorising OIC or 2IC.");
      }
      const { error } = await supabase.from("enforcement_operations").insert({
        operation_type: values.operation_type,
        operation_date: values.operation_date,
        location: canonicalLocation,
        description: values.description || null,
        severity: values.severity,
        suspects_count: values.suspects_count,
        arrests_count: values.arrests_count,
        status: values.status,
        outcome: values.outcome || null,
        notes: values.notes || null,
        reported_by: user?.id ?? "",
        officer_in_charge: values.officer_in_charge || null,
        contact_details: values.contact_details || null,
        mugshot_path: values.mugshot_path,
        authorized_by: values.authorized_by,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enforcement operation recorded");
      queryClient.invalidateQueries({ queryKey: ["enforcement-ops"] });
      setShowForm(false);
      setForm(INITIAL_FORM);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: typeof INITIAL_FORM }) => {
      const canonicalLocation = canonicalizeGpsLocation(values.location);
      if (!isValidGpsLocation(canonicalLocation)) {
        throw new Error("Invalid GPS digital address. Use format XX-###-#### e.g. GA-123-4567");
      }
      if (!values.authorized_by) {
        throw new Error("Please select the authorising OIC or 2IC.");
      }
      const { error } = await supabase.from("enforcement_operations").update({
        operation_type: values.operation_type,
        operation_date: values.operation_date,
        location: canonicalLocation,
        description: values.description || null,
        severity: values.severity,
        suspects_count: values.suspects_count,
        arrests_count: values.arrests_count,
        status: values.status,
        outcome: values.outcome || null,
        notes: values.notes || null,
        officer_in_charge: values.officer_in_charge || null,
        contact_details: values.contact_details || null,
        mugshot_path: values.mugshot_path,
        authorized_by: values.authorized_by,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Operation updated");
      queryClient.invalidateQueries({ queryKey: ["enforcement-ops"] });
      setEditingOp(null);
      setForm(INITIAL_FORM);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEdit = useCallback((op: EnforcementOp) => {
    setEditingOp(op);
    setForm({
      operation_type: op.operation_type,
      operation_date: op.operation_date,
      location: op.location || "",
      description: op.description || "",
      severity: op.severity,
      suspects_count: op.suspects_count,
      arrests_count: op.arrests_count,
      status: op.status,
      outcome: op.outcome || "",
      notes: op.notes || "",
      officer_in_charge: op.officer_in_charge || "",
      contact_details: (op as any).contact_details || "",
    });
  }, []);

  const startDate = getDateRange(period);
  const prevRange = getPreviousDateRange(period);
  const filtered = useMemo(() => operations.filter(op => op.operation_date >= startDate), [operations, startDate]);
  const prevFiltered = useMemo(() => operations.filter(op => op.operation_date >= prevRange.start && op.operation_date < prevRange.end), [operations, prevRange]);
  const searched = useMemo(() => {
    let result = filtered;
    if (filterType !== "all") result = result.filter(op => op.operation_type === filterType);
    if (filterSeverity !== "all") result = result.filter(op => op.severity === filterSeverity);
    if (filterStatus !== "all") result = result.filter(op => op.status === filterStatus);
    if (filterOfficer !== "all") result = result.filter(op => op.officer_in_charge === filterOfficer);
    if (dateFrom) {
      const fromStr = format(dateFrom, "yyyy-MM-dd");
      result = result.filter(op => op.operation_date >= fromStr);
    }
    if (dateTo) {
      const toStr = format(dateTo, "yyyy-MM-dd");
      result = result.filter(op => op.operation_date <= toStr);
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(op =>
        op.operation_type.toLowerCase().includes(q) ||
        op.location?.toLowerCase().includes(q) ||
        op.status.toLowerCase().includes(q) ||
        op.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [filtered, searchTerm, filterType, filterSeverity, filterStatus, filterOfficer, dateFrom, dateTo]);

  const searchedTotalSuspects = useMemo(() => searched.reduce((s, o) => s + o.suspects_count, 0), [searched]);
  const searchedTotalArrests = useMemo(() => searched.reduce((s, o) => s + o.arrests_count, 0), [searched]);

  const totalOps = filtered.length;
  const totalArrests = filtered.reduce((s, o) => s + o.arrests_count, 0);
  const totalSuspects = filtered.reduce((s, o) => s + o.suspects_count, 0);
  const criticalOps = filtered.filter(o => o.severity === "critical" || o.severity === "high").length;

  const prevTotalOps = prevFiltered.length;
  const prevTotalArrests = prevFiltered.reduce((s, o) => s + o.arrests_count, 0);
  const prevTotalSuspects = prevFiltered.reduce((s, o) => s + o.suspects_count, 0);
  const prevCriticalOps = prevFiltered.filter(o => o.severity === "critical" || o.severity === "high").length;

  const calcChange = (curr: number, prev: number) => {
    if (prev === 0 && curr === 0) return 0;
    if (prev === 0) return 100;
    return Math.round(((curr - prev) / prev) * 100);
  };

  const recentOps = useMemo(() => operations.slice(0, 5), [operations]);

  const typeBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(op => { map[op.operation_type] = (map[op.operation_type] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [filtered]);

  const statusBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(op => { map[op.status] = (map[op.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [filtered]);

  const trendData = useMemo(() => {
    const map: Record<string, { date: string; operations: number; arrests: number }> = {};
    filtered.forEach(op => {
      const d = op.operation_date;
      if (!map[d]) map[d] = { date: d, operations: 0, arrests: 0 };
      map[d].operations++;
      map[d].arrests += op.arrests_count;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  }, [filtered]);

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOfWeekData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    filtered.forEach(op => {
      const day = new Date(op.operation_date + "T00:00:00").getDay();
      counts[day]++;
    });
    const max = Math.max(...counts, 1);
    return DAYS.map((name, i) => ({ name, count: counts[i], intensity: counts[i] / max }));
  }, [filtered]);

  const topLocations = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(op => {
      const loc = op.location?.trim();
      if (loc) map[loc] = (map[loc] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([location, count]) => ({ location, count }));
  }, [filtered]);

  const officerPerformance = useMemo(() => {
    const map: Record<string, { name: string; ops: number; arrests: number; suspects: number }> = {};
    filtered.forEach(op => {
      const uid = op.reported_by;
      if (!map[uid]) {
        const profile = profiles.find(p => p.user_id === uid);
        map[uid] = { name: profile ? `${profile.first_name} ${profile.last_name}` : "Unknown Officer", ops: 0, arrests: 0, suspects: 0 };
      }
      map[uid].ops++;
      map[uid].arrests += op.arrests_count;
      map[uid].suspects += op.suspects_count;
    });
    return Object.values(map).sort((a, b) => b.ops - a.ops).slice(0, 5);
  }, [filtered, profiles]);

  const handlePrint = useCallback(() => {
    const resRate = totalOps > 0 ? Math.round((filtered.filter(o => o.status === "resolved" || o.status === "closed").length / totalOps) * 100) : 0;
    const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow popups"); return; }
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Enforcement Summary Report</title>
      <style>
        body{font-family:Arial,sans-serif;padding:40px;color:#333}
        h1{font-size:20px;border-bottom:2px solid #166534;padding-bottom:8px;color:#166534}
        h2{font-size:15px;margin-top:24px;color:#166534}
        .meta{font-size:12px;color:#666;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f0fdf4;font-weight:600}
        .kpi-row{display:flex;gap:16px;margin:16px 0}
        .kpi{flex:1;border:1px solid #ddd;border-radius:6px;padding:12px;text-align:center}
        .kpi-val{font-size:22px;font-weight:bold;color:#166534}
        .kpi-label{font-size:11px;color:#666}
        @media print{body{padding:20px}}
      </style></head><body>
      <h1>🛡️ Enforcement Summary Report</h1>
      <div class="meta">Ghana Immigration Service — Amasaman Sector Command<br/>
        Period: ${period.charAt(0).toUpperCase() + period.slice(1)} (${format(new Date(startDate), "dd MMM yyyy")} – ${format(new Date(), "dd MMM yyyy")})<br/>
        Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}</div>
      <div class="kpi-row">
        <div class="kpi"><div class="kpi-val">${totalOps}</div><div class="kpi-label">Operations</div></div>
        <div class="kpi"><div class="kpi-val">${totalArrests}</div><div class="kpi-label">Arrests</div></div>
        <div class="kpi"><div class="kpi-val">${totalSuspects}</div><div class="kpi-label">Suspects</div></div>
        <div class="kpi"><div class="kpi-val">${criticalOps}</div><div class="kpi-label">High/Critical</div></div>
        <div class="kpi"><div class="kpi-val">${resRate}%</div><div class="kpi-label">Resolution Rate</div></div>
      </div>
      <h2>Officer Performance</h2>
      <table><tr><th>#</th><th>Officer</th><th>Operations</th><th>Arrests</th><th>Suspects</th></tr>
        ${officerPerformance.map((o, i) => `<tr><td>${i + 1}</td><td>${esc(o.name)}</td><td>${o.ops}</td><td>${o.arrests}</td><td>${o.suspects}</td></tr>`).join("")}
      </table>
      <h2>Top Locations</h2>
      <table><tr><th>#</th><th>Location</th><th>Operations</th></tr>
        ${topLocations.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.location)}</td><td>${l.count}</td></tr>`).join("")}
      </table>
      <h2>Operations by Type</h2>
      <table><tr><th>Type</th><th>Count</th></tr>
        ${typeBreakdown.map(t => `<tr><td style="text-transform:capitalize">${esc(t.name)}</td><td>${t.value}</td></tr>`).join("")}
      </table>
    </body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  }, [totalOps, totalArrests, totalSuspects, criticalOps, filtered, officerPerformance, topLocations, typeBreakdown, period, startDate]);

  const buildEnforcementExportData = useCallback(() => {
    const headers = ["Date", "Type", "Location", "Severity", "Suspects", "Arrests", "Status", "Outcome"];
    const rows = searched.map(op => [
      format(new Date(op.operation_date), "dd MMM yyyy"),
      op.operation_type.replace(/_/g, " "),
      op.location || "—",
      op.severity,
      String(op.suspects_count),
      String(op.arrests_count),
      op.status.replace(/_/g, " "),
      op.outcome || "—",
    ]);
    return {
      title: `Enforcement Report — ${period.charAt(0).toUpperCase() + period.slice(1)}`,
      subtitle: `Period: ${format(new Date(startDate), "dd MMM yyyy")} to ${format(new Date(), "dd MMM yyyy")} | ${searched.length} operations`,
      filename: `enforcement-report-${period}-${format(new Date(), "yyyy-MM-dd")}`,
      headers,
      rows,
    };
  }, [searched, period, startDate]);

  const buildOfficerExportData = useCallback(() => {
    const headers = ["#", "Officer", "Operations", "Arrests", "Suspects", "Arrest Rate"];
    const rows = officerPerformance.map((o, i) => [
      String(i + 1), o.name, String(o.ops), String(o.arrests), String(o.suspects),
      `${o.suspects > 0 ? Math.round((o.arrests / o.suspects) * 100) : 0}%`,
    ]);
    return {
      title: `Officer Performance Report — ${period.charAt(0).toUpperCase() + period.slice(1)}`,
      subtitle: `Period: ${format(new Date(startDate), "dd MMM yyyy")} to ${format(new Date(), "dd MMM yyyy")}`,
      filename: `officer-performance-${period}-${format(new Date(), "yyyy-MM-dd")}`,
      headers,
      rows,
    };
  }, [officerPerformance, period, startDate]);

  if (role && !ALLOWED_ROLES.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-secondary">Enforcement</h1>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="annually">Annually</SelectItem>
            </SelectContent>
          </Select>
          <ExportMenu iconOnly variant="outline" size="icon" getData={buildEnforcementExportData} />
          <Button variant="outline" size="icon" onClick={handlePrint} title="Print Summary Report"><Printer className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => setShowPrintCols(true)} title="Print with Column Selection"><FileText className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ["enforcement-ops"] })}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="dashboard" className="gap-1 text-xs sm:text-sm"><BarChart3 className="h-4 w-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="operations" className="gap-1 text-xs sm:text-sm"><ShieldAlert className="h-4 w-4 text-primary" /> Operations Log</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6 mt-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Operations</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{totalOps}</div><p className="text-xs text-muted-foreground capitalize">{period} period</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Arrests</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-destructive">{totalArrests}</div><p className="text-xs text-muted-foreground">{totalSuspects} suspects</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">High/Critical</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-warning">{criticalOps}</div><p className="text-xs text-muted-foreground">severity cases</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Resolution Rate</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {totalOps > 0 ? Math.round((filtered.filter(o => o.status === "resolved" || o.status === "closed").length / totalOps) * 100) : 0}%
                </div>
                <p className="text-xs text-muted-foreground">closed/resolved</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Operations by Type</CardTitle></CardHeader>
              <CardContent className="h-[280px]">
                {typeBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={typeBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data for this period</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Status Distribution</CardTitle></CardHeader>
              <CardContent className="h-[280px]">
                {statusBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusBreakdown} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {statusBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data for this period</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Trend Line */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Operations & Arrests Trend</CardTitle></CardHeader>
            <CardContent className="h-[280px]">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="operations" stroke="hsl(var(--primary))" strokeWidth={2} />
                    <Line type="monotone" dataKey="arrests" stroke="hsl(var(--destructive))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No trend data available</div>
              )}
            </CardContent>
          </Card>

          {/* Period Comparison & Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Period Comparison — vs Previous {period}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Operations", current: totalOps, previous: prevTotalOps },
                  { label: "Arrests", current: totalArrests, previous: prevTotalArrests },
                  { label: "Suspects", current: totalSuspects, previous: prevTotalSuspects },
                  { label: "High/Critical", current: criticalOps, previous: prevCriticalOps },
                ].map(({ label, current, previous }) => {
                  const change = calcChange(current, previous);
                  const isUp = change > 0;
                  const isDown = change < 0;
                  return (
                    <div key={label} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{current} current · {previous} previous</p>
                      </div>
                      <div className={`flex items-center gap-1 text-sm font-semibold ${isUp ? "text-destructive" : isDown ? "text-green-600" : "text-muted-foreground"}`}>
                        {isUp ? <TrendingUp className="h-4 w-4" /> : isDown ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                        {change > 0 ? "+" : ""}{change}%
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4" /> Recent Activity</CardTitle></CardHeader>
              <CardContent>
                {recentOps.length > 0 ? (
                  <div className="space-y-4">
                    {recentOps.map((op, idx) => (
                      <div key={op.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${op.status === "open" ? "bg-blue-500" : op.status === "in_progress" ? "bg-amber-500" : op.status === "resolved" ? "bg-green-500" : "bg-muted-foreground"}`} />
                          {idx < recentOps.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium capitalize">{op.operation_type.replace(/_/g, " ")}</p>
                            <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[op.severity] || ""}`}>{op.severity}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(op.operation_date), "dd MMM yyyy")}{op.location ? ` · ${op.location}` : ""}
                          </p>
                          <div className="flex gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground">{op.suspects_count} suspects</span>
                            <span className="text-[10px] text-muted-foreground">{op.arrests_count} arrests</span>
                            <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[op.status] || ""}`}>{op.status.replace(/_/g, " ")}</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No recent activity</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Heatmap & Top Locations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Operations by Day of Week</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2">
                  {dayOfWeekData.map(d => (
                    <div key={d.name} className="flex flex-col items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">{d.name}</span>
                      <div
                        className="w-full aspect-square rounded-md flex items-center justify-center text-xs font-bold transition-colors"
                        style={{
                          backgroundColor: d.count === 0 ? "hsl(var(--muted))" : `hsl(142 ${Math.round(40 + d.intensity * 40)}% ${document.documentElement.classList.contains("dark") ? Math.round(20 + d.intensity * 25) : Math.round(85 - d.intensity * 50)}%)`,
                          color: d.count === 0 ? "hsl(var(--muted-foreground))" : document.documentElement.classList.contains("dark") ? d.intensity > 0.3 ? "hsl(142 80% 90%)" : "hsl(var(--foreground))" : d.intensity > 0.5 ? "hsl(var(--background))" : "hsl(var(--foreground))",
                        }}
                      >
                        {d.count}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <span className="text-[10px] text-muted-foreground">Less</span>
                  {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
                    <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: v === 0 ? "hsl(var(--muted))" : `hsl(142 ${Math.round(40 + v * 40)}% ${document.documentElement.classList.contains("dark") ? Math.round(20 + v * 25) : Math.round(85 - v * 50)}%)` }} />
                  ))}
                  <span className="text-[10px] text-muted-foreground">More</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><MapPin className="h-4 w-4" /> Top Locations</CardTitle></CardHeader>
              <CardContent>
                {topLocations.length > 0 ? (
                  <div className="space-y-3">
                    {topLocations.map((loc, idx) => {
                      const maxCount = topLocations[0].count;
                      const pct = Math.round((loc.count / maxCount) * 100);
                      return (
                        <div key={loc.location} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
                              {loc.location}
                            </span>
                            <span className="text-sm font-semibold">{loc.count}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No location data available</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Operations Map */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><Map className="h-4 w-4" /> Operations Map</CardTitle></CardHeader>
            <CardContent>
              <OperationsMap operations={filtered} />
            </CardContent>
          </Card>

          {/* Officer Performance */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4" /> Officer Performance Summary</CardTitle>
              <ExportMenu getData={buildOfficerExportData} />
            </CardHeader>
            <CardContent>
              {officerPerformance.length > 0 ? (
                <div className="rounded-md border overflow-x-auto" style={{ minWidth: 700 }}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Officer</TableHead>
                        <TableHead className="text-right">Operations</TableHead>
                        <TableHead className="text-right">Arrests</TableHead>
                        <TableHead className="text-right">Suspects</TableHead>
                        <TableHead className="text-right">Arrest Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {officerPerformance.map((o, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{o.name}</TableCell>
                          <TableCell className="text-right">{o.ops}</TableCell>
                          <TableCell className="text-right font-semibold text-destructive">{o.arrests}</TableCell>
                          <TableCell className="text-right">{o.suspects}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="text-xs">{o.suspects > 0 ? Math.round((o.arrests / o.suspects) * 100) : 0}%</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No officer data for this period</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operations" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search operations..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {OPERATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-[120px]"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                {SEVERITIES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterOfficer} onValueChange={setFilterOfficer}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Intel By" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Officers</SelectItem>
                {(() => {
                  const officerIds = [...new Set(operations.filter(op => op.officer_in_charge).map(op => op.officer_in_charge!))];
                  return officerIds.map(id => {
                    const p = profiles.find(pr => pr.user_id === id || pr.id === id);
                    const label = p ? `${p.ranks?.abbreviation ? p.ranks.abbreviation + ". " : ""}${p.first_name} ${p.last_name}` : id;
                    return <SelectItem key={id} value={id}>{label}</SelectItem>;
                  });
                })()}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                  {dateFrom ? format(dateFrom, "dd/MM/yy") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                  {dateTo ? format(dateTo, "dd/MM/yy") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1"><CalendarDays className="h-3.5 w-3.5" /> Quick Select</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => { const today = new Date(); today.setHours(0, 0, 0, 0); setDateFrom(today); setDateTo(today); }}>Today</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { const today = new Date(); const last7 = new Date(); last7.setDate(today.getDate() - 7); setDateFrom(last7); setDateTo(today); }}>Last 7 Days</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { const today = new Date(); const last30 = new Date(); last30.setDate(today.getDate() - 30); setDateFrom(last30); setDateTo(today); }}>Last 30 Days</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="outline" size="sm" onClick={() => { setFilterType("all"); setFilterSeverity("all"); setFilterStatus("all"); setFilterOfficer("all"); setDateFrom(undefined); setDateTo(undefined); setSearchTerm(""); }} className="gap-1">
              <X className="h-4 w-4" /> Clear Filters
            </Button>

            <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setForm(INITIAL_FORM); }}>
              <DialogTrigger asChild>
                <Button className="gap-1"><Plus className="h-4 w-4" /> New Operation</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Record Enforcement Operation</DialogTitle></DialogHeader>
                <OperationForm form={form} setForm={setForm} onSubmit={() => createMutation.mutate(form)} onCancel={() => setShowForm(false)} isPending={createMutation.isPending} submitLabel="Record Operation" profiles={profiles} />
              </DialogContent>
            </Dialog>

            <Dialog open={!!editingOp} onOpenChange={(open) => { if (!open) { setEditingOp(null); setForm(INITIAL_FORM); } }}>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Edit Enforcement Operation</DialogTitle></DialogHeader>
                <OperationForm form={form} setForm={setForm} onSubmit={() => editingOp && updateMutation.mutate({ id: editingOp.id, values: form })} onCancel={() => { setEditingOp(null); setForm(INITIAL_FORM); }} isPending={updateMutation.isPending} submitLabel="Update Operation" profiles={profiles} />
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : searched.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No enforcement operations found for this period.</CardContent></Card>
          ) : (
            <div className="rounded-md border overflow-x-auto" style={{ minWidth: 700 }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Intel By</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead className="text-right">Suspects</TableHead>
                    <TableHead className="text-right">Arrests</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searched.slice(0, 100).map(op => (
                    <React.Fragment key={op.id}>
                      <TableRow className="cursor-pointer" onClick={() => setExpandedId(prev => prev === op.id ? null : op.id)}>
                        <TableCell className="whitespace-nowrap">
                          {expandedId === op.id ? <ChevronDown className="inline h-3 w-3 mr-1" /> : <ChevronRight className="inline h-3 w-3 mr-1" />}
                          {new Date(op.operation_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="capitalize whitespace-nowrap">{op.operation_type.replace(/_/g, " ")}</TableCell>
                        <TableCell>{op.location || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {op.officer_in_charge
                            ? (() => { const p = profiles.find(pr => pr.user_id === op.officer_in_charge || pr.id === op.officer_in_charge); return p ? `${p.first_name} ${p.last_name}` : "—"; })()
                            : "—"}
                        </TableCell>
                        <TableCell><Badge className={SEVERITY_COLORS[op.severity] || ""}>{op.severity}</Badge></TableCell>
                        <TableCell className="text-right">{op.suspects_count}</TableCell>
                        <TableCell className="text-right font-medium">{op.arrests_count}</TableCell>
                        <TableCell><Badge className={STATUS_COLORS[op.status] || ""}>{op.status.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell className="text-center">
                          <OperationRowActions
                            op={op as unknown as OpRecord}
                            profiles={profiles}
                            moduleTitle="Enforcement Operation"
                            onEdit={(o) => openEdit(o as unknown as EnforcementOp)}
                            onView={(o) => setViewingOp(o as unknown as EnforcementOp)}
                            table="enforcement_operations"
                            queryKey={["enforcement-ops"]}
                          />
                        </TableCell>
                      </TableRow>
                      {expandedId === op.id && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={9} className="py-4 px-6">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="font-medium text-muted-foreground mb-1">Description</p>
                                <p>{op.description || "No description provided"}</p>
                              </div>
                              <div>
                                <p className="font-medium text-muted-foreground mb-1">Outcome</p>
                                <p>{op.outcome || "Pending"}</p>
                              </div>
                              <div>
                                <p className="font-medium text-muted-foreground mb-1">Intel By</p>
                                <p className="flex items-center gap-1.5">
                                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                  {op.officer_in_charge
                                    ? (() => { const p = profiles.find(pr => pr.user_id === op.officer_in_charge || pr.id === op.officer_in_charge); return p ? `${p.first_name} ${p.last_name}` : "Unknown"; })()
                                    : "Not assigned"}
                                </p>
                              </div>
                              <div>
                                <p className="font-medium text-muted-foreground mb-1">Contact Details</p>
                                <p>{(op as any).contact_details || "—"}</p>
                              </div>
                              <div>
                                <p className="font-medium text-muted-foreground mb-1">Notes</p>
                                <p>{op.notes || "No additional notes"}</p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
                <tfoot>
                  <tr className="border-t bg-muted/50 font-medium">
                    <td className="p-4" colSpan={5}><span className="text-sm text-muted-foreground">Totals ({searched.length} operations)</span></td>
                    <td className="p-4 text-right text-sm font-bold">{searchedTotalSuspects}</td>
                    <td className="p-4 text-right text-sm font-bold">{searchedTotalArrests}</td>
                    <td className="p-4" colSpan={2}></td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <PrintColumnDialog
        open={showPrintCols}
        onOpenChange={setShowPrintCols}
        operations={searched as unknown as OpRecord[]}
        profiles={profiles}
        title="Enforcement Operations"
      />
      <ViewDetailDialog
        op={viewingOp as unknown as OpRecord | null}
        open={!!viewingOp}
        onOpenChange={(v) => { if (!v) setViewingOp(null); }}
        profiles={profiles}
        moduleTitle="Enforcement Operation"
      />
    </div>
  );
}

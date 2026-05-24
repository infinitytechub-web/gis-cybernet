import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { openPrintWindow } from "@/lib/safe-print";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ExportMenu } from "@/components/ui/export-menu";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { MultiContactInput } from "@/components/ui/multi-contact-input";
import { ShieldAlert, Lock, Plus, Search, Camera, AlertTriangle, UserCheck, Package, Heart, ArrowRightLeft, Users, Activity, BarChart3, FileSearch, X, Stethoscope, Eye, Pencil, Printer, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { softDelete } from "@/lib/recycle-bin";
import { toast } from "sonner";
import { format, formatDistanceToNow, differenceInHours } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

const PIE_COLORS = ["hsl(var(--primary))", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];
const STATUS_COLORS: Record<string, string> = {
  in_custody: "bg-rose-100 text-rose-800 dark:bg-rose-950/40",
  bail: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40",
  released: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40",
  deported: "bg-purple-100 text-purple-800 dark:bg-purple-950/40",
  transferred: "bg-blue-100 text-blue-800 dark:bg-blue-950/40",
  court: "bg-amber-100 text-amber-800 dark:bg-amber-950/40",
  escaped: "bg-red-200 text-red-900 dark:bg-red-950/60",
};
const RELEASE_OUTCOMES = [
  { value: "released", label: "Released" },
  { value: "bail", label: "Bail Granted" },
  { value: "deported", label: "Deported" },
  { value: "transferred", label: "Transferred" },
  { value: "court", label: "Sent to Court" },
];
const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-200 text-red-900",
};
const CRIME_TYPES = ["Illegal Entry", "Overstay", "Document Fraud", "Smuggling", "Trafficking", "Assault", "Theft", "Drug Offence", "Other"];

export default function HoldingCenter() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("active");
  const [selected, setSelected] = useState<any>(null);
  const allowed = ["admin", "oic", "2ic", "supervisor", "shift_supervisor", "deputy_shift_supervisor"].includes(role || "");
  const canCreate = allowed;

  useEffect(() => {
    const ch = supabase.channel("holding-realtime");
    ["detention_records", "detention_property_log", "detention_visitor_log", "detention_medical_log", "detention_transfers"].forEach(t =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        qc.invalidateQueries({ queryKey: ["detention_records"] });
        qc.invalidateQueries({ queryKey: ["holding-analytics"] });
        if (selected) qc.invalidateQueries({ queryKey: ["detention-detail", selected.id] });
      })
    );
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, selected]);

  if (!allowed) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-12 text-center">
          <Lock className="h-12 w-12 mx-auto text-destructive mb-3" />
          <p className="font-semibold">Access Restricted</p>
          <p className="text-sm text-muted-foreground">This module is reserved for command and enforcement supervisors.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-rose-600" />
          <div>
            <h1 className="text-2xl font-bold text-secondary">Holding / Detention Center</h1>
            <p className="text-sm text-muted-foreground">Custody management — restricted access · all activity audited</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/50 p-1">
          <TabsTrigger value="active" className="data-[state=active]:bg-rose-600 data-[state=active]:text-white"><UserCheck className="h-4 w-4 mr-1 text-rose-700 dark:text-rose-400" />Active Custody</TabsTrigger>
          <TabsTrigger value="archive" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white"><FileSearch className="h-4 w-4 mr-1 text-slate-700 dark:text-slate-300" />Archive</TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><BarChart3 className="h-4 w-4 mr-1 text-blue-700 dark:text-blue-400" />Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="active"><RecordsList status={["in_custody"]} canCreate={canCreate} userId={user?.id} role={role} onSelect={setSelected} /></TabsContent>
        <TabsContent value="archive"><RecordsList status={["released", "bail", "deported", "transferred", "court", "escaped"]} canCreate={false} userId={user?.id} role={role} onSelect={setSelected} /></TabsContent>
        <TabsContent value="analytics"><HoldingAnalytics /></TabsContent>
      </Tabs>

      {selected && <DetainDetailDrawer record={selected} onClose={() => setSelected(null)} userId={user?.id} role={role} />}
    </div>
  );
}

/* ----------------- LIST ----------------- */
function RecordsList({ status, canCreate, userId, role, onSelect }: { status: string[]; canCreate: boolean; userId?: string; role: string | null; onSelect: (r: any) => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterGender, setFilterGender] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [filterCountry, setFilterCountry] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [deletePending, setDeletePending] = useState(false);

  const isAdmin = role === "admin";
  const isOic = role === "oic";
  const canModify = isAdmin || isOic;

  const { data: records = [] } = useQuery({
    queryKey: ["detention_records", status],
    queryFn: async () => (await supabase.from("detention_records").select("*").in("status", status).order("intake_at", { ascending: false })).data || [],
  });

  const filtered = useMemo(() => records.filter((r: any) => {
    const q = search.toLowerCase();
    if (q && !`${r.first_name} ${r.last_name} ${r.alias || ""} ${r.nationality || ""} ${r.crime_type}`.toLowerCase().includes(q)) return false;
    if (filterGender !== "all" && r.gender !== filterGender) return false;
    if (filterRisk !== "all" && r.risk_level !== filterRisk) return false;
    if (filterCountry && (r.nationality || "").toLowerCase() !== filterCountry.toLowerCase() && (r.country_of_origin || "").toLowerCase() !== filterCountry.toLowerCase()) return false;
    return true;
  }), [records, search, filterGender, filterRisk, filterCountry]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await softDelete({
        table: "detention_records",
        id: deleting.id,
        label: `Detainee: ${deleting.first_name} ${deleting.last_name}`,
        context: `${deleting.crime_type}${deleting.cell_number ? ` · Cell ${deleting.cell_number}` : ""} · Intake ${format(new Date(deleting.intake_at), "dd MMM yyyy")}`,
      });
      toast.success("Record moved to Recycle Bin");
      qc.invalidateQueries({ queryKey: ["detention_records"] });
      setDeleting(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, alias, nationality, crime…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={filterGender} onValueChange={setFilterGender}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All genders</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
        </Select>
        <Select value={filterRisk} onValueChange={setFilterRisk}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All risk</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
        </Select>
        <div className="w-[200px]">
          <CountryCombobox value={filterCountry} onValueChange={setFilterCountry} placeholder="All countries" />
        </div>
        {filterCountry && (
          <Button variant="ghost" size="sm" onClick={() => setFilterCountry("")} className="gap-1">
            <X className="h-3 w-3" /> Clear country
          </Button>
        )}
        <ExportMenu getData={() => ({
          title: "Detention Records",
          filename: `detention-${format(new Date(), "yyyy-MM-dd")}`,
          headers: ["Name", "Gender", "Nationality", "Crime", "Cell", "Intake", "Status", "Risk"],
          rows: filtered.map((r: any) => [`${r.first_name} ${r.last_name}`, r.gender || "-", r.nationality || "-", r.crime_type, r.cell_number || "-", format(new Date(r.intake_at), "yyyy-MM-dd HH:mm"), r.status, r.risk_level]),
        })} />
        {canCreate && <Button onClick={() => setIntakeOpen(true)} className="ml-auto gap-1 bg-rose-600 hover:bg-rose-700"><Plus className="h-4 w-4" />New Intake</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[1000px]">
              <TableHeader><TableRow>
                <TableHead></TableHead><TableHead>Detainee</TableHead><TableHead>Gender</TableHead>
                <TableHead>Nationality</TableHead><TableHead>Crime</TableHead><TableHead>Cell</TableHead>
                <TableHead>Risk</TableHead><TableHead>Status</TableHead><TableHead>Duration</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">No records</TableCell></TableRow>
                : filtered.map((r: any) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-accent/50" onClick={() => onSelect(r)}>
                    <TableCell><Avatar className="h-9 w-9"><AvatarFallback className="bg-rose-100 text-rose-700 text-xs">{r.first_name[0]}{r.last_name[0]}</AvatarFallback></Avatar></TableCell>
                    <TableCell><div className="font-medium">{r.first_name} {r.last_name}</div>{r.alias && <div className="text-xs text-muted-foreground">aka "{r.alias}"</div>}</TableCell>
                    <TableCell className="capitalize">{r.gender || "—"}</TableCell>
                    <TableCell>{r.nationality || "—"}</TableCell>
                    <TableCell>{r.crime_type}</TableCell>
                    <TableCell className="font-mono">{r.cell_number || "—"}</TableCell>
                    <TableCell><Badge className={RISK_COLORS[r.risk_level]}>{r.risk_level}</Badge></TableCell>
                    <TableCell><Badge className={STATUS_COLORS[r.status]}>{r.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatDistanceToNow(new Date(r.intake_at), { addSuffix: false })}</TableCell>
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onSelect(r)} title="View details">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canModify && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(r)} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => printDetentionRecord(r)} title="Print">
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        {canModify && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleting(r)} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {intakeOpen && <IntakeForm onClose={() => setIntakeOpen(false)} userId={userId} />}
      {editing && <EditDetaineeDialog record={editing} onClose={() => setEditing(null)} />}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this detention record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && <>The record for <span className="font-semibold">{deleting.first_name} {deleting.last_name}</span> will be moved to the Recycle Bin and can be restored within 30 days by Admin or Command OIC.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deletePending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletePending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ----------------- PRINT HELPER ----------------- */
function printDetentionRecord(r: any) {
  const esc = (s: any) => String(s ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const isDark = document.documentElement.classList.contains("dark");
  const bg = isDark ? "#1e293b" : "#fff";
  const fg = isDark ? "#e2e8f0" : "#1e293b";
  const border = isDark ? "#334155" : "#e2e8f0";
  const rows: [string, any][] = [
    ["Full Name", `${r.first_name} ${r.last_name}`],
    ["Alias", r.alias],
    ["Gender", r.gender],
    ["Date of Birth", r.date_of_birth ? format(new Date(r.date_of_birth), "dd MMM yyyy") : "—"],
    ["Nationality", r.nationality],
    ["Country of Origin", r.country_of_origin],
    ["ID Type", r.id_type],
    ["ID Number", r.id_number],
    ["Phone", r.phone],
    ["Home Address", r.home_address],
    ["Crime Type", r.crime_type],
    ["Charge Description", r.charge_description],
    ["Location of Arrest", r.location_of_arrest],
    ["Arresting Officer", r.arresting_officer_name],
    ["Cell / Room", r.cell_number],
    ["Risk Level", r.risk_level],
    ["Status", r.status?.replace(/_/g, " ")],
    ["Intake", format(new Date(r.intake_at), "dd MMM yyyy HH:mm")],
    ["Custody Duration", `${differenceInHours(r.released_at ? new Date(r.released_at) : new Date(), new Date(r.intake_at))} hrs`],
    ["Next of Kin", r.next_of_kin],
    ["NoK Phone", r.next_of_kin_phone],
    ["Emergency Contact", r.emergency_contact],
    ["Medical Alerts", r.medical_alerts],
    ["Notes", r.notes],
  ];
  const html = `<!DOCTYPE html><html><head><title>Detention Record — ${esc(r.first_name)} ${esc(r.last_name)}</title>
<style>
  @media print { @page { size: portrait; margin: 14mm; } }
  body { font-family: system-ui, sans-serif; color: ${fg}; background: ${bg}; margin: 0; padding: 18px; }
  h2 { font-size: 16px; margin: 0 0 2px; color: #be123c; }
  h3 { font-size: 13px; margin: 0 0 10px; color: ${fg}; }
  .meta { font-size: 10px; color: #888; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 10px; border: 1px solid ${border}; font-size: 11px; vertical-align: top; }
  td.label { background: ${isDark ? "#334155" : "#f1f5f9"}; font-weight: 600; width: 35%; }
  .footer { text-align: center; margin-top: 18px; font-size: 9px; color: #888; }
</style></head><body>
  <h2>GIS Amasaman Sector Command</h2>
  <h3>Holding / Detention Center — Detainee Record</h3>
  <div class="meta">Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}</div>
  <table><tbody>
    ${rows.map(([label, value]) => `<tr><td class="label">${esc(label)}</td><td>${esc(value)}</td></tr>`).join("")}
  </tbody></table>
  <div class="footer">CONFIDENTIAL — Ghana Immigration Service</div>
</body></html>`;
  openPrintWindow(html, { features: "noopener,noreferrer,width=900,height=700", autoPrint: true, printDelayMs: 500 });
}

/* ----------------- EDIT DIALOG ----------------- */
function EditDetaineeDialog({ record, onClose }: { record: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    first_name: record.first_name || "",
    last_name: record.last_name || "",
    alias: record.alias || "",
    gender: record.gender || "male",
    date_of_birth: record.date_of_birth || "",
    marital_status: record.marital_status || "",
    nationality: record.nationality || "",
    country_of_origin: record.country_of_origin || "",
    id_type: record.id_type || "Passport",
    id_number: record.id_number || "",
    phone: record.phone || "",
    home_address: record.home_address || "",
    next_of_kin: record.next_of_kin || "",
    next_of_kin_phone: record.next_of_kin_phone || "",
    emergency_contact: record.emergency_contact || "",
    crime_type: record.crime_type || "Illegal Entry",
    charge_description: record.charge_description || "",
    location_of_arrest: record.location_of_arrest || "",
    arresting_officer_name: record.arresting_officer_name || "",
    cell_number: record.cell_number || "",
    risk_level: record.risk_level || "medium",
    medical_alerts: record.medical_alerts || "",
    notes: record.notes || "",
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!form.first_name.trim() || !form.last_name.trim()) throw new Error("Name required");
      const { error } = await supabase.from("detention_records").update(form).eq("id", record.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detention_records"] }); toast.success("Record updated"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-rose-600" />Edit Detainee Record</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="border rounded-lg p-3 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Users className="h-4 w-4" />Biodata</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><Label>First Name *</Label><Input value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} /></div>
              <div><Label>Last Name *</Label><Input value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} /></div>
              <div><Label>Alias</Label><Input value={form.alias} onChange={e => setForm(p => ({ ...p, alias: e.target.value }))} /></div>
              <div><Label>Gender</Label>
                <Select value={form.gender} onValueChange={v => setForm(p => ({ ...p, gender: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={e => setForm(p => ({ ...p, date_of_birth: e.target.value }))} /></div>
              <div><Label>Marital Status</Label>
                <Select value={form.marital_status} onValueChange={v => setForm(p => ({ ...p, marital_status: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{["Single","Married","Divorced","Widowed","Separated"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>Phone(s)</Label><MultiContactInput mode="list" value={form.phone} onChange={(v) => setForm(p => ({ ...p, phone: v }))} /></div>
              <div><Label>Nationality</Label><CountryCombobox value={form.nationality} onValueChange={v => setForm(p => ({ ...p, nationality: v }))} /></div>
              <div><Label>Country of Origin</Label><CountryCombobox value={form.country_of_origin} onValueChange={v => setForm(p => ({ ...p, country_of_origin: v }))} /></div>
              <div><Label>ID Type</Label>
                <Select value={form.id_type} onValueChange={v => setForm(p => ({ ...p, id_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Passport", "Ghana Card", "Driver's Licence", "Voter's ID", "None"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>ID Number</Label><Input value={form.id_number} onChange={e => setForm(p => ({ ...p, id_number: e.target.value }))} /></div>
              <div className="col-span-3"><Label>Home Address</Label><Input value={form.home_address} onChange={e => setForm(p => ({ ...p, home_address: e.target.value }))} /></div>
              <div><Label>Next of Kin</Label><Input value={form.next_of_kin} onChange={e => setForm(p => ({ ...p, next_of_kin: e.target.value }))} /></div>
              <div><Label>NoK Phone</Label><Input value={form.next_of_kin_phone} onChange={e => setForm(p => ({ ...p, next_of_kin_phone: e.target.value }))} /></div>
              <div><Label>Emergency Contact</Label><Input value={form.emergency_contact} onChange={e => setForm(p => ({ ...p, emergency_contact: e.target.value }))} /></div>
            </div>
          </div>

          <div className="border rounded-lg p-3 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Case Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Crime Type *</Label>
                <Select value={form.crime_type} onValueChange={v => setForm(p => ({ ...p, crime_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CRIME_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Cell / Room</Label><Input value={form.cell_number} onChange={e => setForm(p => ({ ...p, cell_number: e.target.value }))} placeholder="e.g. C-01" /></div>
              <div className="col-span-2"><Label>Charge Description</Label><Textarea rows={2} value={form.charge_description} onChange={e => setForm(p => ({ ...p, charge_description: e.target.value }))} /></div>
              <div><Label>Location of Arrest</Label><Input value={form.location_of_arrest} onChange={e => setForm(p => ({ ...p, location_of_arrest: e.target.value }))} /></div>
              <div><Label>Arresting Officer</Label><Input value={form.arresting_officer_name} onChange={e => setForm(p => ({ ...p, arresting_officer_name: e.target.value }))} /></div>
              <div><Label>Risk Level *</Label>
                <Select value={form.risk_level} onValueChange={v => setForm(p => ({ ...p, risk_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["low", "medium", "high", "critical"].map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="flex items-center gap-1"><Heart className="h-3 w-3 text-rose-500" />Medical Alerts</Label><Input value={form.medical_alerts} onChange={e => setForm(p => ({ ...p, medical_alerts: e.target.value }))} /></div>
              <div className="col-span-2"><Label>Additional Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => update.mutate()} disabled={update.isPending} className="bg-rose-600 hover:bg-rose-700">{update.isPending ? "Saving…" : "Save Changes"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------- INTAKE ----------------- */
function IntakeForm({ onClose, userId }: { onClose: () => void; userId?: string }) {
  const qc = useQueryClient();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    first_name: "", last_name: "", alias: "", gender: "male", date_of_birth: "", marital_status: "",
    nationality: "", country_of_origin: "", id_type: "Passport", id_number: "",
    home_address: "", phone: "", next_of_kin: "", next_of_kin_phone: "", emergency_contact: "",
    crime_type: "Illegal Entry", charge_description: "", location_of_arrest: "",
    arresting_officer_name: "", cell_number: "", risk_level: "medium", medical_alerts: "", notes: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.first_name.trim() || !form.last_name.trim() || !form.crime_type) throw new Error("Name and crime type required");
      let photo_url: string | null = null;
      if (photoFile) {
        const path = `${Date.now()}-${photoFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("detention-photos").upload(path, photoFile);
        if (upErr) throw upErr;
        photo_url = path;
      }
      const { error } = await supabase.from("detention_records").insert({ ...form, photo_url, created_by: userId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detention_records"] }); toast.success("Detainee booked in"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-rose-600" />New Detainee Intake</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Biodata */}
          <div className="border rounded-lg p-3 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Users className="h-4 w-4" />Biodata</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><Label>First Name *</Label><Input value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} /></div>
              <div><Label>Last Name *</Label><Input value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} /></div>
              <div><Label>Alias</Label><Input value={form.alias} onChange={e => setForm(p => ({ ...p, alias: e.target.value }))} /></div>
              <div><Label>Gender</Label>
                <Select value={form.gender} onValueChange={v => setForm(p => ({ ...p, gender: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={e => setForm(p => ({ ...p, date_of_birth: e.target.value }))} /></div>
              <div><Label>Marital Status</Label>
                <Select value={form.marital_status} onValueChange={v => setForm(p => ({ ...p, marital_status: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{["Single","Married","Divorced","Widowed","Separated"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>Phone(s)</Label><MultiContactInput mode="list" value={form.phone} onChange={(v) => setForm(p => ({ ...p, phone: v }))} /></div>
              <div><Label>Nationality</Label><CountryCombobox value={form.nationality} onValueChange={v => setForm(p => ({ ...p, nationality: v }))} /></div>
              <div><Label>Country of Origin</Label><CountryCombobox value={form.country_of_origin} onValueChange={v => setForm(p => ({ ...p, country_of_origin: v }))} /></div>
              <div><Label>ID Type</Label>
                <Select value={form.id_type} onValueChange={v => setForm(p => ({ ...p, id_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Passport", "Ghana Card", "Driver's Licence", "Voter's ID", "None"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>ID Number</Label><Input value={form.id_number} onChange={e => setForm(p => ({ ...p, id_number: e.target.value }))} /></div>
              <div className="col-span-3"><Label>Home Address</Label><Input value={form.home_address} onChange={e => setForm(p => ({ ...p, home_address: e.target.value }))} /></div>
              <div><Label>Next of Kin</Label><Input value={form.next_of_kin} onChange={e => setForm(p => ({ ...p, next_of_kin: e.target.value }))} /></div>
              <div><Label>NoK Phone</Label><Input value={form.next_of_kin_phone} onChange={e => setForm(p => ({ ...p, next_of_kin_phone: e.target.value }))} /></div>
              <div><Label>Emergency Contact</Label><Input value={form.emergency_contact} onChange={e => setForm(p => ({ ...p, emergency_contact: e.target.value }))} /></div>
            </div>
            <div>
              <Label className="flex items-center gap-1"><Camera className="h-3 w-3" /> Photo (mugshot)</Label>
              <Input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} />
            </div>
          </div>

          {/* Case */}
          <div className="border rounded-lg p-3 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Case Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Crime Type *</Label>
                <Select value={form.crime_type} onValueChange={v => setForm(p => ({ ...p, crime_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CRIME_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Cell / Room</Label><Input value={form.cell_number} onChange={e => setForm(p => ({ ...p, cell_number: e.target.value }))} placeholder="e.g. C-01" /></div>
              <div className="col-span-2"><Label>Charge Description</Label><Textarea rows={2} value={form.charge_description} onChange={e => setForm(p => ({ ...p, charge_description: e.target.value }))} /></div>
              <div><Label>Location of Arrest</Label><Input value={form.location_of_arrest} onChange={e => setForm(p => ({ ...p, location_of_arrest: e.target.value }))} /></div>
              <div><Label>Arresting Officer</Label><Input value={form.arresting_officer_name} onChange={e => setForm(p => ({ ...p, arresting_officer_name: e.target.value }))} /></div>
              <div><Label>Risk Level *</Label>
                <Select value={form.risk_level} onValueChange={v => setForm(p => ({ ...p, risk_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["low", "medium", "high", "critical"].map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="flex items-center gap-1"><Heart className="h-3 w-3 text-rose-500" />Medical Alerts</Label><Input value={form.medical_alerts} onChange={e => setForm(p => ({ ...p, medical_alerts: e.target.value }))} placeholder="e.g. diabetic, allergies" /></div>
              <div className="col-span-2"><Label>Additional Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending} className="bg-rose-600 hover:bg-rose-700">{create.isPending ? "Booking…" : "Book In"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------- DETAIL DRAWER ----------------- */
function DetainDetailDrawer({ record, onClose, userId, role }: { record: any; onClose: () => void; userId?: string; role: string | null }) {
  const qc = useQueryClient();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const canCommand = ["admin", "oic", "2ic"].includes(role || "");

  useEffect(() => {
    if (record.photo_url) {
      supabase.storage.from("detention-photos").createSignedUrl(record.photo_url, 3600).then(({ data }) => setPhotoUrl(data?.signedUrl || null));
    }
  }, [record.photo_url]);

  const { data: detail } = useQuery({
    queryKey: ["detention-detail", record.id],
    queryFn: async () => {
      const [prop, vis, med, tr] = await Promise.all([
        supabase.from("detention_property_log").select("*").eq("detention_id", record.id).order("logged_at", { ascending: false }),
        supabase.from("detention_visitor_log").select("*").eq("detention_id", record.id).order("visit_start", { ascending: false }),
        supabase.from("detention_medical_log").select("*").eq("detention_id", record.id).order("attended_at", { ascending: false }),
        supabase.from("detention_transfers").select("*").eq("detention_id", record.id).order("transferred_at", { ascending: false }),
      ]);
      return { property: prop.data || [], visitors: vis.data || [], medical: med.data || [], transfers: tr.data || [] };
    },
  });

  const release = useMutation({
    mutationFn: async ({ outcome, reason }: { outcome: string; reason: string }) => {
      if (!canCommand) throw new Error("Only command can release");
      const { error } = await supabase.from("detention_records").update({ status: outcome, released_at: new Date().toISOString(), released_by: userId, release_reason: reason }).eq("id", record.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: ["detention_records"] }); toast.success(`Detainee marked as ${vars.outcome.replace(/_/g, " ")}`); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {photoUrl && <AvatarImage src={photoUrl} />}
              <AvatarFallback className="bg-rose-100 text-rose-700">{record.first_name[0]}{record.last_name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left">
              <div>{record.first_name} {record.last_name} {record.alias && <span className="text-sm text-muted-foreground">aka "{record.alias}"</span>}</div>
              <div className="flex gap-1.5 mt-1">
                <Badge className={STATUS_COLORS[record.status]}>{record.status.replace(/_/g, " ")}</Badge>
                <Badge className={RISK_COLORS[record.risk_level]}>{record.risk_level} risk</Badge>
                {record.medical_alerts && <Badge variant="outline" className="border-rose-400"><Heart className="h-3 w-3 mr-1 text-rose-500" />Medical</Badge>}
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="bio" className="mt-4">
          <TabsList className="flex flex-wrap h-auto bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/50 p-1">
            <TabsTrigger value="bio" className="data-[state=active]:bg-rose-600 data-[state=active]:text-white">Profile</TabsTrigger>
            <TabsTrigger value="property" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white"><Package className="h-3.5 w-3.5 mr-1 text-amber-700 dark:text-amber-400" />Property ({detail?.property.length || 0})</TabsTrigger>
            <TabsTrigger value="visitors" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white"><Users className="h-3.5 w-3.5 mr-1 text-cyan-700 dark:text-cyan-400" />Visitors ({detail?.visitors.length || 0})</TabsTrigger>
            <TabsTrigger value="medical" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"><Stethoscope className="h-3.5 w-3.5 mr-1 text-emerald-700 dark:text-emerald-400" />Medical ({detail?.medical.length || 0})</TabsTrigger>
            <TabsTrigger value="transfers" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white"><ArrowRightLeft className="h-3.5 w-3.5 mr-1 text-indigo-700 dark:text-indigo-400" />Transfers ({detail?.transfers.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="bio" className="space-y-3">
            <Section title="Identification">
              <Field label="Gender" value={record.gender} />
              <Field label="DOB" value={record.date_of_birth ? format(new Date(record.date_of_birth), "MMM d, yyyy") : "—"} />
              <Field label="Nationality" value={record.nationality} />
              <Field label="Country of Origin" value={record.country_of_origin} />
              <Field label="ID Type" value={record.id_type} />
              <Field label="ID Number" value={record.id_number} />
              <Field label="Phone" value={record.phone} />
              <Field label="Home Address" value={record.home_address} full />
            </Section>
            <Section title="Case">
              <Field label="Crime Type" value={record.crime_type} />
              <Field label="Cell" value={record.cell_number} />
              <Field label="Charge" value={record.charge_description} full />
              <Field label="Arrest Location" value={record.location_of_arrest} />
              <Field label="Arresting Officer" value={record.arresting_officer_name} />
              <Field label="Intake" value={format(new Date(record.intake_at), "MMM d, yyyy HH:mm")} />
              <Field label="Custody Duration" value={`${differenceInHours(record.released_at ? new Date(record.released_at) : new Date(), new Date(record.intake_at))} hrs`} />
              {record.medical_alerts && <Field label="⚠ Medical Alerts" value={record.medical_alerts} full />}
              {record.notes && <Field label="Notes" value={record.notes} full />}
            </Section>
            <Section title="Next of Kin / Emergency">
              <Field label="Next of Kin" value={record.next_of_kin} />
              <Field label="NoK Phone" value={record.next_of_kin_phone} />
              <Field label="Emergency Contact" value={record.emergency_contact} full />
            </Section>
            {record.status === "in_custody" && canCommand && <ReleaseAction onRelease={(outcome, reason) => release.mutate({ outcome, reason })} pending={release.isPending} />}
          </TabsContent>

          <TabsContent value="property"><PropertyLog records={detail?.property || []} detentionId={record.id} userId={userId} canEdit={record.status === "in_custody"} /></TabsContent>
          <TabsContent value="visitors"><VisitorLog records={detail?.visitors || []} detentionId={record.id} userId={userId} canEdit={record.status === "in_custody"} /></TabsContent>
          <TabsContent value="medical"><MedicalLog records={detail?.medical || []} detentionId={record.id} userId={userId} canEdit={record.status === "in_custody"} /></TabsContent>
          <TabsContent value="transfers"><TransferLog records={detail?.transfers || []} detentionId={record.id} userId={userId} canEdit={record.status === "in_custody" && canCommand} /></TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: any) {
  return <div className="space-y-2"><h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">{title}</h4><div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{children}</div></div>;
}
function Field({ label, value, full }: { label: string; value: any; full?: boolean }) {
  return <div className={full ? "col-span-2" : ""}><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium capitalize">{value || "—"}</div></div>;
}

function ReleaseAction({ onRelease, pending }: { onRelease: (outcome: string, reason: string) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("released");
  const [reason, setReason] = useState("");
  return (
    <div className="border-t pt-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="w-full bg-emerald-600 hover:bg-emerald-700">Close Custody / Release</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Custody Status</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Outcome *</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELEASE_OUTCOMES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason / Notes *</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="e.g. Bail granted on GHS 10,000, deported to Nigeria via KIA, transferred to court for hearing…" />
            </div>
            <Button onClick={() => { if (reason.trim()) { onRelease(outcome, reason); setOpen(false); } else toast.error("Reason required"); }} disabled={pending} className="w-full bg-emerald-600 hover:bg-emerald-700">{pending ? "Saving…" : "Confirm"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PropertyLog({ records, detentionId, userId, canEdit }: any) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ item_description: "", quantity: 1, condition: "good", notes: "" });
  const add = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("detention_property_log").insert({ ...form, detention_id: detentionId, logged_by: userId }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detention-detail", detentionId] }); setOpen(false); setForm({ item_description: "", quantity: 1, condition: "good", notes: "" }); toast.success("Property logged"); },
  });
  return (
    <div className="space-y-2">
      {canEdit && <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-3.5 w-3.5" />Log Property</Button>}
      {records.length === 0 ? <p className="text-sm text-muted-foreground py-4">No property logged.</p> :
        <div className="space-y-2">{records.map((r: any) => <Card key={r.id} className="p-3"><div className="flex justify-between"><div><div className="font-medium">{r.item_description}</div><div className="text-xs text-muted-foreground">Qty: {r.quantity} · {r.condition || "—"}</div></div><div className="text-xs text-muted-foreground">{format(new Date(r.logged_at), "MMM d, HH:mm")}</div></div>{r.notes && <p className="text-xs mt-1">{r.notes}</p>}</Card>)}</div>}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Log Property</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label>Description *</Label><Input value={form.item_description} onChange={e => setForm(p => ({ ...p, item_description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Quantity</Label><Input type="number" min={1} value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) }))} /></div>
            <div><Label>Condition</Label><Input value={form.condition} onChange={e => setForm(p => ({ ...p, condition: e.target.value }))} /></div></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <Button onClick={() => add.mutate()} disabled={add.isPending} className="w-full">{add.isPending ? "Saving…" : "Log"}</Button></div></DialogContent></Dialog>
    </div>
  );
}
function VisitorLog({ records, detentionId, userId, canEdit }: any) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ visitor_name: "", relationship: "", id_number: "", phone: "", notes: "" });
  const add = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("detention_visitor_log").insert({ ...form, detention_id: detentionId, approved_by: userId }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detention-detail", detentionId] }); setOpen(false); setForm({ visitor_name: "", relationship: "", id_number: "", phone: "", notes: "" }); toast.success("Visitor logged"); },
  });
  return (
    <div className="space-y-2">
      {canEdit && <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-3.5 w-3.5" />Log Visitor</Button>}
      {records.length === 0 ? <p className="text-sm text-muted-foreground py-4">No visitors recorded.</p> :
        records.map((r: any) => <Card key={r.id} className="p-3"><div className="flex justify-between"><div><div className="font-medium">{r.visitor_name}</div><div className="text-xs text-muted-foreground">{r.relationship || "—"} · {r.phone || "—"}</div></div><div className="text-xs text-muted-foreground">{format(new Date(r.visit_start), "MMM d, HH:mm")}</div></div>{r.notes && <p className="text-xs mt-1">{r.notes}</p>}</Card>)}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Log Visitor</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label>Visitor Name *</Label><Input value={form.visitor_name} onChange={e => setForm(p => ({ ...p, visitor_name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Relationship</Label><Input value={form.relationship} onChange={e => setForm(p => ({ ...p, relationship: e.target.value }))} /></div>
            <div><Label>ID Number</Label><Input value={form.id_number} onChange={e => setForm(p => ({ ...p, id_number: e.target.value }))} /></div></div>
          <div><Label>Phone(s)</Label><MultiContactInput mode="list" value={form.phone} onChange={(v) => setForm(p => ({ ...p, phone: v }))} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <Button onClick={() => add.mutate()} disabled={add.isPending} className="w-full">{add.isPending ? "Saving…" : "Log"}</Button></div></DialogContent></Dialog>
    </div>
  );
}
function MedicalLog({ records, detentionId, userId, canEdit }: any) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ complaint: "", treatment: "", attended_by: "", notes: "" });
  const add = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("detention_medical_log").insert({ ...form, detention_id: detentionId, logged_by: userId }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detention-detail", detentionId] }); setOpen(false); setForm({ complaint: "", treatment: "", attended_by: "", notes: "" }); toast.success("Medical record added"); },
  });
  return (
    <div className="space-y-2">
      {canEdit && <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-3.5 w-3.5" />Add Record</Button>}
      {records.length === 0 ? <p className="text-sm text-muted-foreground py-4">No medical records.</p> :
        records.map((r: any) => <Card key={r.id} className="p-3"><div className="flex justify-between"><div><div className="font-medium">{r.complaint}</div>{r.treatment && <div className="text-xs">{r.treatment}</div>}<div className="text-xs text-muted-foreground">{r.attended_by || "—"}</div></div><div className="text-xs text-muted-foreground">{format(new Date(r.attended_at), "MMM d, HH:mm")}</div></div></Card>)}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Medical Record</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label>Complaint *</Label><Input value={form.complaint} onChange={e => setForm(p => ({ ...p, complaint: e.target.value }))} /></div>
          <div><Label>Treatment</Label><Textarea rows={2} value={form.treatment} onChange={e => setForm(p => ({ ...p, treatment: e.target.value }))} /></div>
          <div><Label>Attended By</Label><Input value={form.attended_by} onChange={e => setForm(p => ({ ...p, attended_by: e.target.value }))} placeholder="Medic / clinic name" /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <Button onClick={() => add.mutate()} disabled={add.isPending} className="w-full">{add.isPending ? "Saving…" : "Add"}</Button></div></DialogContent></Dialog>
    </div>
  );
}
function TransferLog({ records, detentionId, userId, canEdit }: any) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ from_location: "", to_location: "", reason: "", escorted_by: "" });
  const add = useMutation({
    mutationFn: async () => {
      if (!form.to_location) throw new Error("Destination required");
      const { error: e1 } = await supabase.from("detention_transfers").insert({ ...form, detention_id: detentionId, performed_by: userId });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("detention_records").update({ status: "transferred" }).eq("id", detentionId);
      if (e2) throw e2;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detention-detail", detentionId] }); qc.invalidateQueries({ queryKey: ["detention_records"] }); setOpen(false); setForm({ from_location: "", to_location: "", reason: "", escorted_by: "" }); toast.success("Transfer logged"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="space-y-2">
      {canEdit && <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-3.5 w-3.5" />Record Transfer</Button>}
      {records.length === 0 ? <p className="text-sm text-muted-foreground py-4">No transfers.</p> :
        records.map((r: any) => <Card key={r.id} className="p-3"><div className="flex justify-between"><div><div className="font-medium">{r.from_location || "Holding"} → {r.to_location}</div>{r.reason && <div className="text-xs">{r.reason}</div>}<div className="text-xs text-muted-foreground">Escort: {r.escorted_by || "—"}</div></div><div className="text-xs text-muted-foreground">{format(new Date(r.transferred_at), "MMM d, HH:mm")}</div></div></Card>)}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Record Transfer</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label>From</Label><Input value={form.from_location} onChange={e => setForm(p => ({ ...p, from_location: e.target.value }))} placeholder="Default: Holding" /></div>
          <div><Label>To *</Label><Input value={form.to_location} onChange={e => setForm(p => ({ ...p, to_location: e.target.value }))} placeholder="e.g. Court, HQ, Hospital" /></div>
          <div><Label>Reason</Label><Textarea rows={2} value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} /></div>
          <div><Label>Escorted By</Label><Input value={form.escorted_by} onChange={e => setForm(p => ({ ...p, escorted_by: e.target.value }))} /></div>
          <Button onClick={() => add.mutate()} disabled={add.isPending} className="w-full">{add.isPending ? "Saving…" : "Confirm Transfer"}</Button></div></DialogContent></Dialog>
    </div>
  );
}

/* ----------------- ANALYTICS ----------------- */
function HoldingAnalytics() {
  const { data } = useQuery({
    queryKey: ["holding-analytics"],
    queryFn: async () => (await supabase.from("detention_records").select("*")).data || [],
    refetchInterval: 30_000,
  });

  if (!data) return <div className="text-center py-8 text-muted-foreground">Loading…</div>;

  const inCustody = data.filter((r: any) => r.status === "in_custody").length;
  const totalEver = data.length;
  const released = data.filter((r: any) => r.status === "released").length;
  const onBail = data.filter((r: any) => r.status === "bail").length;
  const deported = data.filter((r: any) => r.status === "deported").length;
  const escaped = data.filter((r: any) => r.status === "escaped").length;

  const groupBy = (key: string) => {
    const m: Record<string, number> = {};
    data.forEach((r: any) => { const k = r[key] || "Unknown"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const byGender = groupBy("gender");
  const byCrime = groupBy("crime_type");
  const byNation = groupBy("nationality").slice(0, 10);
  const byLoc = groupBy("location_of_arrest").slice(0, 10);
  const byRisk = groupBy("risk_level");

  // 30-day intake trend
  const trend: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) trend[format(new Date(Date.now() - i * 86400000), "MMM d")] = 0;
  data.forEach((r: any) => { const d = format(new Date(r.intake_at), "MMM d"); if (trend[d] !== undefined) trend[d]++; });
  const trendData = Object.entries(trend).map(([date, count]) => ({ date, count }));

  // Avg custody duration (released only)
  const releasedRecs = data.filter((r: any) => r.released_at);
  const avgHrs = releasedRecs.length > 0 ? Math.round(releasedRecs.reduce((s: number, r: any) => s + differenceInHours(new Date(r.released_at), new Date(r.intake_at)), 0) / releasedRecs.length) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI title="In Custody" value={inCustody} icon={Lock} color="text-rose-600" bg="bg-rose-50 dark:bg-rose-950/40" />
        <KPI title="On Bail" value={onBail} icon={UserCheck} color="text-cyan-600" bg="bg-cyan-50 dark:bg-cyan-950/40" />
        <KPI title="Released" value={released} icon={UserCheck} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/40" />
        <KPI title="Deported" value={deported} icon={ArrowRightLeft} color="text-purple-600" bg="bg-purple-50 dark:bg-purple-950/40" />
        <KPI title="Total Records" value={totalEver} icon={Activity} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/40" />
        <KPI title="Avg Custody" value={`${avgHrs} hrs`} icon={UserCheck} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/40" />
        <KPI title="Escapes" value={escaped} icon={AlertTriangle} color="text-red-700" bg="bg-red-100 dark:bg-red-950/50" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-sm">By Gender</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={byGender} dataKey="value" nameKey="name" outerRadius={80} label>{byGender.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-sm">By Risk Level</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={byRisk} dataKey="value" nameKey="name" outerRadius={80} label>{byRisk.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
        </CardContent></Card>

        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-sm">Intake Trend (Last 30 Days)</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={220}><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" name="Intakes" /></LineChart></ResponsiveContainer>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-sm">By Crime Type</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={250}><BarChart data={byCrime} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" fontSize={11} /><YAxis dataKey="name" type="category" width={120} fontSize={11} /><Tooltip /><Bar dataKey="value" fill="#ef4444" /></BarChart></ResponsiveContainer>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-sm">Top Nationalities</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={250}><BarChart data={byNation} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" fontSize={11} /><YAxis dataKey="name" type="category" width={120} fontSize={11} /><Tooltip /><Bar dataKey="value" fill="hsl(var(--primary))" /></BarChart></ResponsiveContainer>
        </CardContent></Card>

        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-sm">Top Arrest Locations</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={250}><BarChart data={byLoc}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={10} angle={-25} textAnchor="end" height={70} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="value" fill="#8b5cf6" /></BarChart></ResponsiveContainer>
        </CardContent></Card>
      </div>
    </div>
  );
}

function KPI({ title, value, icon: Icon, color, bg }: any) {
  return (
    <Card className={`${bg} border-2`}>
      <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent className="px-3 pb-3"><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { assertContactPhoneList } from "@/lib/ghana-phone";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiContactInput } from "@/components/ui/multi-contact-input";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { isEcowasNationality } from "@/lib/countries";
import { FilterSummaryBar } from "@/components/frontdesk/FilterSummaryBar";
import { ContactPhoneInput } from "@/components/ui/contact-phone-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Edit } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { RecordRowActions } from "@/components/shared/RecordRowActions";
import { toast } from "sonner";
import { format } from "date-fns";
import { createNotification } from "@/lib/notifications";
import { DateInput } from "@/components/ui/date-input";

const OFFICIAL_TYPES = ["diplomatic", "government", "inter-agency", "courtesy", "other"];
const STATUSES = ["submitted", "under_review", "approved", "rejected", "collected"];

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-800",
    under_review: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    collected: "bg-gray-100 text-gray-800",
  };
  return <Badge className={colors[status] || ""}>{status.replace("_", " ")}</Badge>;
}

export default function OfficialApplications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [ecowasOnly, setEcowasOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    applicant_name: "", passport_number: "", nationality: "", official_type: "diplomatic",
    reference_number: "", requesting_entity: "", purpose: "", notes: "", status: "submitted",
    phone: "", home_address: "", gender: "", marital_status: "", foreign_address: "",
    date_of_birth: "", next_of_kin: "", emergency_contact: "", street_name: "", nearest_landmark: "",
  });

  useEffect(() => {
    const channel = supabase
      .channel("frontdesk-official-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "official_applications" }, () => {
        qc.invalidateQueries({ queryKey: ["official-applications"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const { data: applications = [], isLoading } = useQuery({
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryKey: ["official-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("official_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        date_of_birth: form.date_of_birth || null,
        phone: assertContactPhoneList(form.phone, "Telephone"),
        emergency_contact: assertContactPhoneList(form.emergency_contact, "Emergency Contact"),
        processed_by: user?.id,
      };
      let previousStatus: string | null = null;
      if (editId) {
        const existing = applications.find((a: any) => a.id === editId);
        previousStatus = existing?.status ?? null;
        const { error } = await supabase.from("official_applications").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("official_applications").insert(payload);
        if (error) throw error;
      }
      if (editId && previousStatus !== form.status && (form.status === "approved" || form.status === "rejected")) {
        const { data: roledUsers } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "front_desk"]);
        if (roledUsers) {
          const uniqueUserIds = [...new Set(roledUsers.map((r) => r.user_id))];
          await Promise.all(uniqueUserIds.map((uid) =>
            createNotification({ userId: uid, title: `Official Application ${form.status === "approved" ? "Approved" : "Rejected"}`, message: `Official application for ${form.applicant_name} has been ${form.status}.`, type: "official", referenceId: editId })
          ));
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["official-applications"] }); toast.success(editId ? "Application updated" : "Application created"); resetForm(); },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm({ applicant_name: "", passport_number: "", nationality: "", official_type: "diplomatic", reference_number: "", requesting_entity: "", purpose: "", notes: "", status: "submitted", phone: "", home_address: "", gender: "", marital_status: "", foreign_address: "", date_of_birth: "", next_of_kin: "", emergency_contact: "", street_name: "", nearest_landmark: "" });
    setEditId(null); setOpen(false);
  };

  const openEdit = (app: any) => {
    setForm({
      applicant_name: app.applicant_name, passport_number: app.passport_number || "",
      nationality: app.nationality, official_type: app.official_type,
      reference_number: app.reference_number || "", requesting_entity: app.requesting_entity || "",
      purpose: app.purpose || "", notes: app.notes || "", status: app.status,
      phone: app.phone || "", home_address: app.home_address || "", gender: app.gender || "",
      marital_status: app.marital_status || "", foreign_address: app.foreign_address || "",
      date_of_birth: app.date_of_birth || "", next_of_kin: app.next_of_kin || "",
      emergency_contact: app.emergency_contact || "", street_name: app.street_name || "",
      nearest_landmark: app.nearest_landmark || "",
    });
    setEditId(app.id); setOpen(true);
  };

  const filtered = applications.filter((a: any) => {
    const matchesSearch = a.applicant_name.toLowerCase().includes(search.toLowerCase()) || (a.reference_number || "").toLowerCase().includes(search.toLowerCase());
    const matchesEcowas = !ecowasOnly || isEcowasNationality(a.nationality);
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    return matchesSearch && matchesEcowas && matchesStatus;
  });

  const hasActiveFilters = search || ecowasOnly || statusFilter !== "all";
  const clearAllFilters = () => { setSearch(""); setEcowasOnly(false); setStatusFilter("all"); };
  const activeFiltersList = [
    ...(search ? [{ label: "Search", value: `"${search}"`, onClear: () => setSearch("") }] : []),
    ...(statusFilter !== "all" ? [{ label: "Status", value: statusFilter.replace("_", " "), onClear: () => setStatusFilter("all") }] : []),
    ...(ecowasOnly ? [{ label: "Region", value: "ECOWAS", onClear: () => setEcowasOnly(false) }] : []),
  ];

  const summary = {
    total: applications.length,
    submitted: applications.filter((a: any) => a.status === "submitted").length,
    approved: applications.filter((a: any) => a.status === "approved").length,
    rejected: applications.filter((a: any) => a.status === "rejected").length,
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: summary.total, color: "text-cyan-600 dark:text-cyan-400", border: "border-cyan-300 dark:border-cyan-700", bg: "bg-cyan-50/50 dark:bg-cyan-950/20" },
          { label: "Submitted", value: summary.submitted, color: "text-blue-600 dark:text-blue-400", border: "border-blue-300 dark:border-blue-700", bg: "bg-blue-50/50 dark:bg-blue-950/20" },
          { label: "Approved", value: summary.approved, color: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-300 dark:border-emerald-700", bg: "bg-emerald-50/50 dark:bg-emerald-950/20" },
          { label: "Rejected", value: summary.rejected, color: "text-red-600 dark:text-red-400", border: "border-red-300 dark:border-red-700", bg: "bg-red-50/50 dark:bg-red-950/20" },
        ].map((s) => (
          <Card key={s.label} className={`${s.border} ${s.bg}`}><CardContent className="p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </CardContent></Card>
        ))}
      </div>

      {hasActiveFilters && <FilterSummaryBar filters={activeFiltersList} totalResults={filtered.length} onClearAll={clearAllFilters} />}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or reference..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ").replace(/^\w/, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        <Toggle pressed={ecowasOnly} onPressedChange={setEcowasOnly} variant="outline" size="sm" className="gap-1 whitespace-nowrap data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/30" aria-label="Filter ECOWAS only">⭐ ECOWAS</Toggle>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
          <DialogTrigger asChild><Button className="gap-1"><Plus className="h-4 w-4" /> New Official</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Official Application</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Applicant Name *</Label><Input value={form.applicant_name} onChange={(e) => setForm({ ...form, applicant_name: e.target.value })} required /></div>
                <div><Label>Passport Number</Label><Input value={form.passport_number} onChange={(e) => setForm({ ...form, passport_number: e.target.value })} /></div>
                <div><Label>Nationality *</Label><CountryCombobox value={form.nationality} onValueChange={(v) => setForm({ ...form, nationality: v })} required /></div>
                <div><Label>Official Type</Label>
                  <Select value={form.official_type} onValueChange={(v) => setForm({ ...form, official_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{OFFICIAL_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Reference Number</Label><Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} /></div>
                <div><Label>Requesting Entity</Label><Input value={form.requesting_entity} onChange={(e) => setForm({ ...form, requesting_entity: e.target.value })} /></div>
                <div><Label>Date of Birth</Label><DateInput  value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
                <div><Label>Gender</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Marital Status</Label>
                  <Select value={form.marital_status} onValueChange={(v) => setForm({ ...form, marital_status: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent><SelectItem value="single">Single</SelectItem><SelectItem value="married">Married</SelectItem><SelectItem value="divorced">Divorced</SelectItem><SelectItem value="widowed">Widowed</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2"><Label>Telephone(s)</Label><MultiContactInput mode="list" ghanaAware value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></div>
              </div>
              <div><Label>Home Address</Label><Textarea value={form.home_address} onChange={(e) => setForm({ ...form, home_address: e.target.value })} rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Street Name</Label><Input value={form.street_name} onChange={(e) => setForm({ ...form, street_name: e.target.value })} /></div>
                <div><Label>Nearest Landmark</Label><Input value={form.nearest_landmark} onChange={(e) => setForm({ ...form, nearest_landmark: e.target.value })} /></div>
              </div>
              <div><Label>Foreign Address</Label><Textarea value={form.foreign_address} onChange={(e) => setForm({ ...form, foreign_address: e.target.value })} rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Next of Kin</Label><Input value={form.next_of_kin} onChange={(e) => setForm({ ...form, next_of_kin: e.target.value })} /></div>
                <div><Label>Emergency Contact (phone)</Label><ContactPhoneInput compact value={form.emergency_contact} onChange={(v) => setForm({ ...form, emergency_contact: v })} aria-label="Emergency contact phone number" /></div>
              </div>
              <div><Label>Purpose</Label><Textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} rows={2} /></div>
              {editId && (
                <div><Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : editId ? "Update" : "Submit Application"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader><TableRow>
            <TableHead>Applicant</TableHead><TableHead>Ref #</TableHead><TableHead>Nationality</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No official applications found</TableCell></TableRow>
            ) : filtered.map((app: any) => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">{app.applicant_name}</TableCell>
                <TableCell>{app.reference_number || "—"}</TableCell>
                <TableCell>{app.nationality}</TableCell>
                <TableCell><Badge variant="outline">{app.official_type}</Badge></TableCell>
                <TableCell>{statusBadge(app.status)}</TableCell>
                <TableCell className="text-sm">{format(new Date(app.created_at), "dd/MM/yyyy")}</TableCell>
                <TableCell>
                  <RecordRowActions
                    kind="official_application"
                    table="official_applications"
                    record={app}
                    onEdit={() => openEdit(app)}
                    invalidateKeys={[["official-applications"]]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>
    </div>
  );
}

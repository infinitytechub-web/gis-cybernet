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
import { ApplicationDocuments } from "@/components/applications/ApplicationDocuments";
import { DateInput } from "@/components/ui/date-input";

const APP_TYPES = ["new", "renewal", "replacement"];
const STATUSES = ["submitted", "processing", "ready", "collected", "rejected"];

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-800",
    processing: "bg-yellow-100 text-yellow-800",
    ready: "bg-green-100 text-green-800",
    collected: "bg-gray-100 text-gray-800",
    rejected: "bg-red-100 text-red-800",
  };
  return <Badge className={colors[status] || ""}>{status}</Badge>;
}

export default function PassportApplications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel("frontdesk-passport-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "passport_applications" }, () => {
        qc.invalidateQueries({ queryKey: ["passport-applications"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);
  const [ecowasOnly, setEcowasOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    applicant_name: "", date_of_birth: "", nationality: "Ghanaian",
    application_type: "new", gender: "", phone: "", address: "",
    notes: "", status: "submitted",
    marital_status: "", foreign_address: "", next_of_kin: "",
    emergency_contact: "", street_name: "", nearest_landmark: "",
    email: "", spouse_name: "",
    surname: "", other_names: "", place_of_birth: "", occupation: "",
    ghana_card_number: "",
    biometric_consent: false,
    witnessing_officer_name: "", witnessing_officer_rank: "",
    declaration_signed: false, declaration_date: "",
  });

  const { data: applications = [], isLoading } = useQuery({
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryKey: ["passport-applications"],
    queryFn: async () => {
      const { data, error } = await supabase.from("passport_applications").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, phone: assertContactPhoneList(form.phone, "Telephone"), processed_by: user?.id };

      let previousStatus: string | null = null;
      if (editId) {
        const existing = applications.find((a: any) => a.id === editId);
        previousStatus = existing?.status ?? null;
        const { error } = await supabase.from("passport_applications").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("passport_applications").insert(payload);
        if (error) throw error;
      }

      if (editId && previousStatus !== form.status && (form.status === "ready" || form.status === "rejected")) {
        const { data: roledUsers } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "front_desk"]);

        if (roledUsers) {
          const uniqueUserIds = [...new Set(roledUsers.map((r) => r.user_id))];
          const statusLabel = form.status === "ready" ? "Ready for Collection" : "Rejected";
          await Promise.all(
            uniqueUserIds.map((uid) =>
              createNotification({
                userId: uid,
                title: `Passport Application ${statusLabel}`,
                message: `Passport application for ${form.applicant_name} has been ${form.status === "ready" ? "marked ready for collection" : "rejected"}.`,
                type: "visa",
                referenceId: editId,
              })
            )
          );
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["passport-applications"] });
      toast.success(editId ? "Application updated" : "Application created");
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm({
      applicant_name: "", date_of_birth: "", nationality: "Ghanaian", application_type: "new",
      gender: "", phone: "", address: "", notes: "", status: "submitted",
      marital_status: "", foreign_address: "", next_of_kin: "", emergency_contact: "",
      street_name: "", nearest_landmark: "",
      email: "", spouse_name: "", surname: "", other_names: "", place_of_birth: "",
      occupation: "", ghana_card_number: "",
      biometric_consent: false,
      witnessing_officer_name: "", witnessing_officer_rank: "",
      declaration_signed: false, declaration_date: "",
    });
    setEditId(null);
    setOpen(false);
  };

  const openEdit = (app: any) => {
    setForm({
      applicant_name: app.applicant_name, date_of_birth: app.date_of_birth,
      nationality: app.nationality, application_type: app.application_type,
      gender: app.gender || "", phone: app.phone || "", address: app.address || "",
      notes: app.notes || "", status: app.status,
      marital_status: app.marital_status || "", foreign_address: app.foreign_address || "",
      next_of_kin: app.next_of_kin || "", emergency_contact: app.emergency_contact || "",
      street_name: app.street_name || "", nearest_landmark: app.nearest_landmark || "",
      email: app.email || "", spouse_name: app.spouse_name || "",
      surname: app.surname || "", other_names: app.other_names || "",
      place_of_birth: app.place_of_birth || "", occupation: app.occupation || "",
      ghana_card_number: app.ghana_card_number || "",
      biometric_consent: !!app.biometric_consent,
      witnessing_officer_name: app.witnessing_officer_name || "",
      witnessing_officer_rank: app.witnessing_officer_rank || "",
      declaration_signed: !!app.declaration_signed,
      declaration_date: app.declaration_date || "",
    });
    setEditId(app.id);
    setOpen(true);
  };

  const filtered = applications.filter((a: any) => {
    const matchesSearch = a.applicant_name.toLowerCase().includes(search.toLowerCase());
    const matchesEcowas = !ecowasOnly || isEcowasNationality(a.nationality);
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    return matchesSearch && matchesEcowas && matchesStatus;
  });

  const hasActiveFilters = search || ecowasOnly || statusFilter !== "all";
  const clearAllFilters = () => { setSearch(""); setEcowasOnly(false); setStatusFilter("all"); };
  const activeFiltersList = [
    ...(search ? [{ label: "Search", value: `"${search}"`, onClear: () => setSearch("") }] : []),
    ...(statusFilter !== "all" ? [{ label: "Status", value: statusFilter, onClear: () => setStatusFilter("all") }] : []),
    ...(ecowasOnly ? [{ label: "Region", value: "ECOWAS", onClear: () => setEcowasOnly(false) }] : []),
  ];

  return (
    <div className="space-y-4 mt-4">

      {hasActiveFilters && (
        <FilterSummaryBar filters={activeFiltersList} totalResults={filtered.length} onClearAll={clearAllFilters} />
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search applications..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/^\w/, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        <Toggle
          pressed={ecowasOnly}
          onPressedChange={setEcowasOnly}
          variant="outline"
          size="sm"
          className="gap-1 whitespace-nowrap data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/30"
          aria-label="Filter ECOWAS only"
        >
          ⭐ ECOWAS
        </Toggle>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
          <DialogTrigger asChild>
            <Button className="gap-1"><Plus className="h-4 w-4" /> New Application</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Passport Application</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Applicant Name *</Label><Input value={form.applicant_name} onChange={(e) => setForm({ ...form, applicant_name: e.target.value })} required /></div>
                <div><Label>Date of Birth *</Label><DateInput  value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} required /></div>
                <div><Label>Nationality *</Label><CountryCombobox value={form.nationality} onValueChange={(v) => setForm({ ...form, nationality: v })} required /></div>
                <div><Label>Application Type</Label>
                  <Select value={form.application_type} onValueChange={(v) => setForm({ ...form, application_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{APP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Gender</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Marital Status</Label>
                  <Select value={form.marital_status} onValueChange={(v) => setForm({ ...form, marital_status: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="married">Married</SelectItem>
                      <SelectItem value="divorced">Divorced</SelectItem>
                      <SelectItem value="widowed">Widowed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2"><Label>Telephone Number(s)</Label><MultiContactInput mode="list" ghanaAware value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></div>
                <div><Label>Next of Kin</Label><Input value={form.next_of_kin} onChange={(e) => setForm({ ...form, next_of_kin: e.target.value })} /></div>
                <div><Label>Emergency Contact (phone)</Label><ContactPhoneInput compact value={form.emergency_contact} onChange={(v) => setForm({ ...form, emergency_contact: v })} aria-label="Emergency contact phone number" /></div>
                <div><Label>Street Name</Label><Input value={form.street_name} onChange={(e) => setForm({ ...form, street_name: e.target.value })} /></div>
                <div><Label>Nearest Landmark</Label><Input value={form.nearest_landmark} onChange={(e) => setForm({ ...form, nearest_landmark: e.target.value })} /></div>
                <div><Label>Surname</Label><Input value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} /></div>
                <div><Label>Other Names</Label><Input value={form.other_names} onChange={(e) => setForm({ ...form, other_names: e.target.value })} /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Place of Birth</Label><Input value={form.place_of_birth} onChange={(e) => setForm({ ...form, place_of_birth: e.target.value })} /></div>
                <div><Label>Occupation</Label><Input value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} /></div>
                <div><Label>Ghana Card Number</Label><Input value={form.ghana_card_number} onChange={(e) => setForm({ ...form, ghana_card_number: e.target.value })} /></div>
                <div><Label>Spouse Name (if married)</Label><Input value={form.spouse_name} onChange={(e) => setForm({ ...form, spouse_name: e.target.value })} /></div>
              </div>
              <div className="rounded-md border p-3 space-y-3 bg-muted/20">
                <div className="text-sm font-medium">MFA Compliance — Witnessing & Declaration</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Witnessing Officer Name</Label><Input value={form.witnessing_officer_name} onChange={(e) => setForm({ ...form, witnessing_officer_name: e.target.value })} /></div>
                  <div><Label>Witnessing Officer Rank</Label><Input value={form.witnessing_officer_rank} onChange={(e) => setForm({ ...form, witnessing_officer_rank: e.target.value })} /></div>
                  <div><Label>Declaration Date</Label><DateInput  value={form.declaration_date} onChange={(e) => setForm({ ...form, declaration_date: e.target.value })} /></div>
                </div>
                <div className="flex items-center gap-2">
                  <input id="biometric_consent" type="checkbox" checked={form.biometric_consent} onChange={(e) => setForm({ ...form, biometric_consent: e.target.checked })} />
                  <Label htmlFor="biometric_consent" className="cursor-pointer">Applicant has consented to biometric capture</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input id="declaration_signed" type="checkbox" checked={form.declaration_signed} onChange={(e) => setForm({ ...form, declaration_signed: e.target.checked })} />
                  <Label htmlFor="declaration_signed" className="cursor-pointer">Declaration form signed by applicant</Label>
                </div>
              </div>
              <div><Label>Home Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
              <div><Label>Foreign Address</Label><Textarea value={form.foreign_address} onChange={(e) => setForm({ ...form, foreign_address: e.target.value })} rows={2} /></div>
              {editId && (
                <div><Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              {editId && <ApplicationDocuments recordType="passport" recordId={editId} />}
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Submit Application"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No passport applications found</TableCell></TableRow>
            ) : filtered.map((app: any) => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">{app.applicant_name}</TableCell>
                <TableCell>{app.nationality}</TableCell>
                <TableCell><Badge variant="outline">{app.application_type}</Badge></TableCell>
                <TableCell>{statusBadge(app.status)}</TableCell>
                <TableCell className="text-sm">{format(new Date(app.created_at), "dd/MM/yyyy")}</TableCell>
                <TableCell>
                  <RecordRowActions
                    kind="passport_application"
                    table="passport_applications"
                    record={app}
                    onEdit={() => openEdit(app)}
                    invalidateKeys={[["passport-applications"]]}
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

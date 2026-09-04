import { useState, useEffect } from "react";
import { GhanaPhoneInput } from "@/components/ui/ghana-phone-input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContactPhoneInput } from "@/components/ui/contact-phone-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { FeeInput } from "@/components/ui/fee-input";
import { MultiContactInput } from "@/components/ui/multi-contact-input";
import { RecordRowActions } from "@/components/shared/RecordRowActions";
import { FilterSummaryBar } from "@/components/frontdesk/FilterSummaryBar";
import { PERMIT_TYPES, PERMIT_STATUSES, permitTypeLabel } from "@/lib/permits";
import { ApplicationDocuments } from "@/components/applications/ApplicationDocuments";
import { DateInput } from "@/components/ui/date-input";

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

const EMPTY_FORM = {
  application_reference: "", applicant_name: "", surname: "", other_names: "",
  passport_number: "", passport_type: "", passport_issue_date: "", passport_expiry_date: "",
  passport_place_of_issue: "", port_of_entry: "",
  nationality: "", dual_nationality: "", date_of_birth: "", place_of_birth: "",
  gender: "", marital_status: "", phone: "",
  home_address: "", ghana_post_gps: "", foreign_address: "", street_name: "", nearest_landmark: "",
  next_of_kin: "", emergency_contact: "",
  permit_type: "", permit_category: "", purpose: "",
  occupation: "", employer_sponsor_name: "", employer_sponsor_address: "",
  institution_name: "", course_of_study: "",
  host_name: "", host_phone: "", host_address: "",
  previous_permit_history: "",
  intended_duration_months: "", current_permit_expiry: "", requested_start_date: "",
  fee_charged: "", fee_receipt_number: "", status: "submitted", notes: "",
};

export default function Permits() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);

  useEffect(() => {
    const ch = supabase.channel("frontdesk-permits-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "permits" }, () => {
        qc.invalidateQueries({ queryKey: ["permits-frontdesk"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const { data: permits = [], isLoading } = useQuery({
    queryKey: ["permits-frontdesk"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("permits")
        .select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        ...form,
        applicant_name: form.applicant_name || `${form.surname} ${form.other_names}`.trim(),
        date_of_birth: form.date_of_birth || null,
        passport_issue_date: form.passport_issue_date || null,
        passport_expiry_date: form.passport_expiry_date || null,
        current_permit_expiry: form.current_permit_expiry || null,
        requested_start_date: form.requested_start_date || null,
        intended_duration_months: form.intended_duration_months === "" ? null : Number(form.intended_duration_months),
        fee_charged: form.fee_charged === "" ? null : Number(form.fee_charged),
        processed_by: user?.id,
      };
      let savedId = editId;
      if (editId) {
        const { error } = await (supabase as any).from("permits").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).from("permits").insert(payload).select("id").single();
        if (error) throw error;
        savedId = data?.id;
      }
      return savedId;
    },
    onSuccess: (savedId: string | null) => {
      qc.invalidateQueries({ queryKey: ["permits-frontdesk"] });
      qc.invalidateQueries({ queryKey: ["permits-processing"] });
      toast.success(editId ? "Permit updated" : "Permit application submitted — you can now attach documents");
      if (!editId && savedId) setEditId(savedId);
      else reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reset = () => { setForm(EMPTY_FORM); setEditId(null); setOpen(false); };
  const openEdit = (p: any) => {
    const next = { ...EMPTY_FORM };
    Object.keys(EMPTY_FORM).forEach((k) => {
      const v = (p as any)[k];
      (next as any)[k] = v == null ? "" : String(v);
    });
    setForm(next);
    setEditId(p.id);
    setOpen(true);
  };

  const filtered = permits.filter((p: any) => {
    const term = search.toLowerCase();
    const matchSearch = !term || p.applicant_name?.toLowerCase().includes(term) || p.passport_number?.toLowerCase().includes(term) || p.application_reference?.toLowerCase().includes(term);
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const matchType = typeFilter === "all" || p.permit_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const hasActive = !!search || statusFilter !== "all" || typeFilter !== "all";

  return (
    <div className="space-y-4 mt-4">
      {hasActive && (
        <FilterSummaryBar
          filters={[
            ...(search ? [{ label: "Search", value: `"${search}"`, onClear: () => setSearch("") }] : []),
            ...(statusFilter !== "all" ? [{ label: "Status", value: statusFilter.replace("_", " "), onClear: () => setStatusFilter("all") }] : []),
            ...(typeFilter !== "all" ? [{ label: "Type", value: permitTypeLabel(typeFilter), onClear: () => setTypeFilter("all") }] : []),
          ]}
          totalResults={filtered.length}
          onClearAll={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); }}
        />
      )}

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, passport, ref…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Permit Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {PERMIT_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {PERMIT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>

        <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); setOpen(v); }}>
          <DialogTrigger asChild>
            <Button className="gap-1"><Plus className="h-4 w-4" /> New Permit</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Permit Application</DialogTitle></DialogHeader>
            <PermitForm form={form} setForm={setForm} editId={editId} onSubmit={() => saveMutation.mutate()} pending={saveMutation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader><TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Applicant</TableHead>
            <TableHead>Passport</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Nationality</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={8} className="text-center py-8">Loading…</TableCell></TableRow>
              : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No permits found</TableCell></TableRow>
              : filtered.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.application_reference || "—"}</TableCell>
                  <TableCell className="font-medium">{p.applicant_name}</TableCell>
                  <TableCell>{p.passport_number}</TableCell>
                  <TableCell><Badge variant="outline">{permitTypeLabel(p.permit_type)}</Badge></TableCell>
                  <TableCell>{p.nationality || "—"}</TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell className="text-sm">{format(new Date(p.created_at), "dd/MM/yyyy")}</TableCell>
                  <TableCell>
                    <RecordRowActions
                      kind="permit"
                      table="permits"
                      record={p}
                      onEdit={() => openEdit(p)}
                      invalidateKeys={[["permits-frontdesk"], ["permits-processing"]]}
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

export function PermitForm({
  form, setForm, editId, onSubmit, pending,
}: {
  form: typeof EMPTY_FORM;
  setForm: (f: typeof EMPTY_FORM) => void;
  editId: string | null;
  onSubmit: () => void;
  pending: boolean;
}) {
  const t = form.permit_type;
  const showEmployer = t === "work_permit";
  const showInstitution = t === "student_permit";

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Application Reference</Label><Input value={form.application_reference} onChange={(e) => setForm({ ...form, application_reference: e.target.value })} /></div>
        <div><Label>Permit Type *</Label>
          <Select value={form.permit_type} onValueChange={(v) => setForm({ ...form, permit_type: v })}>
            <SelectTrigger><SelectValue placeholder="Select permit" /></SelectTrigger>
            <SelectContent>
              {PERMIT_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Surname *</Label><Input value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} required /></div>
        <div><Label>Other Names *</Label><Input value={form.other_names} onChange={(e) => setForm({ ...form, other_names: e.target.value })} required /></div>
        <div className="col-span-2"><Label>Full Name (as on passport)</Label><Input value={form.applicant_name} onChange={(e) => setForm({ ...form, applicant_name: e.target.value })} placeholder="Auto-filled from surname + other names" /></div>
        <div><Label>Passport Number *</Label><Input value={form.passport_number} onChange={(e) => setForm({ ...form, passport_number: e.target.value })} required /></div>
        <div><Label>Passport Type</Label>
          <Select value={form.passport_type} onValueChange={(v) => setForm({ ...form, passport_type: v })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ordinary">Ordinary</SelectItem>
              <SelectItem value="diplomatic">Diplomatic</SelectItem>
              <SelectItem value="service">Service / Official</SelectItem>
              <SelectItem value="ecowas">ECOWAS</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Passport Issue Date</Label><DateInput  value={form.passport_issue_date} onChange={(e) => setForm({ ...form, passport_issue_date: e.target.value })} /></div>
        <div><Label>Passport Expiry Date *</Label><DateInput  value={form.passport_expiry_date} onChange={(e) => setForm({ ...form, passport_expiry_date: e.target.value })} required /></div>
        <div><Label>Passport Place of Issue</Label><Input value={form.passport_place_of_issue} onChange={(e) => setForm({ ...form, passport_place_of_issue: e.target.value })} /></div>
        <div><Label>Port of Entry</Label><Input value={form.port_of_entry} onChange={(e) => setForm({ ...form, port_of_entry: e.target.value })} placeholder="e.g. KIA, Aflao, Elubo" /></div>
        <div className="col-span-2"><Label>Nationality *</Label><CountryCombobox value={form.nationality} onValueChange={(v) => setForm({ ...form, nationality: v })} required /></div>
        <div className="col-span-2"><Label>Dual Nationality (if any)</Label><CountryCombobox value={form.dual_nationality} onValueChange={(v) => setForm({ ...form, dual_nationality: v })} /></div>
        <div><Label>Date of Birth *</Label><DateInput  value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} required /></div>
        <div><Label>Place of Birth</Label><Input value={form.place_of_birth} onChange={(e) => setForm({ ...form, place_of_birth: e.target.value })} /></div>
        <div><Label>Gender *</Label>
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
        <div><Label>Telephone *</Label><MultiContactInput mode="list" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><Label>Occupation</Label><Input value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} /></div>
        <div><Label>Permit Category / Sub-type</Label><Input value={form.permit_category} onChange={(e) => setForm({ ...form, permit_category: e.target.value })} placeholder="e.g. New, Renewal" /></div>
      </div>

      {showEmployer && (
        <div className="grid grid-cols-2 gap-3 rounded-md border p-3 bg-muted/30">
          <div className="col-span-2 text-sm font-medium">Employer / Sponsor</div>
          <div><Label>Name</Label><Input value={form.employer_sponsor_name} onChange={(e) => setForm({ ...form, employer_sponsor_name: e.target.value })} /></div>
          <div><Label>Address</Label><Input value={form.employer_sponsor_address} onChange={(e) => setForm({ ...form, employer_sponsor_address: e.target.value })} /></div>
        </div>
      )}

      {showInstitution && (
        <div className="grid grid-cols-2 gap-3 rounded-md border p-3 bg-muted/30">
          <div className="col-span-2 text-sm font-medium">Institution</div>
          <div><Label>Institution Name</Label><Input value={form.institution_name} onChange={(e) => setForm({ ...form, institution_name: e.target.value })} /></div>
          <div><Label>Course of Study</Label><Input value={form.course_of_study} onChange={(e) => setForm({ ...form, course_of_study: e.target.value })} /></div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div><Label>Duration (months) *</Label><Input type="number" min={1} value={form.intended_duration_months} onChange={(e) => setForm({ ...form, intended_duration_months: e.target.value })} required /></div>
        <div><Label>Current Permit Expiry</Label><DateInput  value={form.current_permit_expiry} onChange={(e) => setForm({ ...form, current_permit_expiry: e.target.value })} /></div>
        <div><Label>Requested Start Date *</Label><DateInput  value={form.requested_start_date} onChange={(e) => setForm({ ...form, requested_start_date: e.target.value })} required /></div>
        <div><Label>Fee Charged (GHS) *</Label><FeeInput value={form.fee_charged} onValueChange={(v) => setForm({ ...form, fee_charged: v })} required /></div>
        <div className="col-span-2"><Label>Fee Receipt Number *</Label><Input value={form.fee_receipt_number} onChange={(e) => setForm({ ...form, fee_receipt_number: e.target.value })} placeholder="GRA / GIS receipt #" required /></div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-md border p-3 bg-muted/30">
        <div className="col-span-2 text-sm font-medium">Host / Local Contact in Ghana</div>
        <div><Label>Host Name</Label><Input value={form.host_name} onChange={(e) => setForm({ ...form, host_name: e.target.value })} /></div>
        <div><Label>Host Phone</Label><GhanaPhoneInput value={form.host_phone} onChange={(v) => setForm({ ...form, host_phone: v })} /></div>
        <div className="col-span-2"><Label>Host Address</Label><Input value={form.host_address} onChange={(e) => setForm({ ...form, host_address: e.target.value })} /></div>
      </div>

      <div><Label>Home Address (Ghana) *</Label><Textarea rows={2} value={form.home_address} onChange={(e) => setForm({ ...form, home_address: e.target.value })} required /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Street Name</Label><Input value={form.street_name} onChange={(e) => setForm({ ...form, street_name: e.target.value })} /></div>
        <div><Label>Nearest Landmark</Label><Input value={form.nearest_landmark} onChange={(e) => setForm({ ...form, nearest_landmark: e.target.value })} /></div>
        <div><Label>GhanaPost GPS</Label><Input value={form.ghana_post_gps} onChange={(e) => setForm({ ...form, ghana_post_gps: e.target.value })} placeholder="e.g. GA-123-4567" /></div>
      </div>
      <div><Label>Foreign Address</Label><Textarea rows={2} value={form.foreign_address} onChange={(e) => setForm({ ...form, foreign_address: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Next of Kin</Label><Input value={form.next_of_kin} onChange={(e) => setForm({ ...form, next_of_kin: e.target.value })} /></div>
        <div><Label>Emergency Contact (phone)</Label><ContactPhoneInput compact value={form.emergency_contact} onChange={(v) => setForm({ ...form, emergency_contact: v })} aria-label="Emergency contact phone number" /></div>
      </div>
      <div><Label>Purpose *</Label><Textarea rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} required /></div>
      <div><Label>Previous Permit / Visa History (if any)</Label><Textarea rows={2} value={form.previous_permit_history} onChange={(e) => setForm({ ...form, previous_permit_history: e.target.value })} /></div>

      <ApplicationDocuments recordType="permit" recordId={editId} permitType={form.permit_type} />

      {editId && (
        <div><Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PERMIT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : editId ? "Update Permit" : "Submit Application"}
      </Button>
    </form>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";
import { RecordRowActions } from "@/components/shared/RecordRowActions";
import { FilterSummaryBar } from "@/components/frontdesk/FilterSummaryBar";
import { toast } from "sonner";
import { format } from "date-fns";
import { createNotification } from "@/lib/notifications";
import { PERMIT_TYPES, PROCESSING_PERMIT_STATUSES, permitTypeLabel } from "@/lib/permits";
import { ApplicationDocuments } from "@/components/applications/ApplicationDocuments";
import { ProcessingChecklist, PERMIT_CHECKLIST } from "@/components/applications/ProcessingChecklist";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryTabs, categoryBadge, type ApplicantCategory } from "@/components/processing/CategoryTabs";
import { isEcowasNationality } from "@/lib/countries";

const ALL_STATUSES = ["submitted", "under_review", "approved", "rejected", "collected"];

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

export default function ProcessingPermits() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [category, setCategory] = useState<ApplicantCategory>("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<any>(null);
  const [form, setForm] = useState<{
    status: string; notes: string; fee_charged: string; checklist: Record<string, boolean>;
    ecowas_id_number: string; biometrics_captured: boolean;
    yellow_fever_cert: boolean; police_clearance: boolean; medical_clearance: boolean;
  }>({
    status: "submitted", notes: "", fee_charged: "", checklist: {},
    ecowas_id_number: "", biometrics_captured: false,
    yellow_fever_cert: false, police_clearance: false, medical_clearance: false,
  });

  useEffect(() => {
    const ch = supabase.channel("processing-permits-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "permits" }, () => {
        qc.invalidateQueries({ queryKey: ["permits-processing"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const { data: permits = [], isLoading } = useQuery({
    queryKey: ["permits-processing"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("permits")
        .select("*")
        .in("status", PROCESSING_PERMIT_STATUSES)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editId) return;
      const existing = permits.find((p: any) => p.id === editId);
      const payload: any = {
        status: form.status,
        notes: form.notes,
        processed_by: user?.id,
      };
      if (form.fee_charged !== "") payload.fee_charged = Number(form.fee_charged);
      payload.processing_checklist = form.checklist;
      payload.ecowas_id_number = form.ecowas_id_number || null;
      payload.biometrics_captured = form.biometrics_captured;
      payload.yellow_fever_cert = form.yellow_fever_cert;
      payload.police_clearance = form.police_clearance;
      payload.medical_clearance = form.medical_clearance;
      const { error } = await (supabase as any).from("permits").update(payload).eq("id", editId);
      if (error) throw error;

      if (existing && existing.status !== form.status && (form.status === "approved" || form.status === "rejected")) {
        const { data: roled } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "front_desk"]);
        if (roled) {
          const ids = [...new Set(roled.map((r) => r.user_id))];
          await Promise.all(ids.map((uid) => createNotification({
            userId: uid,
            title: `Permit ${form.status === "approved" ? "Approved" : "Rejected"}`,
            message: `${permitTypeLabel(existing.permit_type)} for ${existing.applicant_name} (${existing.passport_number}) has been ${form.status}.`,
            type: "visa",
            referenceId: editId,
          })));
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permits-processing"] });
      qc.invalidateQueries({ queryKey: ["permits-frontdesk"] });
      toast.success("Permit updated");
      setEditId(null); setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openReview = (p: any) => {
    setForm({
      status: p.status,
      notes: p.notes || "",
      fee_charged: p.fee_charged != null ? String(p.fee_charged) : "",
      checklist: (p.processing_checklist as Record<string, boolean>) || {},
      ecowas_id_number: p.ecowas_id_number || "",
      biometrics_captured: !!p.biometrics_captured,
      yellow_fever_cert: !!p.yellow_fever_cert,
      police_clearance: !!p.police_clearance,
      medical_clearance: !!p.medical_clearance,
    });
    setEditId(p.id);
    setReviewItem(p);
    setOpen(true);
  };

  const catOf = (p: any) => p.applicant_category || (isEcowasNationality(p.nationality) ? "ecowas" : "non_ecowas");

  const filtered = permits.filter((p: any) => {
    const term = search.toLowerCase();
    const matchSearch = !term || p.applicant_name?.toLowerCase().includes(term) || p.passport_number?.toLowerCase().includes(term) || p.application_reference?.toLowerCase().includes(term);
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const matchType = typeFilter === "all" || p.permit_type === typeFilter;
    const matchCat = category === "all" || catOf(p) === category;
    return matchSearch && matchStatus && matchType && matchCat;
  });

  const catCounts = {
    all: permits.length,
    ecowas: permits.filter((p: any) => catOf(p) === "ecowas").length,
    non_ecowas: permits.filter((p: any) => catOf(p) === "non_ecowas").length,
  };

  const hasActive = !!search || statusFilter !== "all" || typeFilter !== "all" || category !== "all";

  return (
    <div className="space-y-4 mt-4">
      <CategoryTabs value={category} onChange={setCategory} counts={catCounts} />

      {hasActive && (
        <FilterSummaryBar
          filters={[
            ...(search ? [{ label: "Search", value: `"${search}"`, onClear: () => setSearch("") }] : []),
            ...(statusFilter !== "all" ? [{ label: "Status", value: statusFilter.replace("_", " "), onClear: () => setStatusFilter("all") }] : []),
            ...(typeFilter !== "all" ? [{ label: "Type", value: permitTypeLabel(typeFilter), onClear: () => setTypeFilter("all") }] : []),
            ...(category !== "all" ? [{ label: "Category", value: category === "ecowas" ? "ECOWAS" : "Non-ECOWAS", onClear: () => setCategory("all") }] : []),
          ]}
          totalResults={filtered.length}
          onClearAll={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); setCategory("all"); }}
        />
      )}

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search permits…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
            <SelectItem value="all">All Pending</SelectItem>
            {PROCESSING_PERMIT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setEditId(null); setOpen(v); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Review Permit Application
              {reviewItem && categoryBadge(catOf(reviewItem))}
            </DialogTitle>
          </DialogHeader>
          {reviewItem && (
            <div className="grid grid-cols-2 gap-2 text-sm border rounded-md p-3 bg-muted/30">
              {reviewItem.application_reference && <div><span className="text-muted-foreground">Reference:</span> {reviewItem.application_reference}</div>}
              <div><span className="text-muted-foreground">Type:</span> {permitTypeLabel(reviewItem.permit_type)}</div>
              <div><span className="text-muted-foreground">Name:</span> {reviewItem.applicant_name}</div>
              <div><span className="text-muted-foreground">Passport:</span> {reviewItem.passport_number}</div>
              {reviewItem.nationality && <div><span className="text-muted-foreground">Nationality:</span> {reviewItem.nationality}</div>}
              {reviewItem.date_of_birth && <div><span className="text-muted-foreground">DOB:</span> {reviewItem.date_of_birth}</div>}
              {reviewItem.gender && <div><span className="text-muted-foreground">Gender:</span> {reviewItem.gender}</div>}
              {reviewItem.marital_status && <div><span className="text-muted-foreground">Marital:</span> {reviewItem.marital_status}</div>}
              {reviewItem.phone && <div><span className="text-muted-foreground">Phone:</span> {reviewItem.phone}</div>}
              {reviewItem.occupation && <div><span className="text-muted-foreground">Occupation:</span> {reviewItem.occupation}</div>}
              {reviewItem.permit_category && <div><span className="text-muted-foreground">Category:</span> {reviewItem.permit_category}</div>}
              {reviewItem.employer_sponsor_name && <div className="col-span-2"><span className="text-muted-foreground">Employer/Sponsor:</span> {reviewItem.employer_sponsor_name}{reviewItem.employer_sponsor_address ? ` — ${reviewItem.employer_sponsor_address}` : ""}</div>}
              {reviewItem.institution_name && <div className="col-span-2"><span className="text-muted-foreground">Institution:</span> {reviewItem.institution_name}{reviewItem.course_of_study ? ` — ${reviewItem.course_of_study}` : ""}</div>}
              {reviewItem.intended_duration_months && <div><span className="text-muted-foreground">Duration:</span> {reviewItem.intended_duration_months} months</div>}
              {reviewItem.current_permit_expiry && <div><span className="text-muted-foreground">Current Expiry:</span> {reviewItem.current_permit_expiry}</div>}
              {reviewItem.requested_start_date && <div><span className="text-muted-foreground">Requested Start:</span> {reviewItem.requested_start_date}</div>}
              {reviewItem.fee_charged != null && <div><span className="text-muted-foreground">Fee:</span> GHS {Number(reviewItem.fee_charged).toFixed(2)}</div>}
              {reviewItem.home_address && <div className="col-span-2"><span className="text-muted-foreground">Home:</span> {reviewItem.home_address}</div>}
              {reviewItem.foreign_address && <div className="col-span-2"><span className="text-muted-foreground">Foreign:</span> {reviewItem.foreign_address}</div>}
              {reviewItem.purpose && <div className="col-span-2"><span className="text-muted-foreground">Purpose:</span> {reviewItem.purpose}</div>}
            </div>
          )}
          {reviewItem && <ApplicationDocuments recordType="permit" recordId={reviewItem.id} permitType={reviewItem.permit_type} readOnly />}
          <ProcessingChecklist items={PERMIT_CHECKLIST} value={form.checklist} onChange={(c) => setForm({ ...form, checklist: c })} />
          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-3">
            <div className="rounded-md border p-3 space-y-3 bg-muted/30">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">GIS Standard Fields</div>
              {reviewItem && catOf(reviewItem) === "ecowas" && (
                <div><Label>ECOWAS ID / Travel Cert No.</Label>
                  <Input value={form.ecowas_id_number} onChange={(e) => setForm({ ...form, ecowas_id_number: e.target.value })} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="flex items-center gap-2"><Checkbox checked={form.biometrics_captured} onCheckedChange={(v) => setForm({ ...form, biometrics_captured: !!v })} /> Biometrics captured</label>
                <label className="flex items-center gap-2"><Checkbox checked={form.yellow_fever_cert} onCheckedChange={(v) => setForm({ ...form, yellow_fever_cert: !!v })} /> Yellow fever certificate</label>
                <label className="flex items-center gap-2"><Checkbox checked={form.police_clearance} onCheckedChange={(v) => setForm({ ...form, police_clearance: !!v })} /> Police clearance</label>
                <label className="flex items-center gap-2"><Checkbox checked={form.medical_clearance} onCheckedChange={(v) => setForm({ ...form, medical_clearance: !!v })} /> Medical clearance</label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Update Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Fee Charged (GHS)</Label>
                <Input type="number" step="0.01" min="0" value={form.fee_charged} onChange={(e) => setForm({ ...form, fee_charged: e.target.value })} />
              </div>
            </div>
            <div><Label>Processing Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Updating…" : "Update Permit"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader><TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Applicant</TableHead>
            <TableHead>Passport</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7} className="text-center py-8">Loading…</TableCell></TableRow>
              : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No permits pending processing</TableCell></TableRow>
              : filtered.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.application_reference || "—"}</TableCell>
                  <TableCell className="font-medium"><div className="flex flex-col gap-0.5">{p.applicant_name}{categoryBadge(catOf(p))}</div></TableCell>
                  <TableCell>{p.passport_number}</TableCell>
                  <TableCell><Badge variant="outline">{permitTypeLabel(p.permit_type)}</Badge></TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell className="text-sm">{format(new Date(p.created_at), "dd/MM/yyyy")}</TableCell>
                  <TableCell>
                    <RecordRowActions
                      kind="permit"
                      table="permits"
                      record={p}
                      onEdit={() => openReview(p)}
                      invalidateKeys={[["permits-processing"], ["permits-frontdesk"]]}
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

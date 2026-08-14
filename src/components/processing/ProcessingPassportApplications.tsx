import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isEcowasNationality } from "@/lib/countries";
import { FilterSummaryBar } from "@/components/frontdesk/FilterSummaryBar";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Edit } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { RecordRowActions } from "@/components/shared/RecordRowActions";
import { toast } from "sonner";
import { format } from "date-fns";
import { createNotification } from "@/lib/notifications";
import { ApplicationDocuments } from "@/components/applications/ApplicationDocuments";
import { ProcessingChecklist, PASSPORT_CHECKLIST } from "@/components/applications/ProcessingChecklist";

const PROCESSING_STATUSES = ["submitted", "processing"];
const ALL_STATUSES = ["submitted", "processing", "ready", "collected", "rejected"];

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

export default function ProcessingPassportApplications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [ecowasOnly, setEcowasOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ status: string; notes: string; checklist: Record<string, boolean>; mfa_review_status: string; mfa_review_notes: string }>({ status: "submitted", notes: "", checklist: {}, mfa_review_status: "pending", mfa_review_notes: "" });

  useEffect(() => {
    const channel = supabase
      .channel("processing-passport-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "passport_applications" }, () => {
        qc.invalidateQueries({ queryKey: ["passport-apps-processing"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const { data: applications = [], isLoading } = useQuery({
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryKey: ["passport-applications-processing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("passport_applications")
        .select("*")
        .in("status", PROCESSING_STATUSES)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editId) return;
      const existing = applications.find((a: any) => a.id === editId);
      const prevMfa = (existing as any)?.mfa_review_status ?? "pending";
      const mfaChanged = prevMfa !== form.mfa_review_status;
      const payload: any = {
        status: form.status,
        notes: form.notes,
        processed_by: user?.id,
        processing_checklist: form.checklist as any,
        mfa_review_status: form.mfa_review_status,
        mfa_review_notes: form.mfa_review_notes || null,
      };
      if (mfaChanged) {
        payload.mfa_reviewed_by = user?.id ?? null;
        payload.mfa_reviewed_at = form.mfa_review_status === "pending" ? null : new Date().toISOString();
      }
      const { error } = await supabase.from("passport_applications")
        .update(payload)
        .eq("id", editId);
      if (error) throw error;

      if (existing && existing.status !== form.status && (form.status === "ready" || form.status === "rejected")) {
        const { data: roledUsers } = await supabase
          .from("user_roles").select("user_id").in("role", ["admin", "front_desk"]);
        if (roledUsers) {
          const uniqueUserIds = [...new Set(roledUsers.map((r) => r.user_id))];
          const statusLabel = form.status === "ready" ? "Ready for Collection" : "Rejected";
          await Promise.all(uniqueUserIds.map((uid) =>
            createNotification({
              userId: uid,
              title: `Passport Application ${statusLabel}`,
              message: `Passport application for ${existing.applicant_name} has been ${form.status === "ready" ? "marked ready for collection" : "rejected"}.`,
              type: "visa",
              referenceId: editId,
            })
          ));
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["passport-applications-processing"] });
      qc.invalidateQueries({ queryKey: ["passport-applications"] });
      toast.success("Application updated");
      setEditId(null);
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [reviewApp, setReviewApp] = useState<any>(null);

  const { data: mfaAuditTrail = [] } = useQuery({
    queryKey: ["mfa-review-audit", reviewApp?.id],
    queryFn: async () => {
      if (!reviewApp?.id) return [];
      const { data, error } = await supabase
        .from("mfa_review_audit")
        .select("*, reviewer:reviewer_id(first_name, last_name, staff_id)")
        .eq("application_id", reviewApp.id)
        .order("reviewed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!reviewApp?.id && open,
  });

  const openReview = (app: any) => {
    setForm({
      status: app.status,
      notes: app.notes || "",
      checklist: (app.processing_checklist as Record<string, boolean>) || {},
      mfa_review_status: app.mfa_review_status || "pending",
      mfa_review_notes: app.mfa_review_notes || "",
    });
    setEditId(app.id);
    setReviewApp(app);
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
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pending</SelectItem>
            {PROCESSING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/^\w/, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        <Toggle pressed={ecowasOnly} onPressedChange={setEcowasOnly} variant="outline" size="sm"
          className="gap-1 whitespace-nowrap data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/30"
          aria-label="Filter ECOWAS only">
          ⭐ ECOWAS
        </Toggle>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setEditId(null); setOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Review Passport Application</DialogTitle></DialogHeader>
          {reviewApp && (
            <div className="grid grid-cols-2 gap-2 text-sm border rounded-md p-3 bg-muted/30">
              <div><span className="text-muted-foreground">Name:</span> {reviewApp.applicant_name}</div>
              <div><span className="text-muted-foreground">Nationality:</span> {reviewApp.nationality}</div>
              <div><span className="text-muted-foreground">Type:</span> {reviewApp.application_type}</div>
              <div><span className="text-muted-foreground">DOB:</span> {reviewApp.date_of_birth}</div>
              {reviewApp.phone && <div><span className="text-muted-foreground">Phone:</span> {reviewApp.phone}</div>}
              {reviewApp.gender && <div><span className="text-muted-foreground">Gender:</span> {reviewApp.gender}</div>}
              {reviewApp.marital_status && <div><span className="text-muted-foreground">Marital Status:</span> {reviewApp.marital_status}</div>}
              {reviewApp.address && <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {reviewApp.address}</div>}
              {reviewApp.foreign_address && <div className="col-span-2"><span className="text-muted-foreground">Foreign Address:</span> {reviewApp.foreign_address}</div>}
              {reviewApp.street_name && <div><span className="text-muted-foreground">Street:</span> {reviewApp.street_name}</div>}
              {reviewApp.nearest_landmark && <div><span className="text-muted-foreground">Landmark:</span> {reviewApp.nearest_landmark}</div>}
              {reviewApp.next_of_kin && <div><span className="text-muted-foreground">Next of Kin:</span> {reviewApp.next_of_kin}</div>}
              {reviewApp.emergency_contact && <div><span className="text-muted-foreground">Emergency:</span> {reviewApp.emergency_contact}</div>}
            </div>
          )}
          {reviewApp && (
            <ApplicationDocuments recordType="passport" recordId={reviewApp.id} readOnly />
          )}

          {reviewApp && (
            <div className="rounded-md border-2 border-primary/30 p-3 space-y-3 bg-primary/5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-primary">MFA Compliance Review</div>
                {(() => {
                  const s = form.mfa_review_status;
                  const cls = s === "approved" ? "bg-green-100 text-green-800"
                    : s === "rejected" ? "bg-red-100 text-red-800"
                    : "bg-yellow-100 text-yellow-800";
                  return <Badge className={cls}>{s}</Badge>;
                })()}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                {reviewApp.surname && <div><span className="text-muted-foreground">Surname:</span> {reviewApp.surname}</div>}
                {reviewApp.other_names && <div><span className="text-muted-foreground">Other Names:</span> {reviewApp.other_names}</div>}
                {reviewApp.email && <div className="col-span-2"><span className="text-muted-foreground">Email:</span> {reviewApp.email}</div>}
                {reviewApp.place_of_birth && <div><span className="text-muted-foreground">Place of Birth:</span> {reviewApp.place_of_birth}</div>}
                {reviewApp.occupation && <div><span className="text-muted-foreground">Occupation:</span> {reviewApp.occupation}</div>}
                {reviewApp.ghana_card_number && <div className="col-span-2"><span className="text-muted-foreground">Ghana Card #:</span> {reviewApp.ghana_card_number}</div>}
                {reviewApp.spouse_name && <div className="col-span-2"><span className="text-muted-foreground">Spouse:</span> {reviewApp.spouse_name}</div>}
                <div><span className="text-muted-foreground">Biometric Consent:</span> {reviewApp.biometric_consent ? "✓ Yes" : "✗ No"}</div>
                <div><span className="text-muted-foreground">Declaration Signed:</span> {reviewApp.declaration_signed ? "✓ Yes" : "✗ No"}</div>
                {reviewApp.declaration_date && <div><span className="text-muted-foreground">Declaration Date:</span> {reviewApp.declaration_date}</div>}
                {reviewApp.witnessing_officer_name && <div className="col-span-2"><span className="text-muted-foreground">Witnessed By:</span> {reviewApp.witnessing_officer_rank ? `${reviewApp.witnessing_officer_rank} ` : ""}{reviewApp.witnessing_officer_name}</div>}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" size="sm" variant={form.mfa_review_status === "approved" ? "default" : "outline"}
                  className={form.mfa_review_status === "approved" ? "bg-green-600 hover:bg-green-700" : ""}
                  onClick={() => setForm({ ...form, mfa_review_status: "approved" })}>
                  Approve
                </Button>
                <Button type="button" size="sm" variant={form.mfa_review_status === "rejected" ? "destructive" : "outline"}
                  onClick={() => setForm({ ...form, mfa_review_status: "rejected" })}>
                  Reject
                </Button>
                <Button type="button" size="sm" variant={form.mfa_review_status === "pending" ? "secondary" : "ghost"}
                  onClick={() => setForm({ ...form, mfa_review_status: "pending" })}>
                  Mark Pending
                </Button>
              </div>

              <div>
                <Label>Reviewer Notes</Label>
                <Textarea
                  value={form.mfa_review_notes}
                  onChange={(e) => setForm({ ...form, mfa_review_notes: e.target.value })}
                  rows={2}
                  placeholder="Comments on MFA compliance, missing items, or rejection reason..."
                />
              </div>

              {reviewApp.mfa_reviewed_at && (
                <div className="text-xs text-muted-foreground">
                  Last reviewed {format(new Date(reviewApp.mfa_reviewed_at), "dd/MM/yyyy HH:mm")}
                </div>
              )}

              <div className="border-t pt-3 mt-2">
                <div className="text-xs font-semibold mb-2">MFA Review Audit Trail</div>
                {mfaAuditTrail.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No prior reviews recorded.</div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {mfaAuditTrail.map((a: any) => {
                      const r = a.reviewer;
                      const who = r ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() + (r.staff_id ? ` (${r.staff_id})` : "") : "System";
                      const colorMap: Record<string, string> = {
                        approved: "bg-green-100 text-green-800",
                        rejected: "bg-red-100 text-red-800",
                        pending: "bg-amber-100 text-amber-800",
                      };
                      return (
                        <div key={a.id} className="text-xs rounded border p-2 bg-muted/30">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={colorMap[a.previous_status ?? "pending"] ?? ""}>
                                {a.previous_status ?? "—"}
                              </Badge>
                              <span className="text-muted-foreground">→</span>
                              <Badge variant="outline" className={colorMap[a.new_status] ?? ""}>
                                {a.new_status}
                              </Badge>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(a.reviewed_at), "dd/MM/yyyy HH:mm")}
                            </span>
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            By: <span className="text-foreground font-medium">{who}</span>
                          </div>
                          {a.reviewer_notes && (
                            <div className="mt-1">
                              <span className="text-muted-foreground">Comment:</span>{" "}
                              <span className="text-foreground">{a.reviewer_notes}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-3">
            <ProcessingChecklist
              items={PASSPORT_CHECKLIST}
              value={form.checklist}
              onChange={(checklist) => setForm({ ...form, checklist })}
            />
            <div><Label>Update Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Processing Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Updating..." : "Update Application"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>MFA Review</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No passport applications pending processing</TableCell></TableRow>
            ) : filtered.map((app: any) => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">{app.applicant_name}</TableCell>
                <TableCell>{app.nationality}</TableCell>
                <TableCell><Badge variant="outline">{app.application_type}</Badge></TableCell>
                <TableCell>{statusBadge(app.status)}</TableCell>
                <TableCell>
                  {(() => {
                    const s = app.mfa_review_status || "pending";
                    const cls = s === "approved" ? "bg-green-100 text-green-800"
                      : s === "rejected" ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800";
                    return <Badge className={cls}>{s}</Badge>;
                  })()}
                </TableCell>
                <TableCell className="text-sm">{format(new Date(app.created_at), "dd/MM/yyyy")}</TableCell>
                <TableCell>
                  <RecordRowActions
                    kind="passport_application"
                    table="passport_applications"
                    record={app}
                    onEdit={() => openReview(app)}
                    invalidateKeys={[["passport-applications-processing"], ["passport-applications"]]}
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
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { isEcowasNationality } from "@/lib/countries";
import { FilterSummaryBar } from "@/components/frontdesk/FilterSummaryBar";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Edit, CheckCircle, XCircle } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { RecordRowActions } from "@/components/shared/RecordRowActions";
import { toast } from "sonner";
import { format } from "date-fns";
import { createNotification } from "@/lib/notifications";
import { ApplicationDocuments } from "@/components/applications/ApplicationDocuments";
import { ProcessingChecklist, VISA_CHECKLIST } from "@/components/applications/ProcessingChecklist";

const PROCESSING_STATUSES = ["submitted", "under_review"];
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

export default function ProcessingVisaApplications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [ecowasOnly, setEcowasOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ status: string; notes: string; checklist: Record<string, boolean> }>({ status: "submitted", notes: "", checklist: {} });

  useEffect(() => {
    const channel = supabase
      .channel("processing-visa-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "visa_applications" }, () => {
        qc.invalidateQueries({ queryKey: ["visa-apps-processing"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["visa-applications-processing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visa_applications")
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
      const { error } = await supabase.from("visa_applications")
        .update({ status: form.status, notes: form.notes, processed_by: user?.id })
        .eq("id", editId);
      if (error) throw error;

      if (existing && existing.status !== form.status && (form.status === "approved" || form.status === "rejected")) {
        const { data: roledUsers } = await supabase
          .from("user_roles").select("user_id").in("role", ["admin", "front_desk"]);
        if (roledUsers) {
          const uniqueUserIds = [...new Set(roledUsers.map((r) => r.user_id))];
          await Promise.all(uniqueUserIds.map((uid) =>
            createNotification({
              userId: uid,
              title: `Visa Application ${form.status === "approved" ? "Approved" : "Rejected"}`,
              message: `Visa application for ${existing.applicant_name} (${existing.passport_number}) has been ${form.status}.`,
              type: "visa",
              referenceId: editId,
            })
          ));
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visa-applications-processing"] });
      qc.invalidateQueries({ queryKey: ["visa-applications"] });
      toast.success("Application updated");
      setEditId(null);
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [reviewApp, setReviewApp] = useState<any>(null);

  const openReview = (app: any) => {
    setForm({ status: app.status, notes: app.notes || "" });
    setEditId(app.id);
    setReviewApp(app);
    setOpen(true);
  };

  const filtered = applications.filter((a: any) => {
    const matchesSearch = a.applicant_name.toLowerCase().includes(search.toLowerCase()) ||
      a.passport_number.toLowerCase().includes(search.toLowerCase());
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
    under_review: applications.filter((a: any) => a.status === "under_review").length,
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pending", value: summary.total, color: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-300 dark:border-indigo-700", bg: "bg-indigo-50/50 dark:bg-indigo-950/20" },
          { label: "Submitted", value: summary.submitted, color: "text-blue-600 dark:text-blue-400", border: "border-blue-300 dark:border-blue-700", bg: "bg-blue-50/50 dark:bg-blue-950/20" },
          { label: "Under Review", value: summary.under_review, color: "text-yellow-600 dark:text-yellow-400", border: "border-yellow-300 dark:border-yellow-700", bg: "bg-yellow-50/50 dark:bg-yellow-950/20" },
        ].map((s) => (
          <Card key={s.label} className={`${s.border} ${s.bg}`}><CardContent className="p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </CardContent></Card>
        ))}
      </div>

      {hasActiveFilters && (
        <FilterSummaryBar filters={activeFiltersList} totalResults={filtered.length} onClearAll={clearAllFilters} />
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or passport..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pending</SelectItem>
            {PROCESSING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ").replace(/^\w/, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        <Toggle pressed={ecowasOnly} onPressedChange={setEcowasOnly} variant="outline" size="sm"
          className="gap-1 whitespace-nowrap data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/30"
          aria-label="Filter ECOWAS only">
          ⭐ ECOWAS
        </Toggle>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setEditId(null); } setOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Review Visa Application</DialogTitle></DialogHeader>
          {reviewApp && (
            <div className="grid grid-cols-2 gap-2 text-sm border rounded-md p-3 bg-muted/30">
              <div><span className="text-muted-foreground">Name:</span> {reviewApp.applicant_name}</div>
              <div><span className="text-muted-foreground">Passport:</span> {reviewApp.passport_number}</div>
              <div><span className="text-muted-foreground">Nationality:</span> {reviewApp.nationality}</div>
              <div><span className="text-muted-foreground">Visa Type:</span> {reviewApp.visa_type}</div>
              {reviewApp.phone && <div><span className="text-muted-foreground">Phone:</span> {reviewApp.phone}</div>}
              {reviewApp.gender && <div><span className="text-muted-foreground">Gender:</span> {reviewApp.gender}</div>}
              {reviewApp.date_of_birth && <div><span className="text-muted-foreground">DOB:</span> {reviewApp.date_of_birth}</div>}
              {reviewApp.marital_status && <div><span className="text-muted-foreground">Marital Status:</span> {reviewApp.marital_status}</div>}
              {reviewApp.home_address && <div className="col-span-2"><span className="text-muted-foreground">Home Address:</span> {reviewApp.home_address}</div>}
              {reviewApp.foreign_address && <div className="col-span-2"><span className="text-muted-foreground">Foreign Address:</span> {reviewApp.foreign_address}</div>}
              {reviewApp.street_name && <div><span className="text-muted-foreground">Street:</span> {reviewApp.street_name}</div>}
              {reviewApp.nearest_landmark && <div><span className="text-muted-foreground">Landmark:</span> {reviewApp.nearest_landmark}</div>}
              {reviewApp.next_of_kin && <div><span className="text-muted-foreground">Next of Kin:</span> {reviewApp.next_of_kin}</div>}
              {reviewApp.emergency_contact && <div><span className="text-muted-foreground">Emergency:</span> {reviewApp.emergency_contact}</div>}
              {reviewApp.entry_date && <div><span className="text-muted-foreground">Entry:</span> {reviewApp.entry_date}</div>}
              {reviewApp.exit_date && <div><span className="text-muted-foreground">Exit:</span> {reviewApp.exit_date}</div>}
              {reviewApp.purpose && <div className="col-span-2"><span className="text-muted-foreground">Purpose:</span> {reviewApp.purpose}</div>}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-3">
            <div><Label>Update Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
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
              <TableHead>Passport</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No applications pending processing</TableCell></TableRow>
            ) : filtered.map((app: any) => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">{app.applicant_name}</TableCell>
                <TableCell>{app.passport_number}</TableCell>
                <TableCell>{app.nationality}</TableCell>
                <TableCell><Badge variant="outline">{app.visa_type}</Badge></TableCell>
                <TableCell>{statusBadge(app.status)}</TableCell>
                <TableCell className="text-sm">{format(new Date(app.created_at), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <RecordRowActions
                    kind="visa_application"
                    table="visa_applications"
                    record={app}
                    onEdit={() => openReview(app)}
                    invalidateKeys={[["visa-applications-processing"], ["visa-applications"]]}
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
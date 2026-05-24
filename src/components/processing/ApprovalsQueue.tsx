import { useState, useEffect, useMemo } from "react";
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
import { Search, ShieldCheck, CheckCircle2, XCircle, MessageSquareWarning, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";


type AppKind = "visa" | "extensions" | "passport" | "official" | "enquiry";

const TABLE_FOR: Record<AppKind, string> = {
  visa: "visa_applications",
  extensions: "visa_extensions",
  passport: "passport_applications",
  official: "official_applications",
  enquiry: "enquiry_applications",
};

const NAME_FIELD: Record<AppKind, string> = {
  visa: "applicant_name",
  extensions: "applicant_name",
  passport: "applicant_name",
  official: "applicant_name",
  enquiry: "applicant_name",
};

const STATUSES = ["submitted", "under_review", "approved", "rejected", "queried", "collected"];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
    approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
    queried: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    collected: "bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-200",
    pending: "bg-blue-100 text-blue-800",
  };
  return <Badge className={map[status] || ""}>{status?.replace("_", " ")}</Badge>;
}

const ALLOWED_ROLES = ["admin", "oic", "2ic", "supervisor", "staff_officer"];
const VIEW_ONLY_ROLES = ["shift_supervisor", "deputy_shift_supervisor"];

export default function ApprovalsQueue() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [kind, setKind] = useState<AppKind>("visa");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [reviewApp, setReviewApp] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<string>("approved");
  const [comment, setComment] = useState("");

  const canApprove = !!role && ALLOWED_ROLES.includes(role);
  const canView = canApprove || (!!role && VIEW_ONLY_ROLES.includes(role));

  const table = TABLE_FOR[kind];
  const nameField = NAME_FIELD[kind];

  useEffect(() => {
    if (!canView) return;
    const channel = supabase
      .channel(`approvals-${kind}-realtime`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        qc.invalidateQueries({ queryKey: ["approvals", kind] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [kind, table, qc, canView]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["approvals", kind],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(table)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: canView,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!reviewApp) return;
      const update: Record<string, any> = { status: decision };
      // Append comment to notes (preserve any existing notes)
      if (comment.trim()) {
        const stamp = `[${format(new Date(), "dd MMM yyyy HH:mm")}] ${decision.toUpperCase()} by supervisor: ${comment.trim()}`;
        update.notes = reviewApp.notes ? `${reviewApp.notes}\n${stamp}` : stamp;
      }
      // For passport_applications + others, processed_by trigger handles it; we stamp it explicitly
      update.processed_by = user?.id;
      const { error } = await (supabase as any).from(table).update(update).eq("id", reviewApp.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals", kind] });
      qc.invalidateQueries({ queryKey: [`${kind}-applications`] });
      toast.success(`Application ${decision}`);
      setOpen(false);
      setReviewApp(null);
      setComment("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openReview = (app: any) => {
    setReviewApp(app);
    setDecision(app.status === "submitted" || app.status === "under_review" ? "approved" : app.status);
    setComment("");
    setOpen(true);
  };

  const summary = useMemo(() => {
    const s = { total: rows.length, pending: 0, approved: 0, rejected: 0, queried: 0 };
    for (const r of rows as any[]) {
      if (r.status === "submitted" || r.status === "under_review") s.pending++;
      else if (r.status === "approved") s.approved++;
      else if (r.status === "rejected") s.rejected++;
      else if (r.status === "queried") s.queried++;
    }
    return s;
  }, [rows]);

  const filtered = (rows as any[]).filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || String(r[nameField] ?? "").toLowerCase().includes(q) ||
      String(r.passport_number ?? "").toLowerCase().includes(q) ||
      String(r.nationality ?? "").toLowerCase().includes(q);
    let matchesStatus = true;
    if (statusFilter === "pending") {
      matchesStatus = r.status === "submitted" || r.status === "under_review";
    } else if (statusFilter !== "all") {
      matchesStatus = r.status === statusFilter;
    }
    return matchesSearch && matchesStatus;
  });

  if (!canView) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        Approvals queue is restricted to command-tier roles.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" />
        Command-tier review of all Front Desk applications across departments.
      </div>

      {/* Application kind filter */}
      <div className="flex items-center gap-2">
        <Label className="text-sm whitespace-nowrap">Application type</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as AppKind)}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="visa">Visa</SelectItem>
            <SelectItem value="extensions">Extensions</SelectItem>
            <SelectItem value="passport">Passport</SelectItem>
            <SelectItem value="official">Official</SelectItem>
            <SelectItem value="enquiry">Enquiry</SelectItem>
          </SelectContent>
        </Select>
      </div>


      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total", value: summary.total, color: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-300 dark:border-indigo-700", bg: "bg-indigo-50/50 dark:bg-indigo-950/20" },
          { label: "Pending", value: summary.pending, color: "text-blue-600 dark:text-blue-400", border: "border-blue-300 dark:border-blue-700", bg: "bg-blue-50/50 dark:bg-blue-950/20" },
          { label: "Approved", value: summary.approved, color: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-300 dark:border-emerald-700", bg: "bg-emerald-50/50 dark:bg-emerald-950/20" },
          { label: "Rejected", value: summary.rejected, color: "text-rose-600 dark:text-rose-400", border: "border-rose-300 dark:border-rose-700", bg: "bg-rose-50/50 dark:bg-rose-950/20" },
          { label: "Queried", value: summary.queried, color: "text-amber-600 dark:text-amber-400", border: "border-amber-300 dark:border-amber-700", bg: "bg-amber-50/50 dark:bg-amber-950/20" },
        ].map((s) => (
          <Card key={s.label} className={`${s.border} ${s.bg}`}><CardContent className="p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </CardContent></Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search applicant, passport, nationality…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending review</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Review dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) setReviewApp(null); setOpen(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Review Application</DialogTitle></DialogHeader>
          {reviewApp && (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm border rounded-md p-3 bg-muted/30">
                <div><span className="text-muted-foreground">Applicant:</span> <strong>{reviewApp[nameField]}</strong></div>
                <div><span className="text-muted-foreground">Status:</span> {statusBadge(reviewApp.status)}</div>
                {reviewApp.passport_number && <div><span className="text-muted-foreground">Passport:</span> {reviewApp.passport_number}</div>}
                {reviewApp.nationality && <div><span className="text-muted-foreground">Nationality:</span> {reviewApp.nationality}</div>}
                {reviewApp.visa_type && <div><span className="text-muted-foreground">Visa Type:</span> {reviewApp.visa_type}</div>}
                {reviewApp.application_type && <div><span className="text-muted-foreground">Type:</span> {reviewApp.application_type}</div>}
                {reviewApp.official_type && <div><span className="text-muted-foreground">Official Type:</span> {reviewApp.official_type}</div>}
                {reviewApp.enquiry_type && <div><span className="text-muted-foreground">Enquiry Type:</span> {reviewApp.enquiry_type}</div>}
                {reviewApp.subject && <div className="col-span-2"><span className="text-muted-foreground">Subject:</span> {reviewApp.subject}</div>}
                {reviewApp.purpose && <div className="col-span-2"><span className="text-muted-foreground">Purpose:</span> {reviewApp.purpose}</div>}
                {reviewApp.phone && <div><span className="text-muted-foreground">Phone:</span> {reviewApp.phone}</div>}
                {reviewApp.gender && <div><span className="text-muted-foreground">Gender:</span> {reviewApp.gender}</div>}
                {reviewApp.date_of_birth && <div><span className="text-muted-foreground">DOB:</span> {reviewApp.date_of_birth}</div>}
                {reviewApp.created_at && <div className="col-span-2"><span className="text-muted-foreground">Submitted:</span> {format(new Date(reviewApp.created_at), "dd MMM yyyy HH:mm")}</div>}
                {reviewApp.notes && <div className="col-span-2 whitespace-pre-wrap"><span className="text-muted-foreground">Existing notes:</span><br />{reviewApp.notes}</div>}
              </div>

              {canApprove ? (
                <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-3 mt-3">
                  <div>
                    <Label>Decision</Label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <Button type="button" variant={decision === "approved" ? "default" : "outline"} onClick={() => setDecision("approved")} className="gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Approve
                      </Button>
                      <Button type="button" variant={decision === "rejected" ? "default" : "outline"} onClick={() => setDecision("rejected")} className="gap-1">
                        <XCircle className="h-4 w-4" /> Reject
                      </Button>
                      <Button type="button" variant={decision === "queried" ? "default" : "outline"} onClick={() => setDecision("queried")} className="gap-1">
                        <MessageSquareWarning className="h-4 w-4" /> Query
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>Comment / Reason {decision !== "approved" && <span className="text-destructive">*</span>}</Label>
                    <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} required={decision !== "approved"} placeholder={decision === "queried" ? "What clarification is needed?" : decision === "rejected" ? "Reason for rejection" : "Optional remark"} />
                  </div>
                  <Button type="submit" className="w-full" disabled={updateMutation.isPending || (decision !== "approved" && !comment.trim())}>
                    {updateMutation.isPending ? "Saving…" : `Confirm ${decision}`}
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-muted-foreground mt-3">View only — your role does not permit approval actions.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Table */}
      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead className="hidden sm:table-cell">Nationality</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Submitted</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No applications match the current filters</TableCell></TableRow>
            ) : filtered.map((app: any) => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">
                  {app[nameField]}
                  {app.passport_number && <div className="text-xs text-muted-foreground">{app.passport_number}</div>}
                </TableCell>
                <TableCell className="hidden sm:table-cell">{app.nationality}</TableCell>
                <TableCell>{statusBadge(app.status)}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{app.created_at ? format(new Date(app.created_at), "dd MMM yyyy") : ""}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openReview(app)} className="gap-1">
                    <Eye className="h-4 w-4" /> {canApprove ? "Review" : "View"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>
    </div>
  );
}

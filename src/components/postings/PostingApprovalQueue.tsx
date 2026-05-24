import { useState } from "react";
import { createNotification, getUserIdFromProfileId } from "@/lib/notifications";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { Search, CheckCircle2, XCircle, Clock, FileText, ArrowRight, Download, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApprovalAuditTrail } from "@/components/audit/ApprovalAuditTrail";
import { generatePostingLetter, downloadPdf } from "@/lib/branded-letter-pdf";

export function PostingApprovalQueue() {
  const { user, isAdmin, isAdminOrSupervisor } = useAuth();
  const canManage = isAdmin || isAdminOrSupervisor;
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [comments, setComments] = useState("");
  const [editRecord, setEditRecord] = useState<any>(null);
  const [editEffectiveDate, setEditEffectiveDate] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [deleteRecord, setDeleteRecord] = useState<any>(null);

  const { data: adminProfile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["postings-transfers", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("postings_transfers")
        .select("*, profiles(first_name, last_name, staff_id), from_dept:departments!postings_transfers_from_department_id_fkey(name), to_dept:departments!postings_transfers_to_department_id_fkey(name)")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "pending" | "approved" | "rejected");
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("postings_transfers")
        .update({ status: action, approved_by: adminProfile?.id ?? null, remarks: comments || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["postings-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["approval-audit"] });
      // Send notification to the staff member
      if (selectedRecord) {
        const userId = await getUserIdFromProfileId(selectedRecord.profile_id);
        if (userId) {
          await createNotification({
            userId,
            title: `${selectedRecord.type === "posting" ? "Posting" : "Transfer"} ${action === "approved" ? "Approved" : "Rejected"}`,
            message: `Your ${selectedRecord.type} request has been ${action}.${comments ? ` Comment: ${comments}` : ""}`,
            type: "posting",
            referenceId: selectedRecord.id,
          });
        }
      }
      setSelectedRecord(null);
      setComments("");
      toast.success(`Request ${action}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, effective_date, remarks }: { id: string; effective_date: string; remarks: string }) => {
      const { error } = await supabase
        .from("postings_transfers")
        .update({ effective_date, remarks: remarks || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["postings-transfers"] });
      setEditRecord(null);
      toast.success("Record updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("postings_transfers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["postings-transfers"] });
      setDeleteRecord(null);
      toast.success("Record deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = records.filter((r: any) => {
    const name = `${r.profiles?.last_name} ${r.profiles?.first_name} ${r.profiles?.staff_id}`.toLowerCase();
    return !search || name.includes(search.toLowerCase());
  });

  const pending = records.filter((r: any) => r.status === "pending").length;

  const statusColor = (s: string) => {
    switch (s) {
      case "approved": return "bg-emerald-100 text-emerald-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-amber-100 text-amber-800";
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3"><Clock className="h-8 w-8 text-amber-600" /><div><div className="text-2xl font-bold">{pending}</div><div className="text-xs text-muted-foreground">Pending</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-emerald-600" /><div><div className="text-2xl font-bold">{records.filter((r: any) => r.status === "approved").length}</div><div className="text-xs text-muted-foreground">Approved</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><XCircle className="h-8 w-8 text-destructive" /><div><div className="text-2xl font-bold">{records.filter((r: any) => r.status === "rejected").length}</div><div className="text-xs text-muted-foreground">Rejected</div></div></CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending">Reviewing</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden sm:table-cell">From → To</TableHead>
                <TableHead className="hidden sm:table-cell">Effective</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No records</TableCell></TableRow>
              ) : (
                filtered.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.profiles?.last_name}, {r.profiles?.first_name}</div>
                      <div className="text-xs text-muted-foreground">{r.profiles?.staff_id}</div>
                    </TableCell>
                    <TableCell className="capitalize">{r.type}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">
                      <span className="flex items-center gap-1">
                        {r.from_dept?.name ?? "—"} <ArrowRight className="h-3 w-3 text-muted-foreground" /> {r.to_dept?.name ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">{format(new Date(r.effective_date), "PP")}</TableCell>
                    <TableCell><Badge variant="secondary" className={statusColor(r.status)}>{r.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {r.status === "pending" && (
                          <Button variant="outline" size="sm" onClick={() => { setSelectedRecord(r); setComments(""); }}>
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        {(r.status === "approved" || r.status === "rejected") && (
                          <Button
                            variant="outline"
                            size="sm"
                            title="Download letter"
                            onClick={() => {
                              const doc = generatePostingLetter({
                                staffName: `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim(),
                                staffId: r.profiles?.staff_id ?? "—",
                                fromDepartment: r.from_dept?.name ?? undefined,
                                toDepartment: r.to_dept?.name ?? undefined,
                                effectiveDate: r.effective_date,
                                status: r.status,
                                comments: r.remarks ?? undefined,
                                reference: `PT-${r.id.slice(0, 8).toUpperCase()}`,
                              });
                              downloadPdf(doc, `posting-${r.profiles?.staff_id ?? r.id.slice(0,6)}.pdf`);
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selectedRecord} onOpenChange={(open) => { if (!open) setSelectedRecord(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review Posting/Transfer</DialogTitle></DialogHeader>
          {selectedRecord && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Staff:</span><p className="font-medium">{selectedRecord.profiles?.last_name}, {selectedRecord.profiles?.first_name}</p></div>
                <div><span className="text-muted-foreground">Type:</span><p className="font-medium capitalize">{selectedRecord.type}</p></div>
                <div><span className="text-muted-foreground">From:</span><p className="font-medium">{selectedRecord.from_dept?.name ?? "—"}</p></div>
                <div><span className="text-muted-foreground">To:</span><p className="font-medium">{selectedRecord.to_dept?.name ?? "—"}</p></div>
                <div className="col-span-2"><span className="text-muted-foreground">Effective:</span><p className="font-medium">{format(new Date(selectedRecord.effective_date), "PPP")}</p></div>
              </div>
              {selectedRecord.remarks && (
                <div className="text-sm"><span className="text-muted-foreground">Remarks:</span><p className="mt-1 p-2 bg-muted rounded text-foreground">{selectedRecord.remarks}</p></div>
              )}
              <div>
                <Label>Admin Comments</Label>
                <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} placeholder="Add comments..." />
              </div>
              <div className="border-t pt-3">
                <h4 className="text-sm font-semibold mb-1">Approval History</h4>
                <ApprovalAuditTrail entityType="posting_transfer" entityId={selectedRecord.id} />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 gap-1" onClick={() => approveMutation.mutate({ id: selectedRecord.id, action: "approved" })} disabled={approveMutation.isPending}>
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
                <Button variant="destructive" className="flex-1 gap-1" onClick={() => approveMutation.mutate({ id: selectedRecord.id, action: "rejected" })} disabled={approveMutation.isPending}>
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
